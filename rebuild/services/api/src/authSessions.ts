import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ActivationRequestSchema, ActiveIdentitySchema, PendingCredentialsSchema, RefreshRequestSchema, type ActiveIdentity, type PendingCredentials } from '@fitquest-rebuild/contracts';
import { PostgresAthleteRepository, type SessionCandidate, type SessionGuard } from './repository';

export type SessionEnvironment = 'm1c3.synthetic.test.v1' | 'm1c4b.synthetic.test.v1' | 'm1c4b.synthetic.other.v1';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const at = (value: Date | string) => new Date(value).getTime();
const iso = (value: number) => new Date(value).toISOString();
type CandidateRow = { account_id: string; family_id: string; generation: number };
type AccountRow = { environment: string; status: string; authorization_epoch: string };
type FamilyRow = { family_id: string; account_id: string; authorization_epoch: string; status: string; current_generation: number; absolute_expires_at: Date };
type GenerationRow = { status: string; access_hash: string; access_expires_at: Date; refresh_hash: string; refresh_expires_at: Date; activation_expires_at: Date; consumed_operation_id: string | null };
type CapabilityRow = { capability_hash: string; expires_at: Date };
export type AuthPhase = 'after_identity' | 'before_issue_commit' | 'after_issue_commit' | 'before_refresh_commit' | 'after_refresh_commit' | 'after_candidate_lookup' | 'after_logout_guard';
type PhaseHook = (phase: AuthPhase) => void | Promise<void>;

export type SyntheticVerifiedProviderIdentity = { provider: 'synthetic_verified'; issuer: 'fitquest-m1c3-test'; subject: string };
export type ActivationResult = { kind: 'active'; identity: ActiveIdentity; alreadyActive: boolean } | { kind: 'expired' | 'invalid' | 'revoked' };
export type RefreshResult = { kind: 'credentials'; bundle: PendingCredentials } | { kind: 'reauth_required' | 'invalid' | 'revoked' };
export type IdentityResult = { kind: 'active'; identity: ActiveIdentity } | { kind: 'expired' | 'invalid' | 'revoked' };

export class AuthUnauthorized extends Error {}

/** Internal, test-bound session store. The lookup connection has only candidate-function access. */
export class AuthSessionRepository {
  private readonly durations: { activationMs: number; accessMs: number; refreshMs: number; absoluteMs: number };
  constructor(
    private readonly runtime: Pool,
    private readonly lookupPool: Pool,
    private readonly athlete: PostgresAthleteRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly phase?: PhaseHook,
    durations: Partial<{ activationMs: number; accessMs: number; refreshMs: number; absoluteMs: number }> = {},
    private readonly environment: SessionEnvironment = 'm1c3.synthetic.test.v1',
  ) {
    if (!['m1c3.synthetic.test.v1', 'm1c4b.synthetic.test.v1', 'm1c4b.synthetic.other.v1'].includes(environment)) throw new Error('Invalid trusted session environment');
    this.durations = {
      activationMs: durations.activationMs ?? 5 * 60_000,
      accessMs: durations.accessMs ?? 15 * 60_000,
      refreshMs: durations.refreshMs ?? 30 * 24 * 60 * 60_000,
      absoluteMs: durations.absoluteMs ?? 90 * 24 * 60 * 60_000,
    };
    const { activationMs, accessMs, refreshMs, absoluteMs } = this.durations;
    if (![activationMs, accessMs, refreshMs, absoluteMs].every(value => Number.isSafeInteger(value) && value > 0)
      || !(activationMs < accessMs && accessMs < refreshMs && refreshMs < absoluteMs)) throw new Error('Invalid server session durations');
  }

