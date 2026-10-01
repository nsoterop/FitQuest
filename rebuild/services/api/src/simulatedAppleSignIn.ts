import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { decodeJwt, type FetchImplementation } from 'jose';
import type { Pool, PoolClient } from 'pg';
import { AppleChallengeSchema, AuthChallengeRequestSchema, AppleExchangeSchema, type AppleChallenge, type AuthErrorCode, type PendingCredentials } from '@fitquest-rebuild/contracts';
import { createAppleIdentityTokenVerifierForTest, type AppleIdentityTokenVerifier, type AppleVerifierConfiguration } from './appleIdentityVerifier';
import { AuthSessionRepository, type SessionEnvironment } from './authSessions';

type Environment = Extract<SessionEnvironment, `m1c4b.${string}`>;
export type SimulatedSignInConfiguration = AppleVerifierConfiguration & {
  environment: Environment;
  challengeLifetimeMs?: number;
  attemptLifetimeMs?: number;
  providerTimeoutMs?: number;
};
/** Offline port only. Real token responses (including refresh/access tokens) need the later protected adapter. */
export interface SimulatedAuthorizationCodeExchange {
  exchange(input: { authorizationCode: string; clientId: string; signal: AbortSignal }): Promise<unknown>;
}
export type ExchangePhase = 'after_claim_insert' | 'before_claim_commit' | 'after_claim_commit' | 'before_finalize'
  | 'after_account_guard' | 'before_finalize_commit' | 'after_finalize_commit';
type Phase = (phase: ExchangePhase) => void | Promise<void>;
export type SimulatedExchangeResult = { kind: 'credentials'; bundle: PendingCredentials } | { kind: 'error'; code: AuthErrorCode };
const error = (code: AuthErrorCode): SimulatedExchangeResult => ({ kind: 'error', code });
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const millis = (date: Date | string) => new Date(date).getTime();
type ChallengeRow = { nonce: string; state_hash: string; expires_at: Date };
type ClaimRow = { outcome: AuthErrorCode | 'claimed'; attempt_id: string | null; deadline: Date | null };
type Claim = { id: string; attemptId: string; requestDigest: string; deadline: number };
type Timing = { exp: number; iat: number; nbf?: number };
class FenceExpired extends Error {}

/** Copies only time metadata from the exact token AFTER signature verification; never decodes identity as authority. */
function verifiedTiming(token: string): Timing {
  const { exp, iat, nbf } = decodeJwt(token);
  const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!numeric(exp) || !numeric(iat) || (nbf !== undefined && !numeric(nbf))) throw new FenceExpired();
  return { exp, iat, ...(nbf === undefined ? {} : { nbf }) };
}

/** Internal explicit offline factory. No entrypoint imports it, no live code transport exists. */
export function createSimulatedAppleSignInForTest(config: SimulatedSignInConfiguration, dependencies: {
  preauth: Pool; runtime: Pool; sessions: AuthSessionRepository; exchange: SimulatedAuthorizationCodeExchange;
  now: () => Date; fetch: FetchImplementation; phase?: Phase;
}): SimulatedAppleSignIn {
  const trusted = Object.freeze({ ...config });
  const verifier = createAppleIdentityTokenVerifierForTest(trusted, { now: dependencies.now, fetch: dependencies.fetch });
  return new SimulatedAppleSignIn(trusted, { ...dependencies }, verifier);
}

