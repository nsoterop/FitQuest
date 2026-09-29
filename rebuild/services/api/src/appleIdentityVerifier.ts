import { createRemoteJWKSet, customFetch, decodeProtectedHeader, errors, jwtVerify, type FetchImplementation, type JWTVerifyGetKey } from 'jose';

const issuer = 'https://appleid.apple.com' as const;
const jwksUrl = 'https://appleid.apple.com/auth/keys';
const maxTokenLength = 16384;
const boundedString = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const numericDate = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export type AppleVerifierConfiguration = {
  /** Exact native client ID from trusted server configuration; there is no default. */
  clientId: string;
  jwtClockToleranceSeconds?: number;
  jwksTimeoutMs?: number;
  jwksCooldownMs?: number;
  jwksCacheMaxAgeMs?: number;
};
export type VerifiedAppleIdentity = Readonly<{ provider: 'apple'; issuer: typeof issuer; subject: string; audience: string }>;
export type AppleVerificationResult = { kind: 'verified'; identity: VerifiedAppleIdentity } | { kind: 'invalid' | 'keys_unavailable' };
export interface AppleIdentityTokenVerifier {
  /** expectedNonce must come from the server's stored challenge, never untrusted token claims. */
  verify(token: unknown, expectedNonce: unknown): Promise<AppleVerificationResult>;
}

class KeysUnavailable extends Error {}

function configure(input: AppleVerifierConfiguration) {
  const values = {
    clientId: input.clientId,
    tolerance: input.jwtClockToleranceSeconds ?? 60,
    timeout: input.jwksTimeoutMs ?? 5000,
    cooldown: input.jwksCooldownMs ?? 30000,
    cacheAge: input.jwksCacheMaxAgeMs ?? 3600000,
  };
  const within = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;
  if (!boundedString(values.clientId, 255) || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(values.clientId)
    || !within(values.tolerance, 0, 60) || !within(values.timeout, 1, 5000)
    || !within(values.cooldown, 0, 30000) || !within(values.cacheAge, 1, 3600000)) {
    throw new Error('Invalid Apple verifier configuration');
  }
  return values;
}

function buildVerifier(configuration: AppleVerifierConfiguration, now: () => Date, transport?: FetchImplementation): AppleIdentityTokenVerifier {
  const config = configure(configuration);
  // Construction is lazy: JOSE fetches only when a verification needs keys. No seeded/stale fallback cache.
  const keys = createRemoteJWKSet(new URL(jwksUrl), {
    timeoutDuration: config.timeout, cooldownDuration: config.cooldown, cacheMaxAge: config.cacheAge,
    ...(transport ? { [customFetch]: transport } : {}),
  });
  const resolve: JWTVerifyGetKey = async (header, token) => {
    try { return await keys(header, token); }
    catch (error) {
      // A successfully obtained set with no unique matching key is unverifiable, not an outage.
      if (error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSMultipleMatchingKeys) throw error;
      // Never propagate provider/library errors, which can carry sensitive data.
      throw new KeysUnavailable();
    }
  };
  return {
    async verify(token, expectedNonce) {
      if (!boundedString(token, maxTokenLength) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
        || !boundedString(expectedNonce, 512)) return { kind: 'invalid' };
      try {
        const header = decodeProtectedHeader(token);
        // Decoding is only a rejection precheck; it never establishes identity or chooses a trust source.
        if (header.alg !== 'RS256' || !boundedString(header.kid, 256)
          || ['jku', 'x5u', 'jwk', 'x5c', 'crit', 'b64'].some(key => Object.hasOwn(header, key))) return { kind: 'invalid' };
        const currentDate = now();
        if (!Number.isFinite(currentDate.getTime())) return { kind: 'invalid' };
        const { payload } = await jwtVerify(token, resolve, {
          algorithms: ['RS256'], issuer, audience: config.clientId,
          requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat', 'nonce'],
          clockTolerance: config.tolerance, currentDate,
        });
        // Key retrieval/signature work may take time; the tolerance also bounds the completion time.
        const verifiedAt = now().getTime();
        if (!Number.isFinite(verifiedAt)) return { kind: 'invalid' };
        const currentSecond = Math.floor(verifiedAt / 1000);
        // Native Apple audience is one exact client ID. Subject/nonce remain opaque and case-sensitive.
        if (payload.iss !== issuer || payload.aud !== config.clientId || !boundedString(payload.sub, 512)
          || payload.nonce !== expectedNonce || !numericDate(payload.iat) || !numericDate(payload.exp)
          || payload.exp <= payload.iat || payload.exp <= currentSecond - config.tolerance || payload.iat > currentSecond + config.tolerance
          || (payload.nbf !== undefined && (!numericDate(payload.nbf) || payload.nbf >= payload.exp || payload.nbf > currentSecond + config.tolerance))) return { kind: 'invalid' };
        return { kind: 'verified', identity: { provider: 'apple', issuer, subject: payload.sub, audience: config.clientId } };
      } catch (error) {
        return { kind: error instanceof KeysUnavailable ? 'keys_unavailable' : 'invalid' };
      }
    },
  };
}

/** Unused server boundary. Import/construction does not perform provider I/O or grant FitQuest authority. */
export function createAppleIdentityTokenVerifier(configuration: AppleVerifierConfiguration): AppleIdentityTokenVerifier {
  return buildVerifier(configuration, () => new Date());
}

/** Explicit internal offline-test seam; never selected by environment variables or runtime fallback. */
export function createAppleIdentityTokenVerifierForTest(configuration: AppleVerifierConfiguration,
  seams: { now: () => Date; fetch: FetchImplementation }): AppleIdentityTokenVerifier {
  return buildVerifier(configuration, seams.now, seams.fetch);
}
