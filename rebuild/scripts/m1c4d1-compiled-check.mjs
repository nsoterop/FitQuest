import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const nativeCrypto = require('node:crypto');
const nativeFs = require('node:fs');
const oldKey = crypto.createSecretKey(crypto.randomBytes(32));
const newKey = crypto.createSecretKey(crypto.randomBytes(32));
const wrongKey = crypto.createSecretKey(crypto.randomBytes(32));
let outbound = 0;
const denyNetwork = () => { outbound++; throw new Error('Unexpected outbound call'); };
const originalFetch = globalThis.fetch;
globalThis.fetch = denyNetwork;
const restoreNetwork = [];
for (const [name, methods] of [
  ['node:http', ['request', 'get']], ['node:https', ['request', 'get']],
  ['node:net', ['connect', 'createConnection']], ['node:tls', ['connect']],
  ['node:dns', ['lookup', 'resolve']], ['node:dns/promises', ['lookup', 'resolve']],
]) {
  const module = require(name);
  for (const method of methods) { const original = module[method]; module[method] = denyNetwork; restoreNetwork.push(() => { module[method] = original; }); }
}
let logs = 0;
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
for (const method of Object.keys(originalConsole)) console[method] = () => { logs++; };
const originalPrimitives = { randomBytes: nativeCrypto.randomBytes, createCipheriv: nativeCrypto.createCipheriv, createDecipheriv: nativeCrypto.createDecipheriv };
const originalFs = { readFileSync: nativeFs.readFileSync, writeFileSync: nativeFs.writeFileSync, appendFileSync: nativeFs.appendFileSync };
try {
  for (const file of ['app', 'server', 'local-server', 'simulatedAppleSignIn']) {
    for (const [directory, extension] of [['src', 'ts'], ['dist', 'js']]) {
      const source = readFileSync(new URL(`../services/api/${directory}/${file}.${extension}`, import.meta.url), 'utf8');
      assert.ok(!source.includes('providerCredentialProtection'));
    }
  }
  let constructionCrypto = 0;
  const denyConstructionCrypto = () => { constructionCrypto++; throw new Error('Unexpected construction entropy/cipher'); };
  Object.assign(nativeCrypto, { randomBytes: denyConstructionCrypto, createCipheriv: denyConstructionCrypto, createDecipheriv: denyConstructionCrypto });
  // Native Node loads emitted CommonJS directly. No loader, provider, database or entropy is needed.
  const { createProviderCredentialProtection } = require('../services/api/dist/providerCredentialProtection.js');
  const { createApp } = require('../services/api/dist/app.js');
  let filesystemAttempts = 0;
  const denyFilesystem = () => { filesystemAttempts++; throw new Error('Unexpected secret/file access'); };
  Object.assign(nativeFs, { readFileSync: denyFilesystem, writeFileSync: denyFilesystem, appendFileSync: denyFilesystem });
  const ring = { activeKeyId: 'Old_Key-1', readableKeys: [{ keyId: 'Old_Key-1', key: oldKey }] };
  const built = createProviderCredentialProtection(ring);
  assert.equal(built.kind, 'ready'); assert.equal(constructionCrypto, 0); assert.equal(outbound, 0);
  const protection = built.protection;
  Object.assign(nativeCrypto, originalPrimitives);
  const context = { environment: 'synthetic_compiled', accountId: '11111111-1111-4111-8111-111111111111',
    providerIdentityId: '22222222-2222-4222-8222-222222222222', issuer: 'https://appleid.apple.com', clientId: ' com.Example.FitQuest 😃 ',
    credentialId: '33333333-3333-4333-8333-333333333333', materialVersion: 7, tokenKind: 'refresh',
    sourceId: '44444444-4444-4444-8444-444444444444', expiresAtSeconds: null };
  const plaintext = Buffer.from([0x20, 0xff, 0xfe, 0x00, 0x09, 0x61, 0x0a, 0x20]);
  const independentAad = (binding, keyId, revision) => Buffer.from(JSON.stringify([
    'fitquest.provider-credential', 1, 'AES-256-GCM', keyId, binding.environment, binding.accountId, binding.providerIdentityId,
    binding.issuer, binding.clientId, binding.credentialId, binding.materialVersion, binding.tokenKind, binding.sourceId, binding.expiresAtSeconds, revision,
  ]), 'utf8');
  const independentOpen = (envelope, key, binding, revision) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'), { authTagLength: 16 });
    decipher.setAAD(independentAad(binding, envelope.keyId, revision));
    decipher.setAuthTag(Buffer.from(envelope.authenticationTag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]);
  };
  const flip = value => { const bytes = Buffer.from(value, 'base64url'); bytes[0] ^= 1; return bytes.toString('base64url'); };
  ring.activeKeyId = 'mutated'; ring.readableKeys[0].key = wrongKey; ring.readableKeys.length = 0;
  const encrypted = protection.protect(plaintext, context, 2);
  assert.equal(encrypted.kind, 'protected'); const envelope = encrypted.envelope;
  assert.equal(envelope.keyId, 'Old_Key-1'); assert.equal(Object.isFrozen(envelope), true);
  assert.deepEqual(Object.keys(envelope).sort(), ['algorithm', 'authenticationTag', 'ciphertext', 'envelopeRevision', 'iv', 'keyId', 'schemaVersion']);
  assert.ok(independentOpen(envelope, oldKey, context, 2).equals(plaintext));
  const opened = protection.unprotect(envelope, context, 2);
  assert.equal(opened.kind, 'unprotected'); assert.ok(opened.plaintext.equals(plaintext));
  assert.equal(opened.plaintext.buffer.byteLength, plaintext.length); opened.plaintext.fill(0);
  assert.ok(protection.unprotect(envelope, context, 2).plaintext.equals(plaintext));
  assert.notEqual(protection.protect(plaintext, context, 2).envelope.iv, envelope.iv);
  for (const [field, value] of [
    ['environment', 'other'], ['accountId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['providerIdentityId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['clientId', 'changed'],
    ['credentialId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['materialVersion', 8], ['tokenKind', 'access'],
    ['sourceId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['expiresAtSeconds', 0],
  ]) assert.deepEqual(protection.unprotect(envelope, { ...context, [field]: value }, 2), { kind: 'integrity_failure' });
  for (const field of ['iv', 'ciphertext', 'authenticationTag']) {
    assert.deepEqual(protection.unprotect({ ...envelope, [field]: flip(envelope[field]) }, context, 2), { kind: 'integrity_failure' });
  }
  assert.deepEqual(protection.unprotect(envelope, { ...context, issuer: 'https://attacker.example' }, 2), { kind: 'invalid_input' });
  assert.deepEqual(protection.unprotect(envelope, context, 3), { kind: 'integrity_failure' });
  assert.deepEqual(protection.unprotect({ ...envelope, envelopeRevision: 3 }, context, 3), { kind: 'integrity_failure' });
  assert.deepEqual(protection.unprotect({ ...envelope, keyId: 'Missing' }, context, 2), { kind: 'key_unavailable' });
  const wrong = createProviderCredentialProtection({ activeKeyId: 'Old_Key-1', readableKeys: [{ keyId: 'Old_Key-1', key: wrongKey }] });
  assert.deepEqual(wrong.protection.unprotect(envelope, context, 2), { kind: 'integrity_failure' });
  for (const malformed of [{ ...envelope, iv: envelope.iv + '=' }, { ...envelope, extra: true }, { ...envelope, schemaVersion: 2 },
    { ...envelope, authenticationTag: 'AA' }, { ...envelope, ciphertext: 'AB' }, { ...envelope, ciphertext: 'x'.repeat(21847) }]) {
    assert.deepEqual(protection.unprotect(malformed, context, 2), { kind: 'invalid_input' });
  }
  assert.deepEqual(protection.protect(Buffer.alloc(16385), context, 2), { kind: 'invalid_input' });
  assert.deepEqual(createProviderCredentialProtection({ activeKeyId: 'missing', readableKeys: [{ keyId: 'Old_Key-1', key: oldKey }] }), { kind: 'invalid_configuration' });
  assert.deepEqual(createProviderCredentialProtection({ activeKeyId: 'Old_Key-1', readableKeys: [{ keyId: 'Old_Key-1', key: crypto.createSecretKey(Buffer.alloc(16)) }] }), { kind: 'invalid_configuration' });

  const rotating = createProviderCredentialProtection({ activeKeyId: 'New_Key-2', readableKeys: [{ keyId: 'Old_Key-1', key: oldKey }, { keyId: 'New_Key-2', key: newKey }] }).protection;
  const original = JSON.stringify(envelope); const replacement = rotating.rewrap(envelope, context, 2);
  assert.equal(replacement.kind, 'protected'); assert.equal(replacement.envelope.envelopeRevision, 3);
  assert.equal(replacement.envelope.keyId, 'New_Key-2'); assert.notEqual(replacement.envelope.iv, envelope.iv);
  assert.ok(independentOpen(replacement.envelope, newKey, context, 3).equals(plaintext));
  assert.ok(JSON.stringify(envelope) === original);
  assert.deepEqual(protection.unprotect(replacement.envelope, context, 3), { kind: 'key_unavailable' });
  const sameKey = rotating.rewrap(replacement.envelope, context, 3);
  assert.equal(sameKey.kind, 'protected'); assert.equal(sameKey.envelope.envelopeRevision, 4);
  assert.notEqual(sameKey.envelope.iv, replacement.envelope.iv);
  assert.deepEqual(rotating.rewrap(replacement.envelope, context, 2), { kind: 'integrity_failure' });
  assert.deepEqual(rotating.rewrap(envelope, context, Number.MAX_SAFE_INTEGER), { kind: 'invalid_input' });

  // Monitor real decipher.update output: on tag failure it must be private and cleared, never returned.
  let privatePartial;
  nativeCrypto.createDecipheriv = (...args) => {
    const decipher = originalPrimitives.createDecipheriv(...args); const update = decipher.update.bind(decipher);
    decipher.update = (...updateArgs) => { privatePartial = update(...updateArgs); return privatePartial; };
    return decipher;
  };
  assert.deepEqual(protection.unprotect({ ...envelope, authenticationTag: flip(envelope.authenticationTag) }, context, 2), { kind: 'integrity_failure' });
  assert.ok(privatePartial.length === plaintext.length && privatePartial.every(byte => byte === 0));
  Object.assign(nativeCrypto, originalPrimitives);
  nativeCrypto.randomBytes = () => { throw new Error('sensitive crypto backend error'); };
  assert.deepEqual(protection.protect(plaintext, context, 2), { kind: 'crypto_failure' });
  assert.deepEqual(rotating.rewrap(envelope, context, 2), { kind: 'crypto_failure' });
  Object.assign(nativeCrypto, originalPrimitives);
  assert.equal(filesystemAttempts, 0); assert.equal(logs, 0); assert.equal(outbound, 0);
  Object.assign(nativeFs, originalFs);

  const app = createApp();
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/health' })).statusCode, 200);
    for (const [method, url] of [
      ['GET', '/v1/profile'], ['GET', '/v1/identity'], ['GET', '/v1/sessions'], ['POST', '/v1/commands'],
      ['POST', '/v1/auth/apple/challenge'], ['POST', '/v1/auth/apple/exchange'], ['POST', '/v1/auth/activate'],
      ['POST', '/v1/auth/refresh'], ['POST', '/v1/auth/logout'],
    ]) assert.equal((await app.inject({ method, url })).statusCode, 404);
  } finally { await app.close(); }
  assert.equal(outbound, 0); assert.equal(logs, 0);
} finally {
  Object.assign(nativeCrypto, originalPrimitives); Object.assign(nativeFs, originalFs);
  globalThis.fetch = originalFetch;
  for (const restore of restoreNetwork.reverse()) restore();
  Object.assign(console, originalConsole);
}
console.log(`Compiled provider protection, independent GCM/AAD verification, tamper/rewrap/failure checks and health-only app passed on Node ${process.versions.node}; no outbound calls, secret/file access, construction entropy or token logs.`);