class SimulatedAppleSignIn {
  private readonly lifetime: number;
  private readonly attemptLifetime: number;
  private readonly timeout: number;
  private readonly tolerance: number;
  constructor(private readonly config: SimulatedSignInConfiguration, private readonly deps: {
    preauth: Pool; runtime: Pool; sessions: AuthSessionRepository; exchange: SimulatedAuthorizationCodeExchange;
    now: () => Date; phase?: Phase;
  }, private readonly verifier: AppleIdentityTokenVerifier) {
    this.lifetime = config.challengeLifetimeMs ?? 300_000;
    this.attemptLifetime = config.attemptLifetimeMs ?? 30_000;
    this.timeout = config.providerTimeoutMs ?? 10_000;
    this.tolerance = config.jwtClockToleranceSeconds ?? 60;
    if (!['m1c4b.synthetic.test.v1', 'm1c4b.synthetic.other.v1'].includes(config.environment)
      || ![this.lifetime, this.attemptLifetime, this.timeout].every(value => Number.isSafeInteger(value) && value > 0)
      || this.lifetime > 300_000 || this.attemptLifetime > 30_000 || this.timeout > 10_000) throw new Error('Invalid simulated sign-in configuration');
  }
  private time() {
    const value = this.deps.now().getTime();
    if (!Number.isFinite(value)) throw new FenceExpired();
    return value;
  }
  private current(claim: Claim, timings: Timing[] = []) {
    const time = this.time(), second = Math.floor(time / 1000);
    if (time >= claim.deadline || timings.some(timing => timing.exp <= second - this.tolerance
      || timing.iat > second + this.tolerance || (timing.nbf !== undefined && timing.nbf > second + this.tolerance))) throw new FenceExpired();
  }
  async challenge(raw: unknown = {}): Promise<AppleChallenge | { kind: 'error'; code: AuthErrorCode }> {
    if (!AuthChallengeRequestSchema.safeParse(raw).success) return { kind: 'error', code: 'AUTH_BAD_REQUEST' };
    try {
      const time = this.time();
      const value = AppleChallengeSchema.parse({ challengeId: randomUUID(), nonce: randomBytes(32).toString('hex'),
        state: randomBytes(32).toString('hex'), expiresAt: new Date(time + this.lifetime).toISOString() });
      await this.deps.preauth.query('SELECT m1b.create_exchange_challenge($1,$2,$3,$4,$5,$6,$7)',
        [value.challengeId, this.config.environment, this.config.clientId, value.nonce, digest(value.state), new Date(time), value.expiresAt]);
      return value;
    } catch { return { kind: 'error', code: 'AUTH_REAUTH_REQUIRED' }; }
  }