  private time(): number {
    const value = this.now().getTime();
    if (!Number.isFinite(value)) throw new Error('Invalid server clock');
    return value;
  }
  private async candidate(kind: 'access' | 'refresh' | 'revocation', token: string): Promise<(CandidateRow & { tokenHash: string }) | null> {
    if (typeof token !== 'string' || token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) return null;
    const tokenHash = hash(token);
    const found = await this.lookupPool.query<CandidateRow>(`SELECT account_id,family_id,generation FROM m1b.lookup_${kind}($1)`, [tokenHash]);
    await this.phase?.('after_candidate_lookup');
    return found.rows[0] ? { ...found.rows[0], tokenHash } : null;
  }
  private async begin(client: PoolClient, accountId: string): Promise<AccountRow | null> {
    await client.query('BEGIN');
    await client.query("SELECT set_config('fitquest.owner_id',$1,true)", [accountId]);
    const found = await client.query<AccountRow>('SELECT environment,status,authorization_epoch FROM m1b.accounts WHERE account_id=$1 FOR UPDATE', [accountId]);
    return found.rows[0] ?? null;
  }
  private async family(client: PoolClient, candidate: CandidateRow): Promise<FamilyRow | null> {
    const found = await client.query<FamilyRow>('SELECT family_id,account_id,authorization_epoch,status,current_generation,absolute_expires_at FROM m1b.session_families WHERE account_id=$1 AND family_id=$2 FOR UPDATE', [candidate.account_id, candidate.family_id]);
    return found.rows[0] ?? null;
  }
  private async generation(client: PoolClient, candidate: CandidateRow): Promise<GenerationRow | null> {
    const found = await client.query<GenerationRow>('SELECT status,access_hash,access_expires_at,refresh_hash,refresh_expires_at,activation_expires_at,consumed_operation_id FROM m1b.credential_generations WHERE account_id=$1 AND family_id=$2 AND generation=$3', [candidate.account_id, candidate.family_id, candidate.generation]);
    return found.rows[0] ?? null;
  }
  private accountSecurityCurrent(account: AccountRow | null, family: FamilyRow | null): boolean {
    return !!account && account.environment === this.environment && account.status === 'active' && !!family
      && family.authorization_epoch === account.authorization_epoch;
  }
  private async close(client: PoolClient, committed: boolean) {
    if (!committed) await client.query('ROLLBACK');
  }

  async issue(identity: SyntheticVerifiedProviderIdentity): Promise<PendingCredentials> {
    if (this.environment !== 'm1c3.synthetic.test.v1' || identity.provider !== 'synthetic_verified' || identity.issuer !== 'fitquest-m1c3-test' || typeof identity.subject !== 'string' || identity.subject.length < 1 || identity.subject.length > 512) throw new AuthUnauthorized();
    const subjectHash = hash(`${identity.provider}\0${identity.issuer}\0${identity.subject}`);
    let client: PoolClient | undefined, committed = false, broken = false;
    try {
      client = await this.runtime.connect();
      await client.query('BEGIN');
      const mapped = await client.query<{ account_id: string }>('SELECT m1b.resolve_test_identity($1,$2,$3) AS account_id', [identity.provider, identity.issuer, subjectHash]);
      const accountId = mapped.rows[0].account_id;
      await this.phase?.('after_identity');
      const bundle = await this.issuePendingInTransaction(client, accountId);
      await this.phase?.('before_issue_commit');
      await client.query('COMMIT'); committed = true;
      await this.phase?.('after_issue_commit');
      return bundle;
    } catch (error) {
      if (client && !committed) { try { await client.query('ROLLBACK'); } catch { broken = true; } }
      throw error;
    } finally { client?.release(broken); }
  }

