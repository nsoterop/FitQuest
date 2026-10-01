import * as crypto from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProviderCredentialProtection, type ProviderCredentialContext, type ProviderCredentialEnvelope,
  type ProviderCredentialKeyRing, type ProviderCredentialProtection } from './providerCredentialProtection';

// Wrap actual installed primitives so failure tests can intercept operations without an entropy seam in production.
vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof crypto>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes), createCipheriv: vi.fn(actual.createCipheriv), createDecipheriv: vi.fn(actual.createDecipheriv) };
});
const key = crypto.createSecretKey(crypto.randomBytes(32));
const nextKey = crypto.createSecretKey(crypto.randomBytes(32));
const otherKey = crypto.createSecretKey(crypto.randomBytes(32));
const binding = (): ProviderCredentialContext => ({ environment: 'synthetic_test', accountId: '11111111-1111-4111-8111-111111111111',
  providerIdentityId: '22222222-2222-4222-8222-222222222222', issuer: 'https://appleid.apple.com', clientId: ' com.Example.FitQuest 😃 ',
  credentialId: '33333333-3333-4333-8333-333333333333', materialVersion: 7, tokenKind: 'refresh',
  sourceId: '44444444-4444-4444-8444-444444444444', expiresAtSeconds: null });
const configuration = (): ProviderCredentialKeyRing => ({ activeKeyId: 'Old_Key-1', readableKeys: [{ keyId: 'Old_Key-1', key }] });
const make = (ring = configuration()): ProviderCredentialProtection => {
  const result = createProviderCredentialProtection(ring);
  if (result.kind !== 'ready') throw new Error('Expected valid synthetic ring');
  return result.protection;
};
const opaque = () => Buffer.from([0x20, 0xff, 0xfe, 0x00, 0x09, 0x61, 0x0a, 0x20]);
const sealed = (protection = make(), context = binding(), revision = 2, plaintext = opaque()): ProviderCredentialEnvelope => {
  const result = protection.protect(plaintext, context, revision);
  if (result.kind !== 'protected') throw new Error('Expected protected synthetic bytes');
  return result.envelope;
};
// Independently authored protocol tuple: no module AAD encoder is imported or called.
const independentAad = (context: ProviderCredentialContext, keyId: string, revision: number) => Buffer.from(JSON.stringify([
  'fitquest.provider-credential', 1, 'AES-256-GCM', keyId, context.environment, context.accountId, context.providerIdentityId,
  context.issuer, context.clientId, context.credentialId, context.materialVersion, context.tokenKind, context.sourceId, context.expiresAtSeconds, revision,
]), 'utf8');
const flip = (value: string) => { const bytes = Buffer.from(value, 'base64url'); bytes[0] ^= 1; return bytes.toString('base64url'); };