  private async claim(id: string, state: string, requestDigest: string, subjectHash: string, expiry: number): Promise<Claim | SimulatedExchangeResult> {
    const attemptId = randomUUID(), started = this.time(), deadline = Math.min(expiry, started + this.attemptLifetime);
    const client = await this.deps.preauth.connect(); let committed = false, broken = false;
    try {
      await client.query('BEGIN');
      const row = (await client.query<ClaimRow>('SELECT * FROM m1b.claim_exchange($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id, this.config.environment, this.config.clientId, digest(state), requestDigest, subjectHash, attemptId, new Date(started), new Date(deadline)])).rows[0];
      const claim = { id, attemptId, requestDigest, deadline };
      if (row.outcome === 'claimed') {
        await this.deps.phase?.('after_claim_insert');
        await this.deps.phase?.('before_claim_commit');
        this.current(claim); // Resample after advisory/challenge lock waits, not just the pre-query timestamp.
      }
      await client.query('COMMIT'); committed = true;
      if (row.outcome !== 'claimed') {
        if (row.outcome === 'AUTH_EXCHANGE_IN_PROGRESS' && (!row.deadline || millis(row.deadline) <= this.time())) return error('AUTH_REAUTH_REQUIRED');
        return error(row.outcome);
      }
      return claim;
    } finally {
      if (!committed) { try { await client.query('ROLLBACK'); } catch { broken = true; } }
      client.release(broken);
    }
  }
  private async fail(claim: Claim) {
    // A failed write leaves the committed claim spent. Never reclaim/re-exchange it.
    try { await this.deps.preauth.query('SELECT m1b.fail_exchange($1,$2,$3)', [claim.id, claim.attemptId, claim.requestDigest]); } catch { /* Terminal fence remains. */ }
  }
  private async provider(code: string, claim: Claim): Promise<unknown> {
    this.current(claim);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => this.deps.exchange.exchange({ authorizationCode: code, clientId: this.config.clientId, signal: controller.signal })),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new FenceExpired()); }, Math.min(this.timeout, claim.deadline - this.time())); }),
      ]);
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
  }
  private async finalize(claim: Claim, timings: Timing[]): Promise<PendingCredentials> {
    this.current(claim, timings);
    await this.deps.phase?.('before_finalize');
    const client: PoolClient = await this.deps.runtime.connect(); let committed = false, broken = false;
    let bundle: PendingCredentials;
    try {
      await client.query('BEGIN');
      const mapped = (await client.query<{ account_id: string; expected_epoch: string }>('SELECT * FROM m1b.resolve_exchange_account($1,$2,$3,$4,$5,$6)',
        [claim.id, claim.attemptId, claim.requestDigest, this.config.environment, this.config.clientId, new Date(this.time())])).rows[0];
      if (!mapped) throw new FenceExpired();
      await this.deps.phase?.('after_account_guard');
      this.current(claim, timings);
      bundle = await this.deps.sessions.issuePendingInTransaction(client, mapped.account_id, mapped.expected_epoch);
      const completed = (await client.query<{ done: boolean }>('SELECT m1b.complete_exchange($1,$2,$3,$4,$5) AS done',
        [claim.id, claim.attemptId, claim.requestDigest, bundle.sessionId, new Date(this.time())])).rows[0].done;
      if (!completed) throw new FenceExpired();
      await this.deps.phase?.('before_finalize_commit');
      this.current(claim, timings); // Covers account AND attempt lock waits, including token expiration.
      await client.query('COMMIT'); committed = true;
    } finally {
      if (!committed) { try { await client.query('ROLLBACK'); } catch { broken = true; } }
      client.release(broken);
    }
    await this.deps.phase?.('after_finalize_commit'); // No client/lock retained while returning the one-time response.
    return bundle;
  }

  async exchange(raw: unknown): Promise<SimulatedExchangeResult> {
    const parsed = AppleExchangeSchema.safeParse(raw);
    if (!parsed.success) return error('AUTH_BAD_REQUEST');
    const request = parsed.data, id = request.challengeId.toLowerCase();
    let claim: Claim | undefined;
    try {
      const challenge = (await this.deps.preauth.query<ChallengeRow>('SELECT * FROM m1b.read_exchange_challenge($1,$2,$3)', [id, this.config.environment, this.config.clientId])).rows[0];
      if (!challenge || digest(request.state) !== challenge.state_hash) return error('AUTH_INVALID');
      if (millis(challenge.expires_at) <= this.time()) return error('AUTH_REAUTH_REQUIRED');
      // Pool.query has released its client before either JWKS wait. No transaction spans verification.
      const native = await this.verifier.verify(request.identityToken, challenge.nonce);
      if (native.kind !== 'verified') return error(native.kind === 'keys_unavailable' ? 'AUTH_PROVIDER_UNAVAILABLE' : 'AUTH_INVALID');
      if (millis(challenge.expires_at) <= this.time()) return error('AUTH_REAUTH_REQUIRED');
      const nativeTiming = verifiedTiming(request.identityToken);
      const requestDigest = digest(JSON.stringify([id, request.state, request.identityToken, request.authorizationCode]));
      const subjectHash = digest(JSON.stringify([this.config.environment, native.identity.provider, native.identity.issuer, native.identity.subject]));
      const result = await this.claim(id, request.state, requestDigest, subjectHash, millis(challenge.expires_at));
      if ('kind' in result) return result;
      claim = result;
      // A simulated process death here deliberately leaves a committed, permanently one-use claim.
      await this.deps.phase?.('after_claim_commit');
      this.current(claim, [nativeTiming]);
      let response: unknown;
      try { response = await this.provider(request.authorizationCode, claim); }
      catch { await this.fail(claim); return error('AUTH_PROVIDER_UNAVAILABLE'); }
      this.current(claim, [nativeTiming]);
      if (!response || typeof response !== 'object' || Array.isArray(response)
        || Object.keys(response).length !== 1 || !Object.hasOwn(response, 'identityToken')) {
        await this.fail(claim); return error('AUTH_INVALID');
      }
      const returnedToken = (response as { identityToken: unknown }).identityToken;
      const returned = await this.verifier.verify(returnedToken, challenge.nonce);
      if (returned.kind !== 'verified') {
        await this.fail(claim); return error(returned.kind === 'keys_unavailable' ? 'AUTH_PROVIDER_UNAVAILABLE' : 'AUTH_INVALID');
      }
      if (returned.identity.subject !== native.identity.subject || returned.identity.issuer !== native.identity.issuer || returned.identity.audience !== native.identity.audience) {
        await this.fail(claim); return error('AUTH_INVALID');
      }
      try {
        const bundle = await this.finalize(claim, [nativeTiming, verifiedTiming(returnedToken as string)]);
        return { kind: 'credentials', bundle };
      } catch { await this.fail(claim); return error('AUTH_REAUTH_REQUIRED'); }
    } catch {
      // Before claim: rollback. After claim: crash/late completion remains spent; no automatic retry.
      return error('AUTH_REAUTH_REQUIRED');
    }
  }
}