  /** Internal primitive: caller owns BEGIN/COMMIT and the identity guard. Never commits or resolves identity. */
  async issuePendingInTransaction(client: PoolClient, accountId: string, expectedEpoch?: string): Promise<PendingCredentials> {
    await client.query("SELECT set_config('fitquest.owner_id',$1,true)", [accountId]);
    const account = await client.query<AccountRow>('SELECT environment,status,authorization_epoch FROM m1b.accounts WHERE account_id=$1 FOR UPDATE', [accountId]);
    if (account.rows[0]?.environment !== this.environment || account.rows[0].status !== 'active'
      || (expectedEpoch !== undefined && account.rows[0].authorization_epoch !== expectedEpoch)) throw new AuthUnauthorized();
    const time = this.time(), sessionId = randomUUID(), accessToken = secret(), refreshToken = secret(), revocationToken = secret();
    const sessionExpiresAt = time + this.durations.absoluteMs;
    const bundle = PendingCredentialsSchema.parse({
      accountId, sessionId, credentialGeneration: 1, accessToken, accessExpiresAt: iso(time + this.durations.accessMs),
      refreshToken, refreshExpiresAt: iso(time + this.durations.refreshMs), sessionExpiresAt: iso(sessionExpiresAt),
      revocationToken, activationExpiresAt: iso(time + this.durations.activationMs),
    });
    await client.query(`INSERT INTO m1b.session_families(family_id,account_id,authorization_epoch,status,current_generation,absolute_expires_at,created_at)
      VALUES($1,$2,$3,'pending',1,$4,$5)`, [sessionId, accountId, account.rows[0].authorization_epoch, bundle.sessionExpiresAt, iso(time)]);
    await client.query(`INSERT INTO m1b.credential_generations(account_id,family_id,generation,status,access_hash,access_expires_at,refresh_hash,refresh_expires_at,activation_expires_at)
      VALUES($1,$2,1,'pending',$3,$4,$5,$6,$7)`, [accountId, sessionId, hash(accessToken), bundle.accessExpiresAt, hash(refreshToken), bundle.refreshExpiresAt, bundle.activationExpiresAt]);
    await client.query('INSERT INTO m1b.revocation_capabilities(capability_hash,account_id,family_id,expires_at) VALUES($1,$2,$3,$4)', [hash(revocationToken), accountId, sessionId, bundle.sessionExpiresAt]);
    return bundle;
  }

  async activate(accessToken: string, sessionId: string, generation: number): Promise<ActivationResult> {
    const request = ActivationRequestSchema.safeParse({ sessionId, credentialGeneration: generation });
    if (!request.success) return { kind: 'invalid' };
    const canonicalSessionId = request.data.sessionId.toLowerCase();
    const candidate = await this.candidate('access', accessToken);
    if (!candidate || candidate.family_id !== canonicalSessionId || candidate.generation !== generation) return { kind: 'invalid' };
    const client = await this.runtime.connect(); let committed = false, broken = false;
    try {
      const account = await this.begin(client, candidate.account_id);
      const family = await this.family(client, candidate);
      const row = await this.generation(client, candidate);
      const time = this.time();
      let result: ActivationResult = { kind: 'invalid' };
      if (!account || account.environment !== this.environment || !family || !row || row.access_hash !== candidate.tokenHash) result = { kind: 'invalid' };
      else if (!this.accountSecurityCurrent(account, family) || family.status === 'revoked') result = { kind: 'revoked' };
      else if (at(family.absolute_expires_at) <= time) result = { kind: 'expired' };
      else if (family.current_generation !== generation || at(row.access_expires_at) <= time) result = { kind: 'expired' };
      else if (family.status === 'active' && row.status === 'active') result = { kind: 'active', identity: ActiveIdentitySchema.parse({ accountId: candidate.account_id, sessionId: candidate.family_id, credentialGeneration: generation }), alreadyActive: true };
      else if (family.status === 'pending' && row.status === 'pending') {
        if (at(row.activation_expires_at) <= time) result = { kind: 'expired' };
        else {
          await client.query("UPDATE m1b.session_families SET status='active' WHERE account_id=$1 AND family_id=$2", [candidate.account_id, canonicalSessionId]);
          await client.query("UPDATE m1b.credential_generations SET status='active' WHERE account_id=$1 AND family_id=$2 AND generation=$3", [candidate.account_id, canonicalSessionId, generation]);
          result = { kind: 'active', identity: ActiveIdentitySchema.parse({ accountId: candidate.account_id, sessionId: candidate.family_id, credentialGeneration: generation }), alreadyActive: false };
        }
      }
      await client.query('COMMIT'); committed = true;
      return result;
    } catch (error) { if (!committed) { try { await this.close(client, false); } catch { broken = true; } } throw error; }
    finally { client.release(broken); }
  }