describe('unused server provider credential protection', () => {
  let actualCrypto: typeof crypto;
  beforeAll(async () => { actualCrypto = await vi.importActual<typeof crypto>('node:crypto'); });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crypto.randomBytes).mockReset().mockImplementation(actualCrypto.randomBytes);
    vi.mocked(crypto.createCipheriv).mockReset().mockImplementation(actualCrypto.createCipheriv);
    vi.mocked(crypto.createDecipheriv).mockReset().mockImplementation(actualCrypto.createDecipheriv);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected outbound call'); }));
  });
  afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('constructs without entropy/cipher/network work and returns an immutable primitive', () => {
    const protection = make();
    expect(Object.isFrozen(protection)).toBe(true);
    expect(crypto.randomBytes).not.toHaveBeenCalled();
    expect(crypto.createCipheriv).not.toHaveBeenCalled(); expect(crypto.createDecipheriv).not.toHaveBeenCalled();
  });
  it.each(['identity', 'access', 'refresh'] as const)('protects exact non-UTF-8 bytes for %s, independently authenticating Node crypto and AAD', tokenKind => {
    const protection = make(); const context = { ...binding(), tokenKind }; const plaintext = opaque();
    const envelope = sealed(protection, context, 2, plaintext);
    expect(Object.keys(envelope).sort()).toEqual(['algorithm', 'authenticationTag', 'ciphertext', 'envelopeRevision', 'iv', 'keyId', 'schemaVersion']);
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(envelope.schemaVersion).toBe(1); expect(envelope.algorithm).toBe('AES-256-GCM');
    expect(Buffer.from(envelope.iv, 'base64url').length).toBe(12);
    expect(Buffer.from(envelope.authenticationTag, 'base64url').length).toBe(16);
    expect(Buffer.from(envelope.ciphertext, 'base64url').length).toBe(plaintext.length);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'), { authTagLength: 16 });
    decipher.setAAD(independentAad(context, envelope.keyId, 2)); decipher.setAuthTag(Buffer.from(envelope.authenticationTag, 'base64url'));
    const independentlyOpened = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]);
    expect(independentlyOpened.equals(plaintext)).toBe(true);
    const result = protection.unprotect(envelope, context, 2);
    expect(result.kind).toBe('unprotected');
    if (result.kind !== 'unprotected') throw new Error('Expected authenticated bytes');
    expect(result.plaintext.equals(plaintext)).toBe(true);
    expect(result.plaintext.buffer.byteLength).toBe(plaintext.length); // No shared Buffer pool in the public result.
    result.plaintext.fill(0);
    const again = protection.unprotect(envelope, context, 2);
    expect(again.kind === 'unprotected' && again.plaintext.equals(plaintext)).toBe(true);
    expect(Object.keys(result).sort()).toEqual(['kind', 'plaintext']);
  });
  it('opens independently created ciphertext, preserving client-ID whitespace/case/Unicode and maximum metadata integers', () => {
    const context = { ...binding(), materialVersion: Number.MAX_SAFE_INTEGER, expiresAtSeconds: Number.MAX_SAFE_INTEGER };
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    cipher.setAAD(independentAad(context, 'Old_Key-1', Number.MAX_SAFE_INTEGER));
    const ciphertext = Buffer.concat([cipher.update(opaque()), cipher.final()]);
    const envelope = { schemaVersion: 1, algorithm: 'AES-256-GCM', keyId: 'Old_Key-1', envelopeRevision: Number.MAX_SAFE_INTEGER,
      iv: iv.toString('base64url'), ciphertext: ciphertext.toString('base64url'), authenticationTag: cipher.getAuthTag().toString('base64url') };
    const result = make().unprotect(envelope, context, Number.MAX_SAFE_INTEGER);
    expect(result.kind === 'unprotected' && result.plaintext.equals(opaque())).toBe(true);
  });
  it('generates fresh IVs on every protect and same-key rewrap without interpreting or changing bytes', () => {
    const protection = make(); const envelopes = Array.from({ length: 16 }, () => sealed(protection));
    expect(new Set(envelopes.map(value => value.iv)).size).toBe(16);
    const result = protection.rewrap(envelopes[0], binding(), 2);
    expect(result.kind).toBe('protected');
    if (result.kind !== 'protected') throw new Error('Expected replacement');
    expect(result.envelope.envelopeRevision).toBe(3); expect(result.envelope.keyId).toBe('Old_Key-1');
    expect(result.envelope.iv !== envelopes[0].iv).toBe(true);
    const opened = protection.unprotect(result.envelope, binding(), 3);
    expect(opened.kind === 'unprotected' && opened.plaintext.equals(opaque())).toBe(true);
    expect(protection.unprotect(result.envelope, { ...binding(), materialVersion: 8 }, 3)).toEqual({ kind: 'integrity_failure' });
  });
  it('copies the active ID and readable-key mapping against caller mutation and uses case-sensitive IDs', () => {
    const ring = { activeKeyId: 'Old_Key-1', readableKeys: [{ keyId: 'Old_Key-1', key }, { keyId: 'old_key-1', key: nextKey }] };
    const protection = make(ring);
    ring.activeKeyId = 'old_key-1'; ring.readableKeys[0].key = otherKey; ring.readableKeys[0].keyId = 'changed'; ring.readableKeys.length = 0;
    const result = sealed(protection);
    expect(result.keyId).toBe('Old_Key-1');
    expect(protection.unprotect(result, binding(), 2).kind).toBe('unprotected');
    expect(make().unprotect({ ...result, keyId: 'old_key-1' }, binding(), 2)).toEqual({ kind: 'key_unavailable' });
  });
  it('rewraps old material under the active new key, preserving independently checked binding and input envelope', () => {
    const old = make(); const envelope = sealed(old); const original = JSON.stringify(envelope);
    const rotating = make({ activeKeyId: 'New_Key-2', readableKeys: [{ keyId: 'Old_Key-1', key }, { keyId: 'New_Key-2', key: nextKey }] });
    expect(rotating.unprotect(envelope, binding(), 2).kind).toBe('unprotected');
    const result = rotating.rewrap(envelope, binding(), 2);
    expect(result.kind).toBe('protected');
    if (result.kind !== 'protected') throw new Error('Expected replacement');
    expect(JSON.stringify(envelope) === original).toBe(true);
    expect(result.envelope.keyId).toBe('New_Key-2'); expect(result.envelope.envelopeRevision).toBe(3);
    expect(result.envelope.iv !== envelope.iv).toBe(true);
    expect(old.unprotect(result.envelope, binding(), 3)).toEqual({ kind: 'key_unavailable' });
    const onlyNew = make({ activeKeyId: 'New_Key-2', readableKeys: [{ keyId: 'New_Key-2', key: nextKey }] });
    const opened = onlyNew.unprotect(result.envelope, binding(), 3);
    expect(opened.kind === 'unprotected' && opened.plaintext.equals(opaque())).toBe(true);
    const decipher = crypto.createDecipheriv('aes-256-gcm', nextKey, Buffer.from(result.envelope.iv, 'base64url'), { authTagLength: 16 });
    decipher.setAAD(independentAad(binding(), 'New_Key-2', 3)); decipher.setAuthTag(Buffer.from(result.envelope.authenticationTag, 'base64url'));
    expect(Buffer.concat([decipher.update(Buffer.from(result.envelope.ciphertext, 'base64url')), decipher.final()]).equals(opaque())).toBe(true);
  });

  it.each([
    undefined, null, {}, { activeKeyId: 'Old_Key-1' }, { ...configuration(), extra: 'secret' },
    { ...configuration(), activeKeyId: '' }, { ...configuration(), activeKeyId: 'x'.repeat(65) },
    { ...configuration(), activeKeyId: 'Old_Key-1\n' }, { ...configuration(), activeKeyId: 'é' },
    { ...configuration(), activeKeyId: 'missing' }, { ...configuration(), readableKeys: [] }, { ...configuration(), readableKeys: {} },
    { ...configuration(), readableKeys: [{ keyId: 'Old_Key-1', key }, { keyId: 'Old_Key-1', key: nextKey }] },
    ...[0, 16, 31, 33, 64].map(length => ({ ...configuration(), readableKeys: [{ keyId: 'Old_Key-1', key: crypto.createSecretKey(Buffer.alloc(length)) }] })),
    ...['', ' ', 'é', 'x'.repeat(65), 'Old_Key-1\n'].map(keyId => ({ activeKeyId: keyId, readableKeys: [{ keyId, key }] })),
    { ...configuration(), readableKeys: [{ keyId: 'Old_Key-1', key: Buffer.alloc(32) }] },
    { ...configuration(), readableKeys: [{ keyId: 'Old_Key-1', key: 'sensitive key string' }] },
    { ...configuration(), readableKeys: [{ keyId: 'Old_Key-1', key, extra: true }] },
  ])('rejects invalid key-ring shape/identifier/size %# with a fixed configuration outcome', ring => {
    expect(createProviderCredentialProtection(ring as ProviderCredentialKeyRing)).toEqual({ kind: 'invalid_configuration' });
    expect(crypto.randomBytes).not.toHaveBeenCalled(); expect(crypto.createCipheriv).not.toHaveBeenCalled();
  });
  it('rejects asymmetric/public, inherited/accessor, sparse and missing keys without secret discovery', () => {
    const asymmetric = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const getter = vi.fn(() => { throw new Error('sensitive key getter'); });
    const inherited = Object.create(configuration());
    const accessor = Object.defineProperty({ ...configuration() }, 'activeKeyId', { get: getter });
    const sparse = new Array(1);
    const arrayAccessor = Object.defineProperty([], '0', { get: getter });
    for (const ring of [inherited, accessor, { ...configuration(), readableKeys: sparse }, { ...configuration(), readableKeys: arrayAccessor },
      { ...configuration(), readableKeys: [{ keyId: 'Old_Key-1' }] },
      ...[asymmetric.privateKey, asymmetric.publicKey, {}].map(key => ({ ...configuration(), readableKeys: [{ keyId: 'Old_Key-1', key }] }))]) {
      expect(createProviderCredentialProtection(ring as ProviderCredentialKeyRing)).toEqual({ kind: 'invalid_configuration' });
    }
    expect(getter).not.toHaveBeenCalled();
  });
  it('supports strict null-prototype records and maximum ASCII identifiers without prototype collisions', () => {
    const keyId = 'x'.repeat(64);
    const protection = make(Object.assign(Object.create(null), { activeKeyId: keyId, readableKeys: [Object.assign(Object.create(null), { keyId, key })] }));
    const context = Object.assign(Object.create(null), { ...binding(), environment: 'x'.repeat(128), clientId: 'é'.repeat(127) + 'a' });
    const envelope = sealed(protection, context);
    expect(protection.unprotect(Object.assign(Object.create(null), envelope), context, 2).kind).toBe('unprotected');
    const special = make({ activeKeyId: '__proto__', readableKeys: [{ keyId: '__proto__', key }] });
    expect(special.unprotect(sealed(special), binding(), 2).kind).toBe('unprotected');
  });

  it.each([
    ['environment', 'another_environment'], ['accountId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['providerIdentityId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['clientId', 'com.example.fitquest'],
    ['clientId', binding().clientId.toLowerCase()], ['clientId', binding().clientId.trim()],
    ['credentialId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['materialVersion', 8], ['tokenKind', 'identity'], ['tokenKind', 'access'],
    ['sourceId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], ['expiresAtSeconds', 0],
  ])('fails authentication on valid %s binding substitution %# without returning partial plaintext', (field, value) => {
    const protection = make(); const envelope = sealed(protection);
    const substituted = { ...binding(), [field]: value } as ProviderCredentialContext;
    expect(protection.unprotect(envelope, substituted, 2)).toEqual({ kind: 'integrity_failure' });
    expect(protection.rewrap(envelope, substituted, 2)).toEqual({ kind: 'integrity_failure' });
  });
  it('distinguishes key unavailability, wrong known keys and same-key aliases authenticated by AAD', () => {
    const envelope = sealed();
    expect(make().unprotect({ ...envelope, keyId: 'Missing' }, binding(), 2)).toEqual({ kind: 'key_unavailable' });
    expect(make({ activeKeyId: 'Old_Key-1', readableKeys: [{ keyId: 'Old_Key-1', key: otherKey }] }).unprotect(envelope, binding(), 2)).toEqual({ kind: 'integrity_failure' });
    const alias = make({ activeKeyId: 'Alias', readableKeys: [{ keyId: 'Old_Key-1', key }, { keyId: 'Alias', key }] });
    expect(alias.unprotect({ ...envelope, keyId: 'Alias' }, binding(), 2)).toEqual({ kind: 'integrity_failure' });
    vi.clearAllMocks();
    expect(alias.unprotect({ ...envelope, keyId: 'Missing' }, binding(), 2)).toEqual({ kind: 'key_unavailable' });
    expect(crypto.createDecipheriv).not.toHaveBeenCalled();
  });
  it('checks expected revision before decrypting, including coordinated revision tampering and stale rewrap', () => {
    const protection = make(); const envelope = sealed(protection); vi.clearAllMocks();
    expect(protection.unprotect(envelope, binding(), 3)).toEqual({ kind: 'integrity_failure' });
    expect(protection.rewrap(envelope, binding(), 3)).toEqual({ kind: 'integrity_failure' });
    expect(crypto.createDecipheriv).not.toHaveBeenCalled();
    expect(protection.unprotect({ ...envelope, envelopeRevision: 3 }, binding(), 3)).toEqual({ kind: 'integrity_failure' });
  });
  it.each(['iv', 'ciphertext', 'authenticationTag'] as const)('rejects %s bit tampering without plaintext or replacement', field => {
    const protection = make(); const envelope = sealed(protection); const tampered = { ...envelope, [field]: flip(envelope[field]) };
    expect(protection.unprotect(tampered, binding(), 2)).toEqual({ kind: 'integrity_failure' });
    expect(protection.rewrap(tampered, binding(), 2)).toEqual({ kind: 'integrity_failure' });
  });

  it.each([
    ['environment', ''], ['environment', 'x'.repeat(129)], ['environment', 'é'], ['environment', 'test\n'], ['environment', 1],
    ['issuer', 'https://attacker.example'], ['issuer', 'https://appleid.apple.com/'], ['issuer', undefined],
    ['clientId', ''], ['clientId', 'x'.repeat(256)], ['clientId', '😃'.repeat(64)], ['clientId', 1],
    ['materialVersion', 0], ['materialVersion', -1], ['materialVersion', 1.5], ['materialVersion', NaN], ['materialVersion', Infinity], ['materialVersion', Number.MAX_SAFE_INTEGER + 1],
    ['expiresAtSeconds', -1], ['expiresAtSeconds', 1.5], ['expiresAtSeconds', '123'], ['expiresAtSeconds', undefined], ['expiresAtSeconds', NaN], ['expiresAtSeconds', Number.MAX_SAFE_INTEGER + 1],
    ['tokenKind', 'Refresh'], ['tokenKind', 'bearer'], ['tokenKind', null],
    ...['accountId', 'providerIdentityId', 'credentialId', 'sourceId'].flatMap((field): [string, unknown][] => [
      [field, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'], [field, 'not-an-id'], [field, '11111111-1111-0111-8111-111111111111'],
      [field, '11111111-1111-4111-7111-111111111111'], [field, '11111111-1111-4111-8111-111111111111\n'], [field, null],
    ]),
  ])('rejects invalid %s metadata %# before any cryptographic operation', (field, value) => {
    const protection = make(); const envelope = sealed(protection); vi.clearAllMocks();
    const context = { ...binding(), [field]: value } as ProviderCredentialContext;
    expect(protection.protect(opaque(), context, 2)).toEqual({ kind: 'invalid_input' });
    expect(protection.unprotect(envelope, context, 2)).toEqual({ kind: 'invalid_input' });
    expect(protection.rewrap(envelope, context, 2)).toEqual({ kind: 'invalid_input' });
    expect(crypto.randomBytes).not.toHaveBeenCalled(); expect(crypto.createCipheriv).not.toHaveBeenCalled(); expect(crypto.createDecipheriv).not.toHaveBeenCalled();
  });
  it('rejects missing/extra/inherited/accessor context fields without invoking getters', () => {
    const protection = make(); const envelope = sealed(protection); const getter = vi.fn(() => { throw new Error('sensitive context'); });
    const cases = [null, undefined, [], Object.create(binding()), { ...binding(), unexpected: 'secret' },
      Object.defineProperty({ ...binding() }, 'clientId', { get: getter }), new Proxy({}, { getPrototypeOf() { throw new Error('secret proxy'); } })];
    for (const field of Object.keys(binding())) { const missing: Record<string, unknown> = { ...binding() }; delete missing[field]; cases.push(missing); }
    for (const value of cases) {
      expect(protection.protect(opaque(), value as ProviderCredentialContext, 2)).toEqual({ kind: 'invalid_input' });
      expect(protection.unprotect(envelope, value as ProviderCredentialContext, 2)).toEqual({ kind: 'invalid_input' });
      expect(protection.rewrap(envelope, value as ProviderCredentialContext, 2)).toEqual({ kind: 'invalid_input' });
    }
    expect(getter).not.toHaveBeenCalled();
  });
  it('uses existing UUID semantics, including all supported versions, nil and max, with no normalization', () => {
    const protection = make();
    const ids = Array.from({ length: 8 }, (_, index) => `11111111-1111-${index + 1}111-8111-111111111111`);
    ids.push('00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff');
    for (const id of ids) {
      const context = { ...binding(), accountId: id, providerIdentityId: id, credentialId: id, sourceId: id, clientId: ' ' };
      expect(protection.unprotect(sealed(protection, context), context, 2).kind).toBe('unprotected');
    }
  });

  it.each([
    ['schemaVersion', 2], ['schemaVersion', '1'], ['algorithm', 'aes-256-gcm'], ['algorithm', 'AES-256-CBC'],
    ['keyId', ''], ['keyId', 'x'.repeat(65)], ['keyId', 'Old_Key-1\n'], ['keyId', 'é'], ['keyId', 1],
    ['envelopeRevision', 0], ['envelopeRevision', -1], ['envelopeRevision', 1.5], ['envelopeRevision', '2'], ['envelopeRevision', Number.MAX_SAFE_INTEGER + 1],
    ['iv', null], ['iv', Buffer.alloc(12)], ['ciphertext', null], ['authenticationTag', 1],
    ['iv', ''], ['iv', Buffer.alloc(11).toString('base64url')], ['iv', Buffer.alloc(13).toString('base64url')],
    ['authenticationTag', Buffer.alloc(15).toString('base64url')], ['authenticationTag', Buffer.alloc(17).toString('base64url')],
    ['ciphertext', ''], ['ciphertext', Buffer.alloc(16385).toString('base64url')],
  ])('rejects malformed/unsupported envelope field %s %# before decryption', (field, value) => {
    const protection = make(); const envelope = sealed(protection); vi.clearAllMocks();
    expect(protection.unprotect({ ...envelope, [field]: value }, binding(), 2)).toEqual({ kind: 'invalid_input' });
    expect(protection.rewrap({ ...envelope, [field]: value }, binding(), 2)).toEqual({ kind: 'invalid_input' });
    expect(crypto.createDecipheriv).not.toHaveBeenCalled();
  });
  it.each(['iv', 'ciphertext', 'authenticationTag'] as const)('rejects noncanonical/oversize %s before decoding or decryption', field => {
    const protection = make(); const envelope = sealed(protection);
    for (const value of [envelope[field] + '=', envelope[field] + '\n', ' ' + envelope[field], '+/', 'A', 'AB', 'é', 'x'.repeat(21847)]) {
      expect(protection.unprotect({ ...envelope, [field]: value }, binding(), 2)).toEqual({ kind: 'invalid_input' });
    }
    // Authentication tags have four unused bits: change only those bits, preserving decoded bytes.
    if (field === 'authenticationTag') {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const index = alphabet.indexOf(envelope.authenticationTag.at(-1)!);
      const alias = envelope.authenticationTag.slice(0, -1) + alphabet[index + 1];
      expect(Buffer.from(alias, 'base64url').equals(Buffer.from(envelope.authenticationTag, 'base64url'))).toBe(true);
      expect(protection.unprotect({ ...envelope, authenticationTag: alias }, binding(), 2)).toEqual({ kind: 'invalid_input' });
    }
  });
  it('rejects every missing envelope field, extra string/symbol fields, inherited data and accessors', () => {
    const protection = make(); const envelope = sealed(protection); const getter = vi.fn(() => { throw new Error('sensitive envelope'); });
    const cases = [undefined, null, [], 'secret', Object.create(envelope), { ...envelope, extra: true },
      { ...envelope, [Symbol('secret')]: 'secret' }, Object.defineProperty({ ...envelope }, 'ciphertext', { get: getter })];
    for (const field of Object.keys(envelope)) { const missing: Record<string, unknown> = { ...envelope }; delete missing[field]; cases.push(missing); }
    for (const value of cases) {
      expect(protection.unprotect(value, binding(), 2)).toEqual({ kind: 'invalid_input' });
      expect(protection.rewrap(value, binding(), 2)).toEqual({ kind: 'invalid_input' });
    }
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, '2'])('rejects invalid independent revision %#', revision => {
    const protection = make(); const envelope = sealed(protection); vi.clearAllMocks();
    expect(protection.protect(opaque(), binding(), revision as number)).toEqual({ kind: 'invalid_input' });
    expect(protection.unprotect(envelope, binding(), revision as number)).toEqual({ kind: 'invalid_input' });
    expect(protection.rewrap(envelope, binding(), revision as number)).toEqual({ kind: 'invalid_input' });
    expect(crypto.randomBytes).not.toHaveBeenCalled(); expect(crypto.createDecipheriv).not.toHaveBeenCalled();
  });
  it('rejects rewrap overflow before decryption and permits the final safe revision', () => {
    const protection = make(); const maximum = sealed(protection, binding(), Number.MAX_SAFE_INTEGER); vi.clearAllMocks();
    expect(protection.rewrap(maximum, binding(), Number.MAX_SAFE_INTEGER)).toEqual({ kind: 'invalid_input' });
    expect(crypto.createDecipheriv).not.toHaveBeenCalled();
    const beforeMaximum = sealed(protection, binding(), Number.MAX_SAFE_INTEGER - 1);
    const result = protection.rewrap(beforeMaximum, binding(), Number.MAX_SAFE_INTEGER - 1);
    expect(result.kind === 'protected' && result.envelope.envelopeRevision === Number.MAX_SAFE_INTEGER).toBe(true);
  });

  it.each([undefined, null, '', 'sensitive plaintext', {}, new ArrayBuffer(1), new Uint16Array([1]), new Uint8Array(), Buffer.alloc(16385)])('rejects invalid plaintext %# before entropy or cipher work', plaintext => {
    expect(make().protect(plaintext as Uint8Array, binding(), 2)).toEqual({ kind: 'invalid_input' });
    expect(crypto.randomBytes).not.toHaveBeenCalled(); expect(crypto.createCipheriv).not.toHaveBeenCalled();
  });
  it.each([1, 16384])('round trips exactly %i bytes, including view offsets, without mutating caller buffers', length => {
    const protection = make(); const source = Buffer.alloc(length + 4, 0xff); const input = new Uint8Array(source.buffer, source.byteOffset + 2, length);
    const envelope = sealed(protection, binding(), 2, Buffer.from(input));
    expect(source.every(byte => byte === 0xff)).toBe(true);
    source.fill(0);
    const opened = protection.unprotect(envelope, binding(), 2);
    expect(opened.kind === 'unprotected' && opened.plaintext.length === length && opened.plaintext.every(byte => byte === 0xff)).toBe(true);
    const viewEnvelope = protection.protect(input, binding(), 3);
    expect(viewEnvelope.kind).toBe('protected');
    if (viewEnvelope.kind !== 'protected') throw new Error('Expected view protection');
    const viewOpened = protection.unprotect(viewEnvelope.envelope, binding(), 3);
    expect(viewOpened.kind === 'unprotected' && viewOpened.plaintext.every(byte => byte === 0)).toBe(true);
  });
  it('bounds allocation using intrinsic byte length instead of a caller-shadowed length', () => {
    const oversized = new Uint8Array(16385);
    Object.defineProperty(oversized, 'byteLength', { value: 1 });
    expect(make().protect(oversized, binding(), 2)).toEqual({ kind: 'invalid_input' });
    expect(crypto.randomBytes).not.toHaveBeenCalled(); expect(crypto.createCipheriv).not.toHaveBeenCalled();
  });
  it('copies real byte views without invoking caller-defined size getters', () => {
    const value = new Uint8Array(opaque()); const getter = vi.fn(() => { throw new Error('sensitive byte getter'); });
    Object.defineProperty(value, 'byteLength', { get: getter });
    const protection = make(); const result = protection.protect(value, binding(), 2);
    expect(result.kind).toBe('protected');
    if (result.kind !== 'protected') throw new Error('Expected intrinsic byte copy');
    const opened = protection.unprotect(result.envelope, binding(), 2);
    expect(opened.kind === 'unprotected' && opened.plaintext.equals(opaque())).toBe(true); expect(getter).not.toHaveBeenCalled();
  });

  it('clears private unauthenticated update output and returns no partial bytes after final authentication failure', () => {
    const protection = make(); const envelope = sealed(protection);
    const realCreate = actualCrypto.createDecipheriv;
    let privatePartial: Buffer | undefined;
    vi.spyOn(crypto, 'createDecipheriv').mockImplementation((...args) => {
      const decipher = realCreate(...args); const update = decipher.update.bind(decipher);
      // This module calls the binary overload only; preserve that overload while monitoring its private buffer.
      vi.spyOn(decipher, 'update').mockImplementation(((data: Buffer) => { privatePartial = update(data); return privatePartial; }) as typeof decipher.update);
      return decipher;
    });
    expect(protection.unprotect({ ...envelope, authenticationTag: flip(envelope.authenticationTag) }, binding(), 2)).toEqual({ kind: 'integrity_failure' });
    expect(privatePartial?.length).toBe(opaque().length); expect(privatePartial?.every(byte => byte === 0)).toBe(true);
  });
  it('clears private authenticated intermediates even when replacement encryption fails', () => {
    const protection = make(); const envelope = sealed(protection);
    const realCreate = actualCrypto.createDecipheriv; let privatePartial: Buffer | undefined;
    vi.spyOn(crypto, 'createDecipheriv').mockImplementation((...args) => {
      const decipher = realCreate(...args); const update = decipher.update.bind(decipher);
      vi.spyOn(decipher, 'update').mockImplementation(((data: Buffer) => { privatePartial = update(data); return privatePartial; }) as typeof decipher.update);
      return decipher;
    });
    vi.spyOn(crypto, 'randomBytes').mockImplementationOnce(() => { throw new Error('sensitive entropy exception'); });
    expect(protection.rewrap(envelope, binding(), 2)).toEqual({ kind: 'crypto_failure' });
    expect(privatePartial?.every(byte => byte === 0)).toBe(true);
  });
  it('clears owned working plaintext after encryption/rewrap finalization errors while preserving caller bytes', () => {
    const protection = make(); const envelope = sealed(protection); const callerBytes = opaque();
    for (const operation of ['protect', 'rewrap']) {
      let working: Buffer | undefined;
      vi.spyOn(crypto, 'createCipheriv').mockImplementationOnce((...args) => {
        const cipher = actualCrypto.createCipheriv(...args); const update = cipher.update.bind(cipher);
        vi.spyOn(cipher, 'update').mockImplementation(((data: Buffer) => { working = data; return update(data); }) as typeof cipher.update);
        vi.spyOn(cipher, 'final').mockImplementation(() => { throw new Error('sensitive finalization failure'); });
        return cipher;
      });
      expect(operation === 'protect' ? protection.protect(callerBytes, binding(), 2) : protection.rewrap(envelope, binding(), 2))
        .toEqual({ kind: 'crypto_failure' });
      expect(working?.every(byte => byte === 0)).toBe(true);
      expect(callerBytes.equals(opaque())).toBe(true);
    }
  });
  it('returns fixed sanitized operational failures with no logs, fallback or mutation', () => {
    const log = vi.spyOn(console, 'log'); const warn = vi.spyOn(console, 'warn'); const error = vi.spyOn(console, 'error');
    const protection = make(); const plaintext = Buffer.from('invented sensitive plaintext'); const envelope = sealed(protection);
    const original = JSON.stringify(envelope);
    vi.spyOn(crypto, 'randomBytes').mockImplementationOnce(() => { throw new Error('raw sensitive key/plaintext/backend error'); });
    expect(protection.protect(plaintext, binding(), 2)).toEqual({ kind: 'crypto_failure' });
    vi.spyOn(crypto, 'createCipheriv').mockImplementationOnce(() => { throw new Error('raw sensitive key error'); });
    expect(protection.protect(plaintext, binding(), 2)).toEqual({ kind: 'crypto_failure' });
    vi.spyOn(crypto, 'createDecipheriv').mockImplementationOnce(() => { throw new Error('raw sensitive crypto backend error'); });
    expect(protection.unprotect(envelope, binding(), 2)).toEqual({ kind: 'crypto_failure' });
    expect(plaintext.toString() === 'invented sensitive plaintext').toBe(true); expect(JSON.stringify(envelope) === original).toBe(true);
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
});
