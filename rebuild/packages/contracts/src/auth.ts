import { z } from 'zod';

// Wire limits are defensive payload bounds, not claims about an Apple or server token length.
const id = z.uuid();
const instant = z.iso.datetime({ offset: false });
const secret = (maximum: number) => z.string().min(1).max(maximum);
const generation = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const environment = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/);
const before = (a: string, b: string) => Date.parse(a) < Date.parse(b);
const noLater = (a: string, b: string) => Date.parse(a) <= Date.parse(b);

export const AuthChallengeRequestSchema = z.object({}).strict();
export const AppleChallengeSchema = z.object({
  challengeId: id, nonce: secret(512), state: secret(512), expiresAt: instant,
}).strict();
export const AppleExchangeSchema = z.object({
  challengeId: id, state: secret(512), identityToken: secret(16384), authorizationCode: secret(4096),
}).strict();
export const PendingCredentialsSchema = z.object({
  accountId: id, sessionId: id, credentialGeneration: generation,
  accessToken: secret(8192), accessExpiresAt: instant,
  refreshToken: secret(4096), refreshExpiresAt: instant,
  sessionExpiresAt: instant, revocationToken: secret(4096), activationExpiresAt: instant,
}).strict().superRefine((bundle, ctx) => {
  if (!noLater(bundle.activationExpiresAt, bundle.accessExpiresAt)) ctx.addIssue({ code: 'custom', path: ['activationExpiresAt'], message: 'Activation deadline exceeds access expiry' });
  if (!noLater(bundle.accessExpiresAt, bundle.sessionExpiresAt)) ctx.addIssue({ code: 'custom', path: ['accessExpiresAt'], message: 'Access expiry exceeds session expiry' });
  if (!noLater(bundle.accessExpiresAt, bundle.refreshExpiresAt)) ctx.addIssue({ code: 'custom', path: ['accessExpiresAt'], message: 'Access expiry exceeds refresh expiry' });
  if (!noLater(bundle.refreshExpiresAt, bundle.sessionExpiresAt)) ctx.addIssue({ code: 'custom', path: ['refreshExpiresAt'], message: 'Refresh expiry exceeds session expiry' });
  if (!before(bundle.activationExpiresAt, bundle.refreshExpiresAt)) ctx.addIssue({ code: 'custom', path: ['refreshExpiresAt'], message: 'Refresh must outlive activation' });
});
export const ActivationRequestSchema = z.object({ sessionId: id, credentialGeneration: generation }).strict();
export const RefreshRequestSchema = z.object({ operationId: id, refreshToken: secret(4096) }).strict();
export const LogoutRequestSchema = z.object({ revocationToken: secret(4096) }).strict();
export const ActiveIdentitySchema = z.object({ accountId: id, sessionId: id, credentialGeneration: generation }).strict();
export const AuthErrorCodeSchema = z.enum([
  'ACCESS_EXPIRED', 'AUTH_REAUTH_REQUIRED', 'SESSION_REVOKED', 'AUTH_INVALID',
  'AUTH_EXCHANGE_IN_PROGRESS', 'AUTH_CHALLENGE_REUSED', 'AUTH_ACTIVATION_EXPIRED',
  'AUTH_PROVIDER_UNAVAILABLE', 'AUTH_RATE_LIMITED', 'AUTH_BAD_REQUEST',
]);
export const AuthErrorSchema = z.object({
  code: AuthErrorCodeSchema, requestId: id, retryable: z.boolean(),
  retryAfterSeconds: z.number().int().min(1).max(86400).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.retryAfterSeconds !== undefined && !value.retryable) ctx.addIssue({ code: 'custom', path: ['retryAfterSeconds'], message: 'Retry timing requires retryable outcome' });
});

export type AppleChallenge = z.infer<typeof AppleChallengeSchema>;
export type AppleExchange = z.infer<typeof AppleExchangeSchema>;
export type PendingCredentials = z.infer<typeof PendingCredentialsSchema>;
export type ActiveIdentity = z.infer<typeof ActiveIdentitySchema>;
export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>;
export type AuthError = z.infer<typeof AuthErrorSchema>;

// One complete bundle per versioned record. M1c.2 will supply protected storage.
const persistedBase = z.object({ version: z.literal(1), environment, localEpoch: generation });
export const PersistedCredentialsSchema = z.discriminatedUnion('phase', [
  persistedBase.extend({ phase: z.literal('stable'), bundle: PendingCredentialsSchema }).strict(),
  persistedBase.extend({ phase: z.literal('refresh_prepared'), operationId: id, bundle: PendingCredentialsSchema }).strict(),
  persistedBase.extend({ phase: z.literal('reauth_required'), operationId: id, bundle: PendingCredentialsSchema }).strict(),
  persistedBase.extend({ phase: z.literal('activation_pending'), origin: z.enum(['exchange', 'refresh']), bundle: PendingCredentialsSchema }).strict(),
]);
export type PersistedCredentials = z.infer<typeof PersistedCredentialsSchema>;

// Local authorization is independent of rotating credentials. The real adapter must
// verify protected state, encrypted owner/store metadata and its installation marker.
export const LocalAuthorizationBindingSchema = z.object({
  environment, installInstanceId: id, storeId: id, accountId: id, sessionId: id, localEpoch: generation,
}).strict();
export type LocalAuthorizationBinding = z.infer<typeof LocalAuthorizationBindingSchema>;
export type LocalAuthorizationResult =
  | { state: 'authorized'; binding: LocalAuthorizationBinding }
  | { state: 'uninitialized' | 'locked' | 'corrupt' | 'unavailable' };