  async refresh(operationId: string, refreshToken: string): Promise<RefreshResult> {
    const request = RefreshRequestSchema.safeParse({ operationId, refreshToken });
    if (!request.success) return { kind: 'invalid' };
    const canonicalOperationId = request.data.operationId.toLowerCase();
    const candidate = await this.candidate('refresh', refreshToken);
    if (!candidate) return { kind: 'invalid' };
    const client = await this.runtime.connect(); let committed = false, broken = false;
    try {
      const account = await this.begin(client, candidate.account_id);
      const family = await this.family(client, candidate);
      const row = await this.generation(client, candidate);
      const time = this.time();
      let result: RefreshResult = { kind: 'invalid' };
      if (!account || account.environment !== this.environment || !family || !row || row.refresh_hash !== candidate.tokenHash) result = { kind: 'invalid' };
      else if (!this.accountSecurityCurrent(account, family) || family.status === 'revoked') result = { kind: 'revoked' };
      else if (at(family.absolute_expires_at) <= time) result = { kind: 'reauth_required' };
      else if (row.consumed_operation_id) {
        if (row.consumed_operation_id === canonicalOperationId) result = { kind: 'reauth_required' };
        else {
          await client.query("UPDATE m1b.session_families SET status='revoked',revoked_at=$3 WHERE account_id=$1 AND family_id=$2", [candidate.account_id, candidate.family_id, iso(time)]);
          result = { kind: 'revoked' };
        }
      } else if (family.current_generation !== candidate.generation || family.status !== 'active' || row.status !== 'active' || at(row.refresh_expires_at) <= time) result = { kind: 'reauth_required' };
      else {
        const reused = await client.query('SELECT 1 FROM m1b.credential_generations WHERE account_id=$1 AND consumed_operation_id=$2', [candidate.account_id, canonicalOperationId]);
        if (reused.rowCount) result = { kind: 'reauth_required' };
        else {
          const absolute = at(family.absolute_expires_at), refreshExpiry = Math.min(time + this.durations.refreshMs, absolute);
          if (refreshExpiry - time <= this.durations.activationMs) result = { kind: 'reauth_required' };
          else {
            const accessToken = secret(), nextRefresh = secret(), revocationToken = secret(), next = candidate.generation + 1;
            const bundle = PendingCredentialsSchema.parse({
              accountId: candidate.account_id, sessionId: candidate.family_id, credentialGeneration: next,
              accessToken, accessExpiresAt: iso(Math.min(time + this.durations.accessMs, refreshExpiry)),
              refreshToken: nextRefresh, refreshExpiresAt: iso(refreshExpiry), sessionExpiresAt: iso(absolute),
              revocationToken, activationExpiresAt: iso(time + this.durations.activationMs),
            });
            await client.query("UPDATE m1b.credential_generations SET status='consumed',consumed_operation_id=$4,consumed_at=$5 WHERE account_id=$1 AND family_id=$2 AND generation=$3", [candidate.account_id, candidate.family_id, candidate.generation, canonicalOperationId, iso(time)]);
            await client.query("UPDATE m1b.session_families SET status='pending',current_generation=$3 WHERE account_id=$1 AND family_id=$2", [candidate.account_id, candidate.family_id, next]);
            await client.query(`INSERT INTO m1b.credential_generations(account_id,family_id,generation,status,access_hash,access_expires_at,refresh_hash,refresh_expires_at,activation_expires_at)
              VALUES($1,$2,$3,'pending',$4,$5,$6,$7,$8)`, [candidate.account_id, candidate.family_id, next, hash(accessToken), bundle.accessExpiresAt, hash(nextRefresh), bundle.refreshExpiresAt, bundle.activationExpiresAt]);
            await client.query('INSERT INTO m1b.revocation_capabilities(capability_hash,account_id,family_id,expires_at) VALUES($1,$2,$3,$4)', [hash(revocationToken), candidate.account_id, candidate.family_id, bundle.sessionExpiresAt]);
            await this.phase?.('before_refresh_commit');
            result = { kind: 'credentials', bundle };
          }
        }
      }
      await client.query('COMMIT'); committed = true;
      if (result.kind === 'credentials') await this.phase?.('after_refresh_commit');
      return result;
    } catch (error) { if (!committed) { try { await this.close(client, false); } catch { broken = true; } } throw error; }
    finally { client.release(broken); }
  }

