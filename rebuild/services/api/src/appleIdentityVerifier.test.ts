import { CompactSign, exportJWK, generateKeyPair, type CryptoKey, type FetchImplementation, type JWK } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppleIdentityTokenVerifier, createAppleIdentityTokenVerifierForTest, type AppleVerifierConfiguration } from './appleIdentityVerifier';

const issuer = 'https://appleid.apple.com';
const clientId = 'com.example.fitquest.offline';
const nonce = 'OpaqueNonce-CaseSensitive';
const subject = 'InventedSubject-CaseSensitive';
const second = Date.parse('2026-09-29T12:00:00.000Z') / 1000;
const configuration = { clientId };
const claims = () => ({ iss: issuer, aud: clientId, sub: subject, nonce, iat: second - 10, exp: second + 7200 });
const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

describe('unused offline Apple identity-token verifier', () => {
  let privateKey: CryptoKey, publicJwk: JWK, nextPrivate: CryptoKey, nextJwk: JWK, wrongPrivate: CryptoKey;
  let clock: number;
  let fetchKeys: ReturnType<typeof vi.fn<FetchImplementation>>;
  const verifier = (config: AppleVerifierConfiguration = configuration, transport: FetchImplementation = fetchKeys) =>
    createAppleIdentityTokenVerifierForTest(config, { now: () => new Date(clock), fetch: transport });
  const sign = (payload: Record<string, unknown> = claims(), header: Record<string, unknown> = {}, key = privateKey) =>
    new CompactSign(Buffer.from(JSON.stringify(payload))).setProtectedHeader({ alg: 'RS256', kid: 'old-key', ...header }).sign(key);
  beforeAll(async () => {
    const first = await generateKeyPair('RS256');
    const next = await generateKeyPair('RS256');
    privateKey = first.privateKey; nextPrivate = next.privateKey;
    wrongPrivate = (await generateKeyPair('RS256')).privateKey;
    publicJwk = { ...await exportJWK(first.publicKey), kid: 'old-key', alg: 'RS256', use: 'sig' };
    nextJwk = { ...await exportJWK(next.publicKey), kid: 'new-key', alg: 'RS256', use: 'sig' };
  });
  beforeEach(() => {
    clock = second * 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock); // Actual JOSE cache clock; JWT time is injected separately.
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected outbound call'); }));
    fetchKeys = vi.fn<FetchImplementation>(async () => jsonResponse({ keys: [publicJwk] }));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('verifies the signature and returns only an opaque provider identity', async () => {
    const value = { ...claims(), email: 'invented@example.test', nickname: 'Invented name', extra: 'private payload' };
    const result = await verifier().verify(await sign(value), nonce);
    expect(result).toEqual({ kind: 'verified', identity: { provider: 'apple', issuer, subject, audience: clientId } });
    expect(fetchKeys).toHaveBeenCalledTimes(1);
    expect(fetchKeys.mock.calls[0][0]).toBe('https://appleid.apple.com/auth/keys');
    expect(fetchKeys.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(fetchKeys.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('requires configuration and does no provider I/O during construction', () => {
    createAppleIdentityTokenVerifier(configuration);
    verifier();
    expect(fetchKeys).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    for (const client of ['', ' ', ' com.example.app', 'com.example.app ', 'https://caller.test']) {
      expect(() => createAppleIdentityTokenVerifier({ clientId: client })).toThrow('Invalid Apple verifier configuration');
    }
  });

  it.each([
    { jwtClockToleranceSeconds: -1 }, { jwtClockToleranceSeconds: 61 }, { jwtClockToleranceSeconds: Infinity },
    { jwksTimeoutMs: 0 }, { jwksTimeoutMs: 5001 }, { jwksTimeoutMs: NaN },
    { jwksCooldownMs: -1 }, { jwksCooldownMs: 30001 }, { jwksCacheMaxAgeMs: 0 }, { jwksCacheMaxAgeMs: Infinity },
  ])('rejects unbounded or invalid trusted timing configuration %j', settings => {
    expect(() => verifier({ ...configuration, ...settings })).toThrow('Invalid Apple verifier configuration');
  });

  it('rejects a different signer and payload or signature tampering', async () => {
    const token = await sign();
    const parts = token.split('.');
    const tamperedPayload = [parts[0], Buffer.from(JSON.stringify({ ...claims(), sub: 'substitution' })).toString('base64url'), parts[2]].join('.');
    const changedSignature = [parts[0], parts[1], (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1)].join('.');
    const boundary = verifier();
    for (const value of [await sign(claims(), {}, wrongPrivate), tamperedPayload, changedSignature]) {
      expect(await boundary.verify(value, nonce)).toEqual({ kind: 'invalid' });
    }
  });

  it('rejects symmetric, alternate asymmetric and unsigned algorithms without fetching keys', async () => {
    const ec = await generateKeyPair('ES256');
    const hs = await new CompactSign(Buffer.from(JSON.stringify(claims()))).setProtectedHeader({ alg: 'HS256', kid: 'old-key' }).sign(new Uint8Array(32));
    const es = await sign(claims(), { alg: 'ES256' }, ec.privateKey);
    const unsigned = Buffer.from('{"alg":"none"}').toString('base64url') + '.' + Buffer.from(JSON.stringify(claims())).toString('base64url') + '.';
    const boundary = verifier();
    for (const value of [hs, es, unsigned]) expect(await boundary.verify(value, nonce)).toEqual({ kind: 'invalid' });
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it.each(['iss', 'aud', 'sub', 'exp', 'iat', 'nonce'])('requires the %s claim even when nonce_supported is false', async name => {
    const payload: Record<string, unknown> = { ...claims(), nonce_supported: false };
    delete payload[name];
    expect(await verifier().verify(await sign(payload), nonce)).toEqual({ kind: 'invalid' });
  });

  it.each([
    ['iss', 'https://caller.example'], ['iss', 1], ['aud', 'com.example.other'], ['aud', [clientId]], ['aud', [clientId, 'other']], ['aud', 1],
    ['sub', ''], ['sub', 1], ['sub', 'x'.repeat(513)], ['nonce', nonce.toLowerCase()], ['nonce', 1], ['nonce', ''],
    ['iat', '123'], ['iat', null], ['iat', -1], ['iat', second + 0.5], ['exp', '123'], ['exp', null], ['exp', Number.MAX_SAFE_INTEGER + 1],
    ['exp', second - 10], ['nbf', '123'], ['nbf', -1], ['nbf', second + 0.5], ['nbf', second + 7200],
  ])('rejects wrong, malformed or inconsistent %s claims', async (name, value) => {
    expect(await verifier().verify(await sign({ ...claims(), [name as string]: value }), nonce)).toEqual({ kind: 'invalid' });
  });

  it('enforces exact expiry boundaries with no tolerance', async () => {
    const boundary = verifier({ ...configuration, jwtClockToleranceSeconds: 0 });
    const token = await sign({ ...claims(), exp: second });
    clock = (second - 1) * 1000;
    expect((await boundary.verify(token, nonce)).kind).toBe('verified');
    clock = second * 1000;
    expect(await boundary.verify(token, nonce)).toEqual({ kind: 'invalid' });
    clock += 1000;
    expect(await boundary.verify(token, nonce)).toEqual({ kind: 'invalid' });
  });

  it('bounds the default expiration tolerance at 60 seconds', async () => {
    const boundary = verifier();
    const token = await sign({ ...claims(), exp: second });
    clock = (second + 59) * 1000;
    expect((await boundary.verify(token, nonce)).kind).toBe('verified');
    clock += 1000;
    expect(await boundary.verify(token, nonce)).toEqual({ kind: 'invalid' });
    clock += 1000;
    expect(await boundary.verify(token, nonce)).toEqual({ kind: 'invalid' });
  });

  it.each([0, 60])('rechecks expiration after a delayed key fetch with %i seconds tolerance', async tolerance => {
    const gate = deferred<Response>();
    fetchKeys.mockImplementation(() => gate.promise);
    const boundary = verifier({ ...configuration, jwtClockToleranceSeconds: tolerance });
    const result = boundary.verify(await sign({ ...claims(), exp: second + 1 }), nonce);
    await vi.waitFor(() => expect(fetchKeys).toHaveBeenCalledTimes(1));
    clock = (second + 1 + tolerance) * 1000;
    gate.resolve(jsonResponse({ keys: [publicJwk] }));
    expect(await result).toEqual({ kind: 'invalid' });
  });

  it.each(['iat', 'nbf'])('bounds future %s at the configured tolerance', async name => {
    const boundary = verifier();
    expect((await boundary.verify(await sign({ ...claims(), [name]: second + 60 }), nonce)).kind).toBe('verified');
    expect(await boundary.verify(await sign({ ...claims(), [name]: second + 61 }), nonce)).toEqual({ kind: 'invalid' });
    const strict = verifier({ ...configuration, jwtClockToleranceSeconds: 0 });
    expect((await strict.verify(await sign({ ...claims(), [name]: second }), nonce)).kind).toBe('verified');
    expect(await strict.verify(await sign({ ...claims(), [name]: second + 1 }), nonce)).toEqual({ kind: 'invalid' });
  });

  it('fails closed for invalid injected clock and expected nonce values', async () => {
    const token = await sign();
    const boundary = verifier();
    for (const value of [undefined, null, 1, '', 'x'.repeat(513)]) expect(await boundary.verify(token, value)).toEqual({ kind: 'invalid' });
    clock = NaN;
    expect(await boundary.verify(token, nonce)).toEqual({ kind: 'invalid' });
  });

  it('rejects malformed, noncompact and oversized token inputs before key lookup', async () => {
    const boundary = verifier();
    const signed = await sign();
    for (const value of [undefined, null, 1, {}, '', 'a.b', 'a.b.c.d', 'a.b.c', signed + ' ', signed.replace('.', '=.'), 'a'.repeat(16385)]) {
      expect(await boundary.verify(value, nonce)).toEqual({ kind: 'invalid' });
    }
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it.each(['jku', 'x5u', 'jwk', 'x5c'])('rejects token-supplied %s trust material without fetching it', async name => {
    const headerValue = name === 'jwk' ? publicJwk : name === 'x5c' ? ['untrusted-certificate'] : 'https://caller.example/keys';
    expect(await verifier().verify(await sign(claims(), { [name]: headerValue }), nonce)).toEqual({ kind: 'invalid' });
    expect(fetchKeys).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps issuer, audience, algorithms and JWKS URL fixed despite extra caller settings', async () => {
    const boundary = verifier({ ...configuration, issuer: 'https://caller.example', jwksUrl: 'https://caller.example/keys', algorithms: ['HS256'] } as AppleVerifierConfiguration);
    expect(await boundary.verify(await sign({ ...claims(), iss: 'https://caller.example' }), nonce)).toEqual({ kind: 'invalid' });
    expect(fetchKeys.mock.calls.every(([url]) => url === 'https://appleid.apple.com/auth/keys')).toBe(true);
  });

  it.each([undefined, '', 1])('requires a bounded string key ID (%j)', async kid => {
    expect(await verifier().verify(await sign(claims(), { kid }), nonce)).toEqual({ kind: 'invalid' });
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it('rejects an unknown or ambiguous key ID without producing identity', async () => {
    expect(await verifier().verify(await sign(claims(), { kid: 'unknown' }), nonce)).toEqual({ kind: 'invalid' });
    fetchKeys.mockImplementation(async () => jsonResponse({ keys: [publicJwk, { ...nextJwk, kid: 'old-key' }] }));
    expect(await verifier().verify(await sign(), nonce)).toEqual({ kind: 'invalid' });
  });

  it('rejects empty sets and keys with wrong type, use, algorithm or key operations', async () => {
    const token = await sign();
    for (const keySet of [[], [{ ...publicJwk, kty: 'oct' }], [{ ...publicJwk, use: 'enc' }], [{ ...publicJwk, alg: 'RS512' }], [{ ...publicJwk, key_ops: ['sign'] }]]) {
      fetchKeys.mockImplementation(async () => jsonResponse({ keys: keySet }));
      expect(await verifier().verify(token, nonce)).toEqual({ kind: 'invalid' });
    }
  });

  it('uses the actual JOSE cooldown and cache during overlap and key removal', async () => {
    const boundary = verifier();
    const oldToken = await sign(), newToken = await sign(claims(), { kid: 'new-key' }, nextPrivate);
    expect((await boundary.verify(oldToken, nonce)).kind).toBe('verified');
    fetchKeys.mockImplementation(async () => jsonResponse({ keys: [publicJwk, nextJwk] }));
    expect(await boundary.verify(newToken, nonce)).toEqual({ kind: 'invalid' });
    clock += 29999;
    expect(await boundary.verify(newToken, nonce)).toEqual({ kind: 'invalid' });
    expect(fetchKeys).toHaveBeenCalledTimes(1);
    clock += 1;
    expect((await boundary.verify(newToken, nonce)).kind).toBe('verified');
    expect((await boundary.verify(oldToken, nonce)).kind).toBe('verified');
    expect(fetchKeys).toHaveBeenCalledTimes(2);
    fetchKeys.mockImplementation(async () => jsonResponse({ keys: [nextJwk] }));
    clock += 3600000 - 1;
    expect((await boundary.verify(oldToken, nonce)).kind).toBe('verified');
    expect(fetchKeys).toHaveBeenCalledTimes(2);
    clock += 1;
    expect(await boundary.verify(oldToken, nonce)).toEqual({ kind: 'invalid' });
    expect((await boundary.verify(newToken, nonce)).kind).toBe('verified');
    expect(fetchKeys).toHaveBeenCalledTimes(3);
  });

  it('does not authorize indefinitely stale keys when cache refresh fails', async () => {
    const boundary = verifier(), token = await sign();
    expect((await boundary.verify(token, nonce)).kind).toBe('verified');
    fetchKeys.mockRejectedValue(new Error('Invented transport failure'));
    clock += 3600000 - 1;
    expect((await boundary.verify(token, nonce)).kind).toBe('verified');
    clock += 1;
    expect(await boundary.verify(token, nonce)).toEqual({ kind: 'keys_unavailable' });
    expect(await boundary.verify(token, nonce)).toEqual({ kind: 'keys_unavailable' });
    expect(fetchKeys).toHaveBeenCalledTimes(3);
  });

  it('coalesces concurrent first and expired-cache fetches through actual JOSE', async () => {
    const boundary = verifier(), token = await sign();
    let gate = deferred<Response>();
    fetchKeys.mockImplementation(() => gate.promise);
    const firstBatch = Promise.all(Array.from({ length: 8 }, () => boundary.verify(token, nonce)));
    await vi.waitFor(() => expect(fetchKeys).toHaveBeenCalledTimes(1));
    gate.resolve(jsonResponse({ keys: [publicJwk] }));
    expect((await firstBatch).every(result => result.kind === 'verified')).toBe(true);
    clock += 3600000;
    gate = deferred<Response>();
    const secondBatch = Promise.all(Array.from({ length: 8 }, () => boundary.verify(token, nonce)));
    await vi.waitFor(() => expect(fetchKeys).toHaveBeenCalledTimes(2));
    gate.resolve(jsonResponse({ keys: [publicJwk] }));
    expect((await secondBatch).every(result => result.kind === 'verified')).toBe(true);
  });

  it('aborts a key-fetch timeout with the actual library AbortSignal', async () => {
    let aborted = false;
    const hanging: FetchImplementation = async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => { aborted = true; reject(options.signal.reason); }, { once: true });
    });
    expect(await verifier({ ...configuration, jwksTimeoutMs: 25 }, hanging).verify(await sign(), nonce)).toEqual({ kind: 'keys_unavailable' });
    expect(aborted).toBe(true);
  });

  it.each([301, 302, 307, 500, 503])('rejects HTTP %i without following redirects or accepting keys', async status => {
    fetchKeys.mockImplementation(async () => new Response(null, { status, headers: { location: 'https://caller.example/keys' } }));
    expect(await verifier().verify(await sign(), nonce)).toEqual({ kind: 'keys_unavailable' });
    expect(fetchKeys).toHaveBeenCalledTimes(1);
    expect(fetchKeys.mock.calls[0][1].redirect).toBe('manual');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sanitizes malformed JSON, invalid sets and malformed public-key imports', async () => {
    const token = await sign();
    const responses: [string, () => Response, 'keys_unavailable' | 'invalid'][] = [
      ['bad JSON', () => new Response('{bad json'), 'keys_unavailable'], ['null set', () => jsonResponse(null), 'keys_unavailable'],
      ['wrong keys type', () => jsonResponse({ keys: 'wrong type' }), 'keys_unavailable'], ['null key', () => jsonResponse({ keys: [null] }), 'keys_unavailable'],
      ['unusable RSA key', () => jsonResponse({ keys: [{ kid: 'old-key', kty: 'RSA', alg: 'RS256', n: 42, e: null }] }), 'invalid'],
    ];
    for (const [name, response, kind] of responses) {
      fetchKeys.mockImplementation(async () => response());
      expect(await verifier().verify(token, nonce), name).toEqual({ kind });
    }
  });

  it('never logs or returns token, nonce, subject, header, body or raw provider exceptions on failure', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info'), vi.spyOn(console, 'debug')];
    const token = await sign();
    const raw = [token, nonce, subject, 'SensitiveHeader', 'SensitiveRequestBody'].join('|');
    fetchKeys.mockRejectedValue(new Error(raw));
    const unavailable = await verifier().verify(token, nonce);
    expect(unavailable).toEqual({ kind: 'keys_unavailable' });
    fetchKeys.mockImplementation(async () => jsonResponse({ keys: [publicJwk] }));
    const invalid = await verifier().verify(await sign({ ...claims(), aud: 'wrong' }), nonce);
    expect(invalid).toEqual({ kind: 'invalid' });
    for (const secret of raw.split('|')) expect(JSON.stringify([unavailable, invalid])).not.toContain(secret);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
