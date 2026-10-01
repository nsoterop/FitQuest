import { createSecretKey, generateKeyPairSync, verify } from 'node:crypto';
import { decodeProtectedHeader, jwtVerify, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppleCodeTransport, createAppleCodeTransportForTest, type AppleCodeTransportConfiguration } from './appleCodeTransport';

const endpoint = 'https://appleid.apple.com/auth/token';
const time = Date.parse('2026-10-01T12:00:00.987Z');
const first = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const next = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const config = (): AppleCodeTransportConfiguration => ({ clientId: 'com.Example.FitQuest', teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: first.privateKey });
const payload = () => ({ id_token: ' opaque.Identity.Token ', access_token: ' opaque access +/&= ', refresh_token: ' opaque refresh +/&= ', token_type: 'Bearer', expires_in: 3600 });
const json = (value: unknown = payload(), headers?: Record<string, string>) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', ...headers } });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

describe('unused offline Apple authorization-code signer and transport', () => {
  let clock: number;
  let fetchStub: ReturnType<typeof vi.fn<typeof fetch>>;
  const transport = (settings = config(), fetcher: typeof fetch = fetchStub, now: () => Date = () => new Date(clock), monotonicNow?: () => number) =>
    createAppleCodeTransportForTest(settings, { now, fetch: fetcher, monotonicNow });
  beforeEach(() => {
    clock = time;
    fetchStub = vi.fn<typeof fetch>(async () => json());
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => { throw new Error('Unexpected outbound call'); }));
  });
  afterEach(() => {
    // All test factories use an injected path, except the explicitly intercepted runtime test.
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  });

  it('constructs without I/O and signs ES256 with independently verified exact claims and form', async () => {
    createAppleCodeTransport(config());
    const boundary = transport();
    expect(fetchStub).not.toHaveBeenCalled();
    const code = ' Native +/&= Code 😃 ';
    const result = await boundary.exchange(code);
    expect(result).toEqual({ kind: 'parsed', credentials: { identityToken: payload().id_token, accessToken: payload().access_token,
      refreshToken: payload().refresh_token, tokenType: 'Bearer', accessTokenExpiresInSeconds: 3600 } });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, options] = fetchStub.mock.calls[0];
    expect(url).toBe(endpoint);
    expect(options).toMatchObject({ method: 'POST', redirect: 'manual', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' } });
    expect(Object.keys(options!).sort()).toEqual(['body', 'cache', 'credentials', 'headers', 'method', 'redirect', 'referrerPolicy', 'signal']);
    expect(options!.signal).toBeInstanceOf(AbortSignal);
    const form = new URLSearchParams(options!.body as string);
    expect([...form.keys()].sort()).toEqual(['client_id', 'client_secret', 'code', 'grant_type']);
    expect(form.get('client_id')).toBe(config().clientId);
    expect(form.get('code') === code).toBe(true);
    expect(form.get('grant_type')).toBe('authorization_code');
    const secret = form.get('client_secret')!;
    expect(decodeProtectedHeader(secret)).toEqual({ alg: 'ES256', kid: config().keyId });
    const checked = await jwtVerify(secret, first.publicKey, { algorithms: ['ES256'], issuer: config().teamId,
      subject: config().clientId, audience: 'https://appleid.apple.com', currentDate: new Date(clock) });
    expect(checked.payload).toEqual({ iss: config().teamId, sub: config().clientId, aud: 'https://appleid.apple.com',
      iat: Math.floor(time / 1000), exp: Math.floor(time / 1000) + 300 });
    const parts = secret.split('.');
    expect(verify('sha256', Buffer.from(parts.slice(0, 2).join('.')), { key: first.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'))).toBe(true);
    expect(verify('sha256', Buffer.from(parts.slice(0, 2).join('.')), { key: next.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'))).toBe(false);
    if (result.kind === 'parsed') expect(Object.isFrozen(result.credentials)).toBe(true);
  });

  it('intercepts the runtime factory as well, with no environment fake-provider selection', async () => {
    const guard = globalThis.fetch;
    vi.stubGlobal('fetch', fetchStub);
    try {
      const runtime = createAppleCodeTransport(config());
      expect(fetchStub).not.toHaveBeenCalled();
      expect((await runtime.exchange('invented runtime code')).kind).toBe('parsed');
      expect(fetchStub).toHaveBeenCalledTimes(1);
      expect(fetchStub.mock.calls[0][0]).toBe(endpoint);
    } finally { vi.stubGlobal('fetch', guard); }
  });

  it('copies configuration, signs freshly, and replaces keys only through a new trusted factory', async () => {
    const mutable = config();
    const boundary = transport(mutable);
    mutable.clientId = 'com.attacker.changed'; mutable.teamId = 'WRONG12345'; mutable.keyId = 'OTHER12345'; mutable.privateKey = next.privateKey;
    await boundary.exchange('one');
    clock += 1000;
    await boundary.exchange('two');
    await transport({ ...config(), privateKey: next.privateKey, keyId: 'NEXT123456' }).exchange('three');
    const secrets = fetchStub.mock.calls.map(([, options]) => new URLSearchParams(options!.body as string).get('client_secret')!);
    expect(secrets[0] !== secrets[1]).toBe(true);
    for (const [index, secret] of secrets.entries()) {
      const { payload: claims, protectedHeader } = await jwtVerify(secret, index < 2 ? first.publicKey : next.publicKey,
        { algorithms: ['ES256'], issuer: config().teamId, audience: 'https://appleid.apple.com', subject: config().clientId, currentDate: new Date(clock) });
      expect(claims.iat).toBe(Math.floor(time / 1000) + (index > 0 ? 1 : 0));
      expect(protectedHeader.kid).toBe(index < 2 ? config().keyId : 'NEXT123456');
    }
  });

  it.each([1, 300])('uses the bounded configured lifetime %i', async lifetime => {
    await transport({ ...config(), clientSecretLifetimeSeconds: lifetime }).exchange('invented');
    const secret = new URLSearchParams(fetchStub.mock.calls[0][1]!.body as string).get('client_secret')!;
    const { payload: claims } = await jwtVerify(secret, first.publicKey, { currentDate: new Date(clock) });
    expect(claims.exp! - claims.iat!).toBe(lifetime);
    clock = claims.exp! * 1000;
    await expect(jwtVerify(secret, first.publicKey, { currentDate: new Date(clock) })).rejects.toMatchObject({ code: 'ERR_JWT_EXPIRED' });
    await expect(jwtVerify(secret, first.publicKey, { subject: config().clientId.toLowerCase(), currentDate: new Date(time) })).rejects.toMatchObject({ code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' });
  });

  it.each([
    { clientId: '' }, { clientId: 'com.example app' }, { clientId: ' com.example.app' }, { clientId: 'com.example.app ' }, { clientId: 'x'.repeat(256) },
    { clientId: 'com.example.app\n' }, { teamId: 'TEAM123456\n' }, { keyId: 'KEY1234567\n' },
    { teamId: '' }, { teamId: 'lower12345' }, { teamId: 'TEAM1234567' }, { keyId: 'bad' }, { keyId: 123 },
    { clientSecretLifetimeSeconds: 0 }, { clientSecretLifetimeSeconds: 301 }, { clientSecretLifetimeSeconds: 1.5 }, { clientSecretLifetimeSeconds: null },
    { timeoutMs: 0 }, { timeoutMs: 10001 }, { timeoutMs: NaN }, { timeoutMs: Infinity }, { timeoutMs: null },
    { maxResponseBytes: 255 }, { maxResponseBytes: 65537 }, { maxResponseBytes: Infinity }, { maxResponseBytes: null },
    { endpoint: 'https://attacker.example/token' }, { audience: 'attacker' }, { algorithm: 'HS256' }, { redirectUri: 'https://attacker.example' }, { environment: 'fake' },
  ])('rejects malformed/unbounded or unrecognized trusted configuration %# before any dispatch', changes => {
    expect(() => transport({ ...config(), ...changes } as AppleCodeTransportConfiguration)).toThrow('Invalid Apple code transport configuration');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('rejects unsuitable keys, absent/inherited/accessor configuration, and redacts construction exceptions', () => {
    for (const privateKey of [first.publicKey, generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey,
      generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, createSecretKey(Buffer.alloc(32)), {}, 'invented sensitive PEM']) {
      expect(() => transport({ ...config(), privateKey } as AppleCodeTransportConfiguration)).toThrow('Invalid Apple code transport configuration');
    }
    const getter = vi.fn(() => { throw new Error('sensitive getter secret'); });
    const accessor = Object.defineProperty({ ...config() }, 'privateKey', { get: getter });
    for (const value of [undefined, null, {}, Object.create(config()), accessor, new Proxy({}, { getPrototypeOf: getter })]) {
      try { createAppleCodeTransportForTest(value as AppleCodeTransportConfiguration, { now: () => new Date(clock), fetch: fetchStub }); throw new Error('unexpected acceptance'); }
      catch (error) { expect((error as Error).message).toBe('Invalid Apple code transport configuration'); }
    }
    // The proxy traps, but the key getter must never be invoked.
    expect(getter).toHaveBeenCalledTimes(1);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 1, {}, '', ' ', '\n\t', 'x'.repeat(4097), '😃'.repeat(1025), '\ud800'])('rejects malformed code %# before signing/dispatch', async code => {
    const now = vi.fn(() => new Date(clock));
    expect(await transport(config(), fetchStub, now).exchange(code)).toEqual({ kind: 'invalid_input' });
    expect(now).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('accepts exactly the code byte ceiling without altering it', async () => {
    const code = '😃'.repeat(1024);
    expect((await transport().exchange(code)).kind).toBe('parsed');
    expect(new URLSearchParams(fetchStub.mock.calls[0][1]!.body as string).get('code') === code).toBe(true);
  });

  it('handles invalid and pre-aborted caller signals before signing/dispatch', async () => {
    const now = vi.fn(() => new Date(clock));
    const boundary = transport(config(), fetchStub, now);
    expect(await boundary.exchange('invented', {} as AbortSignal)).toEqual({ kind: 'invalid_input' });
    const caller = new AbortController(); caller.abort(new Error('sensitive abort reason'));
    expect(await boundary.exchange('invented', caller.signal)).toEqual({ kind: 'cancelled' });
    expect(now).not.toHaveBeenCalled(); expect(fetchStub).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1])('rejects invalid UTC time %s before dispatch', async value => {
    clock = value;
    expect(await transport().exchange('invented')).toEqual({ kind: 'invalid_configuration' });
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it('sanitizes a throwing UTC clock and rejects expired or reversed time after signing', async () => {
    expect(await transport(config(), fetchStub, () => { throw new Error('clock secret'); }).exchange('invented')).toEqual({ kind: 'invalid_configuration' });
    for (const shift of [-1000, 300000]) {
      const now = vi.fn().mockReturnValueOnce(new Date(time)).mockReturnValue(new Date(time + shift));
      expect(await transport(config(), fetchStub, now).exchange('invented')).toEqual({ kind: 'invalid_configuration' });
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1])('rejects invalid monotonic time %s before dispatch', async value => {
    expect(await transport(config(), fetchStub, () => new Date(clock), () => value).exchange('invented')).toEqual({ kind: 'invalid_configuration' });
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it('covers deadline expiry during signing before timer execution and dispatch', async () => {
    let calls = 0;
    const monotonic = () => ++calls < 3 ? 0 : 10000;
    expect(await transport(config(), fetchStub, () => new Date(clock), monotonic).exchange('invented')).toEqual({ kind: 'unavailable', reason: 'timeout' });
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it('sanitizes signing failures and cancels a stalled signer before dispatch', async () => {
    const signer = vi.spyOn(SignJWT.prototype, 'sign');
    signer.mockRejectedValueOnce(new Error('sensitive signing key failure'));
    expect(await transport().exchange('invented')).toEqual({ kind: 'invalid_configuration' });
    const gate = deferred<string>(); const entered = deferred<void>(); const caller = new AbortController();
    signer.mockImplementationOnce(() => { entered.resolve(); return gate.promise; });
    const promise = transport().exchange('invented', caller.signal);
    await entered.promise; caller.abort();
    expect(await promise).toEqual({ kind: 'cancelled' });
    gate.resolve('invented late secret'); await Promise.resolve(); await Promise.resolve();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it.each([301, 302, 303, 307, 308, 429, 500, 503, 400, 401, 403, 404, 204])('does not retry status %i or read/echo its body', async status => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; } });
    fetchStub.mockResolvedValueOnce(new Response(status === 204 ? null : body, { status, headers: { location: 'https://attacker.example' } }));
    const result = await transport().exchange('invented secret code');
    expect(result).toEqual(status >= 300 && status < 400 ? { kind: 'unavailable', reason: 'redirect' }
      : status >= 400 && status < 500 && status !== 429 ? { kind: 'provider_rejected' } : { kind: 'unavailable', reason: 'http' });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(status === 204 ? 0 : 1);
  });
  it.each(['redirected', 'foreign-url'])('rejects %s success with no second request', async mode => {
    const response = json();
    Object.defineProperty(response, mode === 'redirected' ? 'redirected' : 'url', { value: mode === 'redirected' ? true : 'https://attacker.example/token' });
    fetchStub.mockResolvedValue(response);
    expect(await transport().exchange('invented')).toEqual({ kind: 'unavailable', reason: 'redirect' });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
  it('sanitizes provider exceptions including synchronous dispatch failures, without logging', async () => {
    const log = vi.spyOn(console, 'log'); const error = vi.spyOn(console, 'error'); const warn = vi.spyOn(console, 'warn');
    for (const fetcher of [async () => { throw new Error('raw provider body/code/client_secret/private_key'); },
      () => { throw new Error('synchronous sensitive provider error'); }]) {
      const injected = vi.fn<typeof fetch>(fetcher);
      expect(await transport(config(), injected).exchange('invented secret code')).toEqual({ kind: 'unavailable', reason: 'network' });
      expect(injected).toHaveBeenCalledTimes(1);
    }
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong-media', () => new Response(JSON.stringify(payload()), { headers: { 'content-type': 'text/plain' } })],
    ['missing-media', () => new Response(JSON.stringify(payload()))],
    ['null-body', () => new Response(null, { headers: { 'content-type': 'application/json' } })],
    ['malformed-json', () => new Response('{sensitive invalid json', { headers: { 'content-type': 'application/json' } })],
    ['invalid-utf8', () => new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } })],
    ['oversize-length', () => json(payload(), { 'content-length': '65537' })],
    ['malformed-length', () => json(payload(), { 'content-length': 'NaN' })],
    ['negative-length', () => json(payload(), { 'content-length': '-1' })],
    ['array', () => json([payload()])], ['null', () => json(null)], ['string', () => json('sensitive data')],
    ['error-on-success', () => json({ ...payload(), error: 'invalid_grant', error_description: 'raw code' })],
  ] as const)('rejects %s response', async (_label, response) => {
    fetchStub.mockResolvedValueOnce(response());
    expect(await transport().exchange('invented')).toEqual({ kind: 'unavailable', reason: 'response' });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
  it.each(['id_token', 'access_token', 'refresh_token', 'token_type', 'expires_in'])('requires %s in an authorization-code response', async field => {
    const value: Record<string, unknown> = payload(); delete value[field];
    fetchStub.mockResolvedValueOnce(json(value));
    expect(await transport().exchange('invented')).toEqual({ kind: 'unavailable', reason: 'response' });
  });
  it.each([
    ['id_token', ''], ['access_token', ''], ['refresh_token', ''], ['id_token', null], ['access_token', 1], ['refresh_token', {}],
    ['id_token', 'x'.repeat(16385)], ['access_token', 'x'.repeat(16385)], ['refresh_token', '😃'.repeat(4097)],
    ['token_type', ' Bearer'], ['token_type', 'Basic'], ['token_type', 1], ['expires_in', '3600'], ['expires_in', 0],
    ['token_type', 'Bearer\n'],
    ['expires_in', -1], ['expires_in', 1.5], ['expires_in', null], ['expires_in', 2147483648],
    ['id_token', ' '], ['access_token', '\t'], ['refresh_token', '\n'],
  ])('rejects malformed or unbounded credential field %s %#', async (field, value) => {
    fetchStub.mockResolvedValueOnce(json({ ...payload(), [field]: value }));
    expect(await transport().exchange('invented')).toEqual({ kind: 'unavailable', reason: 'response' });
  });
  it('preserves bounded opaque strings, allows media parameters, and drops extra non-authoritative fields', async () => {
    const value = { ...payload(), id_token: '😃'.repeat(4096), access_token: 'x'.repeat(16384), refresh_token: 'x'.repeat(16384), expires_in: 2147483647,
      sub: 'attacker claim', email: 'invented@example.test', authenticated: true, principal: { role: 'admin' } };
    fetchStub.mockResolvedValueOnce(json(value, { 'content-type': 'Application/JSON; charset=utf-8' }));
    const result = await transport().exchange('invented');
    expect(result.kind).toBe('parsed');
    if (result.kind !== 'parsed') throw new Error('Expected parsed credentials');
    expect(Object.keys(result.credentials).sort()).toEqual(['accessToken', 'accessTokenExpiresInSeconds', 'identityToken', 'refreshToken', 'tokenType']);
    expect(result.credentials.identityToken === value.id_token && result.credentials.accessToken === value.access_token && result.credentials.refreshToken === value.refresh_token).toBe(true);
    expect(result.credentials.accessTokenExpiresInSeconds).toBe(2147483647);
  });
  it('accepts case-insensitive OAuth bearer type, normalizing only that non-credential field', async () => {
    for (const token_type of ['bearer', 'BEARER', 'bEaReR']) {
      fetchStub.mockResolvedValueOnce(json({ ...payload(), token_type }));
      const result = await transport().exchange('invented');
      expect(result.kind === 'parsed' && result.credentials.tokenType === 'Bearer'
        && result.credentials.accessToken === payload().access_token).toBe(true);
    }
  });
  it('reads chunked UTF-8 across byte boundaries and releases the completed reader', async () => {
    const bytes = Buffer.from(JSON.stringify({ ...payload(), access_token: '😃é' }));
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    fetchStub.mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'application/json' } }));
    const result = await transport().exchange('invented');
    expect(result.kind === 'parsed' && result.credentials.accessToken === '😃é').toBe(true);
    expect(body.locked).toBe(false);
  });
  it('enforces actual accumulated bytes despite a misleading content-length and cancels oversize streams', async () => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(200)); controller.enqueue(new Uint8Array(100));
    }, cancel() { cancelled++; } });
    fetchStub.mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'application/json', 'content-length': '1' } }));
    expect(await transport({ ...config(), maxResponseBytes: 256 }).exchange('invented')).toEqual({ kind: 'unavailable', reason: 'response' });
    expect(cancelled).toBe(1); expect(body.locked).toBe(false); expect(fetchStub).toHaveBeenCalledTimes(1);
  });
  it('checks the configured exact byte limit and rejects a single byte beyond it', async () => {
    const source = JSON.stringify(payload());
    const limit = 512;
    fetchStub.mockResolvedValueOnce(new Response(source.padEnd(limit, ' '), { headers: { 'content-type': 'application/json' } }));
    expect((await transport({ ...config(), maxResponseBytes: limit }).exchange('invented')).kind).toBe('parsed');
    fetchStub.mockResolvedValueOnce(new Response(source.padEnd(limit + 1, ' '), { headers: { 'content-type': 'application/json' } }));
    expect(await transport({ ...config(), maxResponseBytes: limit }).exchange('invented')).toEqual({ kind: 'unavailable', reason: 'response' });
  });

  it('cancels an ignored-abort dispatch and cancels its late response without success or retry', async () => {
    const gate = deferred<Response>(); const entered = deferred<void>();
    const caller = new AbortController();
    fetchStub.mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    const promise = transport().exchange('invented', caller.signal);
    await entered.promise; caller.abort(new Error('sensitive caller reason'));
    expect(await promise).toEqual({ kind: 'cancelled' });
    expect(fetchStub.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    const cancelled = deferred<void>();
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled.resolve(); } });
    gate.resolve(new Response(body)); await cancelled.promise;
    expect(body.locked).toBe(false); expect(fetchStub).toHaveBeenCalledTimes(1);
  });
  it('cancels during body consumption even if underlying cancel never settles', async () => {
    const entered = deferred<void>(); let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; return new Promise(() => {}); } });
    const getReader = body.getReader.bind(body);
    vi.spyOn(body, 'getReader').mockImplementation(() => { entered.resolve(); return getReader(); });
    const caller = new AbortController();
    fetchStub.mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'application/json' } }));
    const promise = transport().exchange('invented', caller.signal);
    await entered.promise; caller.abort();
    expect(await promise).toEqual({ kind: 'cancelled' });
    expect(cancelled).toBe(1); expect(body.locked).toBe(false);
  });
  it('times out an ignored-abort fetch, cleans timers/listeners, and discards a late success', async () => {
    vi.useFakeTimers();
    const gate = deferred<Response>(); const entered = deferred<void>(); const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    fetchStub.mockImplementationOnce(async () => { entered.resolve(); return gate.promise; });
    const promise = transport({ ...config(), timeoutMs: 50 }).exchange('invented', caller.signal);
    await entered.promise; await vi.advanceTimersByTimeAsync(50);
    expect(await promise).toEqual({ kind: 'unavailable', reason: 'timeout' });
    expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalled();
    expect(fetchStub.mock.calls[0][1]!.signal!.aborted).toBe(true);
    const response = json(); gate.resolve(response); await Promise.resolve(); await Promise.resolve();
    expect(response.body!.locked).toBe(false); expect(fetchStub).toHaveBeenCalledTimes(1);
  });
  it('bounds the total time through a stalled body, with nonsettling cancellation', async () => {
    vi.useFakeTimers();
    const entered = deferred<void>(); let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; return new Promise(() => {}); } });
    const getReader = body.getReader.bind(body);
    vi.spyOn(body, 'getReader').mockImplementation(() => { entered.resolve(); return getReader(); });
    fetchStub.mockResolvedValueOnce(new Response(body, { headers: { 'content-type': 'application/json' } }));
    const promise = transport({ ...config(), timeoutMs: 50 }).exchange('invented');
    await entered.promise; await vi.advanceTimersByTimeAsync(50);
    expect(await promise).toEqual({ kind: 'unavailable', reason: 'timeout' });
    expect(cancelled).toBe(1); expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
  it('uses one total deadline across delayed headers and body consumption', async () => {
    vi.useFakeTimers();
    const headers = deferred<Response>(); const entered = deferred<void>(); const reading = deferred<void>();
    const body = new ReadableStream<Uint8Array>(); const getReader = body.getReader.bind(body);
    vi.spyOn(body, 'getReader').mockImplementation(() => { reading.resolve(); return getReader(); });
    fetchStub.mockImplementationOnce(async () => { entered.resolve(); return headers.promise; });
    const promise = transport({ ...config(), timeoutMs: 50 }).exchange('invented');
    await entered.promise; await vi.advanceTimersByTimeAsync(30);
    headers.resolve(new Response(body, { headers: { 'content-type': 'application/json' } }));
    await reading.promise; await vi.advanceTimersByTimeAsync(20);
    expect(await promise).toEqual({ kind: 'unavailable', reason: 'timeout' });
    expect(body.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects late headers using the total clock even before the deadline timer executes', async () => {
    let elapsed = 0; let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; } });
    fetchStub.mockImplementationOnce(async () => { elapsed = 10000; return new Response(body); });
    expect(await transport(config(), fetchStub, () => new Date(clock), () => elapsed).exchange('invented')).toEqual({ kind: 'unavailable', reason: 'timeout' });
    expect(cancelled).toBe(1);
  });
  it('rejects late body completion and parser completion even without timer delivery', async () => {
    for (const point of ['body', 'parse']) {
      let calls = 0;
      // start, before signing, before dispatch, after headers, before read, after read,
      // before EOF, after EOF, after parsing.
      const monotonic = () => ++calls >= (point === 'body' ? 6 : 9) ? 10000 : 0;
      expect(await transport(config(), fetchStub, () => new Date(clock), monotonic).exchange('invented')).toEqual({ kind: 'unavailable', reason: 'timeout' });
    }
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
  it('rechecks the deadline and cancellation at the public return after parsing', async () => {
    for (const condition of ['deadline', 'abort']) {
      let calls = 0; const caller = new AbortController();
      const monotonic = () => {
        calls++;
        if (condition === 'abort' && calls === 9) queueMicrotask(() => caller.abort());
        return condition === 'deadline' && calls >= 10 ? 10000 : 0;
      };
      expect(await transport(config(), fetchStub, () => new Date(clock), monotonic).exchange('invented', caller.signal))
        .toEqual(condition === 'deadline' ? { kind: 'unavailable', reason: 'timeout' } : { kind: 'cancelled' });
    }
  });
  it('removes listeners and timers after success, rejection, and malformed response', async () => {
    vi.useFakeTimers();
    for (const response of [json(), new Response('sensitive error', { status: 400 }), json({})]) {
      const caller = new AbortController(); const remove = vi.spyOn(caller.signal, 'removeEventListener');
      fetchStub.mockResolvedValueOnce(response);
      await transport().exchange('invented', caller.signal);
      expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    }
  });
});
