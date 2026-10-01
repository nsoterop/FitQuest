import { KeyObject } from 'node:crypto';
import { SignJWT } from 'jose';

const origin = 'https://appleid.apple.com';
const endpoint = `${origin}/auth/token`;
const maxCodeBytes = 4096;
const maxTokenBytes = 16384;

export type AppleCodeTransportConfiguration = {
  /** Explicit, trusted native App ID. Case is preserved. No configuration discovery. */
  clientId: string;
  teamId: string;
  keyId: string;
  /** Node private EC KeyObject on prime256v1 (P-256); loading/protecting it is a later boundary. */
  privateKey: KeyObject;
  /** Engineering defaults/ceilings, not production policy: 300 seconds, 10 seconds, 64 KiB. */
  clientSecretLifetimeSeconds?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

/** Sensitive in-memory provider material. Parsing does NOT verify identity or grant authority.
 * Later integration MUST verify/pair-match the identity token and protect/link provider credentials.
 * Never log, serialize to clients, cache, persist unprotected, or turn this into a principal.
 */
export type UnverifiedAppleProviderCredentials = Readonly<{
  identityToken: string;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessTokenExpiresInSeconds: number;
}>;
export type AppleCodeTransportResult =
  | { kind: 'parsed'; credentials: UnverifiedAppleProviderCredentials }
  | { kind: 'invalid_input' | 'invalid_configuration' | 'cancelled' | 'provider_rejected' }
  | { kind: 'unavailable'; reason: 'timeout' | 'network' | 'redirect' | 'http' | 'response' };
export interface AppleCodeTransport {
  exchange(code: unknown, signal?: AbortSignal): Promise<AppleCodeTransportResult>;
}
type Failure = Exclude<AppleCodeTransportResult, { kind: 'parsed' }>;
type Seams = { now: () => Date; fetch: typeof fetch; monotonicNow: () => number };
class TransportFailure extends Error {
  constructor(readonly result: Failure) { super('Apple code transport failed'); }
}
const unavailable = (reason: Extract<Failure, { kind: 'unavailable' }>['reason']): Failure => ({ kind: 'unavailable', reason });
const within = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const opaque = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= limit && Buffer.byteLength(value, 'utf8') <= limit;

function configure(input: AppleCodeTransportConfiguration) {
  try {
    const required = ['clientId', 'teamId', 'keyId', 'privateKey'];
    const optional = ['clientSecretLifetimeSeconds', 'timeoutMs', 'maxResponseBytes'];
    // Only own data properties are read. No getters, inherited/ambient secrets or unknown overrides.
    if (!input || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error();
    const properties = Object.getOwnPropertyDescriptors(input);
    if (required.some(key => !Object.hasOwn(properties, key))
      || Reflect.ownKeys(properties).some(key => typeof key !== 'string' || ![...required, ...optional].includes(key)
        || !Object.hasOwn(properties[key]!, 'value'))) throw new Error();
    const option = (key: string, fallback: number): number => properties[key]?.value === undefined ? fallback : properties[key]!.value as number;
    const config = Object.freeze({
      clientId: properties.clientId!.value as string,
      teamId: properties.teamId!.value as string,
      keyId: properties.keyId!.value as string,
      privateKey: properties.privateKey!.value as KeyObject,
      lifetime: option('clientSecretLifetimeSeconds', 300),
      timeout: option('timeoutMs', 10000),
      bytes: option('maxResponseBytes', 65536),
    });
    if (!opaque(config.clientId, 255) || config.clientId.trim() !== config.clientId || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(config.clientId)
      || typeof config.teamId !== 'string' || config.teamId.length !== 10 || !/^[A-Z0-9]{10}$/.test(config.teamId)
      || typeof config.keyId !== 'string' || config.keyId.length !== 10 || !/^[A-Z0-9]{10}$/.test(config.keyId)
      || !(config.privateKey instanceof KeyObject) || config.privateKey.type !== 'private'
      || config.privateKey.asymmetricKeyType !== 'ec' || config.privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
      || !within(config.lifetime, 1, 300) || !within(config.timeout, 1, 10000) || !within(config.bytes, 256, 65536)) throw new Error();
    return config;
  } catch { throw new Error('Invalid Apple code transport configuration'); }
}

function currentSecond(now: () => Date): number {
  try {
    const second = Math.floor(Date.prototype.getTime.call(now()) / 1000);
    if (!within(second, 0, Number.MAX_SAFE_INTEGER - 300)) throw new Error();
    return second;
  } catch { throw new TransportFailure({ kind: 'invalid_configuration' }); }
}

function parseCredentials(body: Uint8Array): UnverifiedAppleProviderCredentials {
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const fields = value as Record<string, unknown>;
    const credential = (token: unknown): token is string => opaque(token, maxTokenBytes) && token.trim().length > 0;
    if (Object.hasOwn(fields, 'error') || !credential(fields.id_token)
      || !credential(fields.access_token) || !credential(fields.refresh_token)
      || typeof fields.token_type !== 'string' || fields.token_type.toLowerCase() !== 'bearer'
      || !within(fields.expires_in, 1, 2147483647)) throw new Error();
    // Extra fields are deliberately ignored, never returned/interpreted as claims or authority.
    // Opaque credentials are preserved byte-for-byte as strings, with no trimming/JWT decoding.
    return Object.freeze({ identityToken: fields.id_token, accessToken: fields.access_token,
      refreshToken: fields.refresh_token, tokenType: 'Bearer', accessTokenExpiresInSeconds: fields.expires_in });
  } catch { throw new TransportFailure(unavailable('response')); }
}

function buildTransport(configuration: AppleCodeTransportConfiguration, seams: Seams): AppleCodeTransport {
  const config = configure(configuration);
  // Snapshot the explicit seam too; no later mutation switches a clock or outbound path.
  const { now, fetch: dispatch, monotonicNow } = seams;
  if (typeof now !== 'function' || typeof dispatch !== 'function' || typeof monotonicNow !== 'function') {
    throw new Error('Invalid Apple code transport configuration');
  }
  return {
    async exchange(code, signal) {
      if (!opaque(code, maxCodeBytes) || Buffer.from(code, 'utf8').toString('utf8') !== code || code.trim().length === 0
        || (signal !== undefined && !(signal instanceof AbortSignal))) return { kind: 'invalid_input' };
      if (signal?.aborted) return { kind: 'cancelled' };
      const controller = new AbortController();
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let terminal: Failure | undefined;
      let resolveStop!: (result: Failure) => void;
      const stopped = new Promise<Failure>(resolve => { resolveStop = resolve; });
      const cleanupReader = (cancel: boolean) => {
        const held = reader;
        reader = undefined;
        if (!held) return;
        // Cancellation itself can stall. Never await it; release pending reads/locks independently.
        if (cancel) { try { void held.cancel().catch(() => {}); } catch { /* sanitized */ } }
        try { held.releaseLock(); } catch { /* sanitized */ }
      };
      const cancelBody = (response: Response) => {
        try { void response.body?.cancel().catch(() => {}); } catch { /* sanitized */ }
      };
      const stop = (result: Failure) => {
        if (terminal) return;
        terminal = result;
        resolveStop(result);
        controller.abort();
        cleanupReader(true);
      };
      let start: number;
      try {
        start = monotonicNow();
        if (!Number.isFinite(start) || start < 0) return { kind: 'invalid_configuration' };
      } catch { return { kind: 'invalid_configuration' }; }
      const ensureOpen = () => {
        if (terminal) throw new TransportFailure(terminal);
        let elapsed: number;
        try { elapsed = monotonicNow() - start; } catch { throw new TransportFailure({ kind: 'invalid_configuration' }); }
        if (!Number.isFinite(elapsed) || elapsed < 0) throw new TransportFailure({ kind: 'invalid_configuration' });
        if (elapsed >= config.timeout) { stop(unavailable('timeout')); throw new TransportFailure(terminal!); }
        if (signal?.aborted) { stop({ kind: 'cancelled' }); throw new TransportFailure(terminal!); }
      };
      const onAbort = () => stop({ kind: 'cancelled' });
      const timer = setTimeout(() => stop(unavailable('timeout')), config.timeout);
      signal?.addEventListener('abort', onAbort, { once: true });
      const work = async (): Promise<AppleCodeTransportResult> => {
        try {
          ensureOpen();
          const issuedAt = currentSecond(now);
          const expiresAt = issuedAt + config.lifetime;
          let secret: string;
          try {
            secret = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: config.keyId })
              .setIssuer(config.teamId).setSubject(config.clientId).setAudience(origin)
              .setIssuedAt(issuedAt).setExpirationTime(expiresAt).sign(config.privateKey);
          } catch { throw new TransportFailure({ kind: 'invalid_configuration' }); }
          ensureOpen();
          const dispatchedAt = currentSecond(now);
          if (dispatchedAt < issuedAt || dispatchedAt >= expiresAt) throw new TransportFailure({ kind: 'invalid_configuration' });
          const form = new URLSearchParams({ client_id: config.clientId, client_secret: secret, code, grant_type: 'authorization_code' });
          // Exactly one dispatch; no retry, refresh flow, redirects, custom TLS/agent, or caller-selected URL.
          const response = await dispatch(endpoint, { method: 'POST', redirect: 'manual', credentials: 'omit',
            cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
            headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form.toString() });
          try { ensureOpen(); } catch (error) { cancelBody(response); throw error; }
          if (response.redirected || (response.status >= 300 && response.status < 400)
            || (response.url !== '' && response.url !== endpoint)) {
            cancelBody(response); throw new TransportFailure(unavailable('redirect'));
          }
          if (response.status !== 200) {
            cancelBody(response);
            throw new TransportFailure(response.status >= 400 && response.status < 500 && response.status !== 429
              ? { kind: 'provider_rejected' } : unavailable('http'));
          }
          const media = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
          const length = response.headers.get('content-length');
          if (media !== 'application/json' || !response.body
            || (length !== null && (!/^\d+$/.test(length) || !within(Number(length), 0, config.bytes)))) {
            cancelBody(response); throw new TransportFailure(unavailable('response'));
          }
          reader = response.body.getReader();
          const activeReader = reader;
          const chunks: Uint8Array[] = [];
          let bytes = 0;
          while (true) {
            ensureOpen();
            const chunk = await activeReader.read();
            ensureOpen();
            if (chunk.done) break;
            if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength > config.bytes - bytes) {
              throw new TransportFailure(unavailable('response'));
            }
            bytes += chunk.value.byteLength;
            // Copy chunks: a transport must not mutate already checked bytes during subsequent reads.
            if (chunk.value.byteLength) chunks.push(chunk.value.slice());
          }
          cleanupReader(false);
          const body = new Uint8Array(bytes);
          let offset = 0;
          for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
          const credentials = parseCredentials(body);
          ensureOpen();
          return { kind: 'parsed', credentials };
        } catch (error) {
          const result = terminal ?? (error instanceof TransportFailure ? error.result : unavailable('network'));
          stop(result);
          return result;
        }
      };
      try {
        const result = await Promise.race([work(), stopped]);
        // Promise continuations can run between parsing and the public return. Recheck at that boundary.
        if (result.kind === 'parsed') {
          try { ensureOpen(); }
          catch (error) {
            const failure = terminal ?? (error instanceof TransportFailure ? error.result : unavailable('network'));
            stop(failure);
            return failure;
          }
        }
        return terminal ?? result;
      }
      finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        cleanupReader(terminal !== undefined);
      }
    },
  };
}

/** Unused server factory. Construction performs no I/O; Node fetch keeps default HTTPS verification. */
export function createAppleCodeTransport(configuration: AppleCodeTransportConfiguration): AppleCodeTransport {
  return buildTransport(configuration, { now: () => new Date(), fetch: globalThis.fetch, monotonicNow: () => performance.now() });
}

/** Explicit offline-test seam, never an environment-selected provider or runtime fallback. */
export function createAppleCodeTransportForTest(configuration: AppleCodeTransportConfiguration,
  seams: { now: () => Date; fetch: typeof fetch; monotonicNow?: () => number }): AppleCodeTransport {
  return buildTransport(configuration, { ...seams, monotonicNow: seams.monotonicNow ?? (() => performance.now()) });
}
