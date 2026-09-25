import { describe, expect, it } from 'vitest';
import {
  ActivationRequestSchema, ActiveIdentitySchema, AppleChallengeSchema, AppleExchangeSchema,
  AuthChallengeRequestSchema, AuthErrorSchema, IdentityResponseSchema, LogoutRequestSchema,
  PendingCredentialsSchema, PersistedCredentialsSchema, RefreshRequestSchema, CommandSchema, canonicalCommand,
} from './index';

const accountId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const bundle = {
  accountId, sessionId, credentialGeneration: 1, accessToken: 'access-secret',
  accessExpiresAt: '2026-09-25T10:15:00.000Z', refreshToken: 'refresh-secret',
  refreshExpiresAt: '2026-10-25T10:00:00.000Z', sessionExpiresAt: '2026-12-24T10:00:00.000Z',
  revocationToken: 'revoke-secret', activationExpiresAt: '2026-09-25T10:05:00.000Z',
};
const persisted = { version: 1, environment: 'development', localEpoch: 1, phase: 'refresh_prepared', operationId, bundle };

describe('additive M1c.1 authentication contracts', () => {
  it('accepts the exact challenge, exchange and empty challenge request', () => {
    expect(AuthChallengeRequestSchema.safeParse({}).success).toBe(true);
    expect(AppleChallengeSchema.safeParse({ challengeId: operationId, nonce: 'nonce', state: 'state', expiresAt: bundle.activationExpiresAt }).success).toBe(true);
    expect(AppleExchangeSchema.safeParse({ challengeId: operationId, state: 'state', identityToken: 'jwt', authorizationCode: 'one-use-code' }).success).toBe(true);
    expect(AuthChallengeRequestSchema.safeParse({ accountId }).success).toBe(false);
    expect(AppleExchangeSchema.safeParse({ challengeId: operationId, state: 'state', identityToken: 'jwt' }).success).toBe(false);
    expect(AppleExchangeSchema.safeParse({ challengeId: operationId, state: 'state', identityToken: 'x'.repeat(16385), authorizationCode: 'code' }).success).toBe(false);
  });
  it('validates a complete pending bundle with bounded secrets and coherent deadlines', () => {
    expect(PendingCredentialsSchema.safeParse(bundle).success).toBe(true);
    for (const invalid of [
      { ...bundle, accountId: 'A' }, { ...bundle, credentialGeneration: 0 }, { ...bundle, credentialGeneration: Number.MAX_SAFE_INTEGER + 1 },
      { ...bundle, accessToken: '' }, { ...bundle, refreshToken: 'x'.repeat(4097) },
      { ...bundle, accessExpiresAt: 'yesterday' }, { ...bundle, activationExpiresAt: '2026-09-25T10:16:00.000Z' },
      { ...bundle, refreshExpiresAt: '2026-09-25T10:10:00.000Z' },
      { ...bundle, refreshExpiresAt: '2027-01-01T00:00:00.000Z' }, { ...bundle, extra: 'not allowed' },
    ]) expect(PendingCredentialsSchema.safeParse(invalid).success).toBe(false);
  });
  it('keeps activation, refresh, logout, identity and error envelopes strict', () => {
    expect(ActivationRequestSchema.safeParse({ sessionId, credentialGeneration: 1 }).success).toBe(true);
    expect(RefreshRequestSchema.safeParse({ operationId, refreshToken: bundle.refreshToken }).success).toBe(true);
    expect(LogoutRequestSchema.safeParse({ revocationToken: bundle.revocationToken }).success).toBe(true);
    expect(ActiveIdentitySchema.safeParse({ accountId, sessionId, credentialGeneration: 1 }).success).toBe(true);
    expect(AuthErrorSchema.safeParse({ code: 'AUTH_RATE_LIMITED', requestId: operationId, retryable: true, retryAfterSeconds: 30 }).success).toBe(true);
    expect(ActivationRequestSchema.safeParse({ sessionId, credentialGeneration: 1, accountId }).success).toBe(false);
    expect(RefreshRequestSchema.safeParse({ operationId, refreshToken: '' }).success).toBe(false);
    expect(LogoutRequestSchema.safeParse({ revocationToken: bundle.revocationToken, accountId }).success).toBe(false);
    expect(ActiveIdentitySchema.safeParse({ accountId, sessionId, credentialGeneration: -1 }).success).toBe(false);
    expect(AuthErrorSchema.safeParse({ code: 'AUTH_RATE_LIMITED', requestId: operationId, retryable: false, retryAfterSeconds: 30 }).success).toBe(false);
    expect(AuthErrorSchema.safeParse({ code: 'SESSION_REVOKED', requestId: operationId, retryable: false, message: 'raw secret' }).success).toBe(false);
  });
  it('requires one complete versioned bundle in each persisted phase', () => {
    expect(PersistedCredentialsSchema.safeParse(persisted).success).toBe(true);
    expect(PersistedCredentialsSchema.safeParse({ ...persisted, phase: 'reauth_required' }).success).toBe(true);
    expect(PersistedCredentialsSchema.safeParse({ version: 1, environment: 'development', localEpoch: 1, phase: 'activation_pending', origin: 'refresh', bundle }).success).toBe(true);
    expect(PersistedCredentialsSchema.safeParse({ version: 1, environment: 'development', localEpoch: 1, phase: 'stable', bundle }).success).toBe(true);
    for (const invalid of [
      { ...persisted, bundle: { ...bundle, revocationToken: undefined } },
      { ...persisted, version: 2 }, { ...persisted, localEpoch: 0 },
      { ...persisted, phase: 'activation_pending', operationId: undefined },
      { ...persisted, phase: 'stable' }, { ...persisted, unrelated: 'secret' },
    ]) expect(PersistedCredentialsSchema.safeParse(invalid).success).toBe(false);
  });
  it('does not widen the accepted M1b identity or command canonicalization', () => {
    expect(IdentityResponseSchema.safeParse({ accountId, sessionId }).success).toBe(false);
    const command = CommandSchema.parse({ contractVersion: 1, operationId, kind: 'profile.put', expectedRevision: 0, payload: { displayName: null, timeZone: 'UTC', units: { load: 'lb', distance: 'mi' } } });
    expect(canonicalCommand(command)).toBe(JSON.stringify(command));
  });
});
