import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let outboundAttempts = 0;
globalThis.fetch = async () => { outboundAttempts += 1; throw new Error('Unexpected outbound call'); };

// Exercise emitted CommonJS -> JOSE ESM with native Node, without tsx/Vitest loaders.
const { CompactSign, exportJWK, generateKeyPair } = require('jose');
const { createAppleIdentityTokenVerifier, createAppleIdentityTokenVerifierForTest } = require('../services/api/dist/appleIdentityVerifier.js');
const { createApp } = require('../services/api/dist/app.js');
const clientId = 'com.example.fitquest.compiled';
const nonce = 'Invented-Compiled-Nonce';
const subject = 'Invented-Compiled-Subject';
const issuer = 'https://appleid.apple.com';
const now = new Date('2026-09-29T12:00:00.000Z');
const second = now.getTime() / 1000;
createAppleIdentityTokenVerifier({ clientId });
assert.equal(outboundAttempts, 0);

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'compiled-key', alg: 'RS256', use: 'sig' };
let keyFetches = 0;
const verifier = createAppleIdentityTokenVerifierForTest({ clientId }, {
  now: () => now,
  fetch: async (url, options) => {
    assert.equal(url, 'https://appleid.apple.com/auth/keys');
    assert.equal(options.redirect, 'manual');
    keyFetches += 1;
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  },
});
const token = await new CompactSign(Buffer.from(JSON.stringify({ iss: issuer, aud: clientId, sub: subject, nonce, iat: second, exp: second + 300 })))
  .setProtectedHeader({ alg: 'RS256', kid: 'compiled-key' }).sign(privateKey);
assert.deepEqual(await verifier.verify(token, nonce), { kind: 'verified', identity: { provider: 'apple', issuer, subject, audience: clientId } });
assert.deepEqual(await verifier.verify(token, 'wrong-nonce'), { kind: 'invalid' });
assert.equal(keyFetches, 1);
const failed = createAppleIdentityTokenVerifierForTest({ clientId }, {
  now: () => now, fetch: async () => { throw new Error('Invented provider failure'); },
});
assert.deepEqual(await failed.verify(token, nonce), { kind: 'keys_unavailable' });

const app = createApp();
try {
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
  for (const [method, url] of [
    ['GET', '/v1/profile'], ['GET', '/v1/identity'], ['GET', '/v1/sessions'], ['POST', '/v1/commands'],
    ['POST', '/v1/auth/apple/challenge'], ['POST', '/v1/auth/apple/exchange'], ['POST', '/v1/auth/activate'],
    ['POST', '/v1/auth/refresh'], ['POST', '/v1/auth/logout'],
  ]) assert.equal((await app.inject({ method, url })).statusCode, 404);
} finally { await app.close(); }
assert.equal(outboundAttempts, 0);
console.log(`Compiled verifier and health-only default app passed on Node ${process.versions.node}; no outbound calls.`);