  async revoke(revocationToken: string): Promise<'revoked' | 'invalid'> {
    const candidate = await this.candidate('revocation', revocationToken);
    if (!candidate) return 'invalid';
    const client = await this.runtime.connect(); let committed = false, broken = false;
    try {
      const account = await this.begin(client, candidate.account_id);
      const family = await this.family(client, candidate);
      const capability = await client.query<CapabilityRow>('SELECT capability_hash,expires_at FROM m1b.revocation_capabilities WHERE account_id=$1 AND family_id=$2 AND capability_hash=$3', [candidate.account_id, candidate.family_id, candidate.tokenHash]);
      await this.phase?.('after_logout_guard');
      const time = this.time();
      let result: 'revoked' | 'invalid' = 'invalid';
      if (account?.environment === this.environment && family && capability.rows[0]?.capability_hash === candidate.tokenHash && at(capability.rows[0].expires_at) > time) {
        if (family.status !== 'revoked') await client.query("UPDATE m1b.session_families SET status='revoked',revoked_at=$3 WHERE account_id=$1 AND family_id=$2", [candidate.account_id, candidate.family_id, iso(time)]);
        result = 'revoked';
      }
      await client.query('COMMIT'); committed = true;
      return result;
    } catch (error) { if (!committed) { try { await this.close(client, false); } catch { broken = true; } } throw error; }
    finally { client.release(broken); }
  }

  private readonly guard: SessionGuard = async (client, candidate, account) => {
    const lookup = { account_id: candidate.accountId, family_id: candidate.familyId, generation: candidate.generation };
    const family = await this.family(client, lookup);
    const row = await this.generation(client, lookup);
    const time = this.time();
    if (!this.accountSecurityCurrent(account, family) || !family || at(family.absolute_expires_at) <= time || family.status !== 'active' || family.current_generation !== candidate.generation
      || row?.status !== 'active' || row.access_hash !== candidate.accessHash || at(row.access_expires_at) <= time) throw new AuthUnauthorized();
  };

  private async access(token: string): Promise<SessionCandidate | null> {
    const candidate = await this.candidate('access', token);
    return candidate ? { accountId: candidate.account_id, familyId: candidate.family_id, generation: candidate.generation, accessHash: candidate.tokenHash } : null;
  }
  /** Lookup is only a candidate; every bound domain method rechecks under its own transaction. */
  async privateAthlete(accessToken: string): Promise<{ accountId: string; repository: PostgresAthleteRepository }> {
    const candidate = await this.access(accessToken);
    if (!candidate) throw new AuthUnauthorized();
    return { accountId: candidate.accountId, repository: this.athlete.bindSession(candidate, this.guard, this.environment) };
  }
  async identity(accessToken: string): Promise<IdentityResult> {
    const candidate = await this.access(accessToken);
    if (!candidate) return { kind: 'invalid' };
    const client = await this.runtime.connect(); let committed = false, broken = false;
    try {
      const account = await this.begin(client, candidate.accountId);
      const family = await this.family(client, { account_id: candidate.accountId, family_id: candidate.familyId, generation: candidate.generation });
      const row = await this.generation(client, { account_id: candidate.accountId, family_id: candidate.familyId, generation: candidate.generation });
      const time = this.time();
      let result: IdentityResult;
      if (!account || account.environment !== this.environment || !family || !row || row.access_hash !== candidate.accessHash) result = { kind: 'invalid' };
      else if (!this.accountSecurityCurrent(account, family) || family.status === 'revoked') result = { kind: 'revoked' };
      else if (at(family.absolute_expires_at) <= time) result = { kind: 'expired' };
      else if (family.status !== 'active' || family.current_generation !== candidate.generation || row.status !== 'active') result = { kind: 'invalid' };
      else if (at(row.access_expires_at) <= time) result = { kind: 'expired' };
      else result = { kind: 'active', identity: ActiveIdentitySchema.parse({ accountId: candidate.accountId, sessionId: candidate.familyId, credentialGeneration: candidate.generation }) };
      await client.query('COMMIT'); committed = true;
      return result;
    } catch (error) { if (!committed) { try { await this.close(client, false); } catch { broken = true; } } throw error; }
    finally { client.release(broken); }
  }
}
