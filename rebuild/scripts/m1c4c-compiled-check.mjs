import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let unexpectedOutbound = 0;
const deny = () => { unexpectedOutbound++; throw new Error('Unexpected outbound call'); };
const originalFetch = globalThis.fetch;
globalThis.fetch = deny;
// Block alternative native outbound paths too; fixtures never need sockets or DNS.
const restored = [];
for (const [name, methods] of [
  ['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
  ['node:dns', ['lookup', 'resolve']], ['node:dns/promises', ['lookup', 'resolve']],
]) {
  const module = require(name);
  for (const method of methods) { const original = module[method]; module[method] = deny; restored.push(() => { module[method] = original; }); }
}
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
let logs = 0;
for (const method of Object.keys(originalConsole)) console[method] = () => { logs++; };
const endpoint = 'https://appleid.apple.com/auth/token';
const fixedTime = new Date('2026-10-01T12:00:00.000Z');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
try {
  // Emitted CommonJS -> installed JOSE ESM, native Node only (no tsx/Vitest loader).
  const { jwtVerify } = require('jose');
  const { createAppleCodeTransport, createAppleCodeTransportForTest } = require('../services/api/dist/appleCodeTransport.js');
  const { createApp } = require('../services/api/dist/app.js');
  const old = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const next = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const config = { clientId: 'com.Example.FitQuest.Compiled', teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: old.privateKey };
  const source = { id_token: ' opaque compiled identity ', access_token: ' opaque access +/&= ', refresh_token: ' opaque refresh +/&= ', token_type: 'Bearer', expires_in: 3600 };
  const response = () => new Response(JSON.stringify({ ...source, authenticated: true, sub: 'untrusted' }), { headers: { 'content-type': 'application/json' } });
  let dispatches = 0;
  let issuedAt = fixedTime.getTime() / 1000;
  let signingPublicKey = old.publicKey;
  let keyId = config.keyId;
  const checkRequest = async (url, options) => {
    dispatches++;
    assert.equal(url, endpoint);
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.ok(options.signal instanceof AbortSignal);
    const form = new URLSearchParams(options.body);
    assert.deepEqual([...form.keys()].sort(), ['client_id', 'client_secret', 'code', 'grant_type']);
    assert.equal(form.get('client_id'), config.clientId); assert.equal(form.get('grant_type'), 'authorization_code');
    assert.ok(form.get('code') === ' invented native +/&= code ');
    const secret = form.get('client_secret');
    const { payload, protectedHeader } = await jwtVerify(secret, signingPublicKey, { algorithms: ['ES256'], issuer: config.teamId,
      audience: 'https://appleid.apple.com', subject: config.clientId, currentDate: new Date(issuedAt * 1000) });
    assert.deepEqual(protectedHeader, { alg: 'ES256', kid: keyId });
    assert.deepEqual(payload, { iss: config.teamId, sub: config.clientId, aud: 'https://appleid.apple.com', iat: issuedAt, exp: issuedAt + 300 });
    const parts = secret.split('.');
    assert.ok(verify('sha256', Buffer.from(parts.slice(0, 2).join('.')), { key: signingPublicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')));
    return response();
  };
  const nativeCode = ' invented native +/&= code ';
  const build = (fetcher, settings = config) => createAppleCodeTransportForTest(settings, { now: () => fixedTime, fetch: fetcher });
  createAppleCodeTransport(config);
  const offline = build(checkRequest);
  assert.equal(unexpectedOutbound, 0); assert.equal(dispatches, 0);
  assert.deepEqual(await offline.exchange(nativeCode), { kind: 'parsed', credentials: { identityToken: source.id_token,
    accessToken: source.access_token, refreshToken: source.refresh_token, tokenType: 'Bearer', accessTokenExpiresInSeconds: 3600 } });
  signingPublicKey = next.publicKey; keyId = 'NEXT123456';
  assert.equal((await build(checkRequest, { ...config, keyId, privateKey: next.privateKey }).exchange(nativeCode)).kind, 'parsed');
  // Intercept the runtime path before constructing it; it must sign/POST only the fixed endpoint.
  issuedAt = Math.floor(Date.now() / 1000); signingPublicKey = old.publicKey; keyId = config.keyId;
  globalThis.fetch = checkRequest;
  const runtime = createAppleCodeTransport(config);
  const beforeRuntime = dispatches;
  assert.equal((await runtime.exchange(nativeCode)).kind, 'parsed');
  assert.equal(dispatches, beforeRuntime + 1);
  globalThis.fetch = deny;
  const invalid = build(deny);
  assert.deepEqual(await invalid.exchange(''), { kind: 'invalid_input' });
  const caller = new AbortController(); caller.abort('sensitive reason');
  assert.deepEqual(await invalid.exchange(nativeCode, caller.signal), { kind: 'cancelled' });
  assert.throws(() => build(deny, { ...config, privateKey: old.publicKey }), { message: 'Invalid Apple code transport configuration' });
  assert.throws(() => build(deny, { ...config, endpoint: 'https://attacker.example' }), { message: 'Invalid Apple code transport configuration' });
  assert.deepEqual(await createAppleCodeTransportForTest(config, { now: () => new Date(NaN), fetch: deny }).exchange(nativeCode), { kind: 'invalid_configuration' });

  for (const [status, expected] of [
    [302, { kind: 'unavailable', reason: 'redirect' }], [400, { kind: 'provider_rejected' }],
    [429, { kind: 'unavailable', reason: 'http' }], [503, { kind: 'unavailable', reason: 'http' }],
  ]) {
    let calls = 0;
    assert.deepEqual(await build(async () => { calls++; return new Response('sensitive error body', { status, headers: { location: 'https://attacker.example' } }); }).exchange(nativeCode), expected);
    assert.equal(calls, 1);
  }
  assert.deepEqual(await build(async () => { throw new Error('sensitive provider exception'); }).exchange(nativeCode), { kind: 'unavailable', reason: 'network' });
  for (const body of ['{sensitive malformed json', JSON.stringify({ ...source, refresh_token: undefined }), JSON.stringify({ ...source, expires_in: '3600' })]) {
    assert.deepEqual(await build(async () => new Response(body, { headers: { 'content-type': 'application/json' } })).exchange(nativeCode), { kind: 'unavailable', reason: 'response' });
  }
  let oversizeCancelled = 0;
  const oversize = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(200)); controller.enqueue(new Uint8Array(100)); }, cancel() { oversizeCancelled++; } });
  assert.deepEqual(await build(async () => new Response(oversize, { headers: { 'content-type': 'application/json' } }), { ...config, maxResponseBytes: 256 }).exchange(nativeCode), { kind: 'unavailable', reason: 'response' });
  assert.equal(oversizeCancelled, 1); assert.equal(oversize.locked, false);
  let stalledCancelled = 0;
  const stalled = new ReadableStream({ cancel() { stalledCancelled++; return new Promise(() => {}); } });
  assert.deepEqual(await build(async () => new Response(stalled, { headers: { 'content-type': 'application/json' } }), { ...config, timeoutMs: 100 }).exchange(nativeCode), { kind: 'unavailable', reason: 'timeout' });
  assert.equal(stalledCancelled, 1); assert.equal(stalled.locked, false);
  const gate = deferred(); let requests = 0; let requestSignal;
  const timeoutResult = await build(async (_url, options) => { requests++; requestSignal = options.signal; return gate.promise; }, { ...config, timeoutMs: 100 }).exchange(nativeCode);
  assert.deepEqual(timeoutResult, { kind: 'unavailable', reason: 'timeout' }); assert.equal(requestSignal.aborted, true);
  const lateCancelled = deferred();
  const late = new ReadableStream({ cancel() { lateCancelled.resolve(); } });
  gate.resolve(new Response(late)); await lateCancelled.promise;
  assert.equal(requests, 1); assert.equal(late.locked, false);
  const cancelGate = deferred(); const entered = deferred(); const abort = new AbortController();
  const cancelled = build(async () => { entered.resolve(); return cancelGate.promise; }).exchange(nativeCode, abort.signal);
  await entered.promise; abort.abort('sensitive reason');
  assert.deepEqual(await cancelled, { kind: 'cancelled' });
  const cancelledBody = deferred();
  cancelGate.resolve(new Response(new ReadableStream({ cancel() { cancelledBody.resolve(); } })));
  await cancelledBody.promise;

  const app = createApp();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
    for (const url of ['/v1/auth/apple/challenge', '/v1/auth/apple/exchange', '/v1/auth/activate', '/v1/auth/refresh', '/v1/auth/logout']) {
      assert.equal((await app.inject({ method: 'POST', url })).statusCode, 404);
    }
  } finally { await app.close(); }
  assert.equal(unexpectedOutbound, 0); assert.equal(logs, 0);
} finally {
  globalThis.fetch = originalFetch;
  for (const restore of restored.reverse()) restore();
  Object.assign(console, originalConsole);
}
console.log(`Compiled Apple signer, fixed native transport, sensitive parser, bounded cancellation and health-only app passed on Node ${process.versions.node}; intercepted fixtures only, zero outbound calls or token logs.`);
