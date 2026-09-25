import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CommandSchema, OperationOutcomeSchema, ProfileSnapshotSchema, SessionListSchema, SessionSnapshotSchema,
  canonicalCommand, commandTarget, validateSessionTransition,
  type Command, type OperationOutcome, type ProfileSnapshot, type SessionSnapshot,
} from '@fitquest-rebuild/contracts';

export type WritePhase = 'after_claim' | 'after_aggregate' | 'after_revision' | 'after_outcome' | 'before_commit' | 'after_commit';
type PhaseHook = (phase: WritePhase) => void | Promise<void>;
type AggregateRow = { revision: number; document: unknown };
type OutcomeRow = { request_hash: string; target_kind: string; target_id: string; state: string; outcome: unknown };

export class OperationIdReused extends Error {}
export class OwnerUnavailable extends Error {}

export class PostgresAthleteRepository {
  constructor(private readonly pool: Pool, private readonly phase?: PhaseHook) {}

  private async owned<T>(accountId: string, work: (client: PoolClient) => Promise<T>, afterCommit?: () => Promise<void>): Promise<T> {
    const client = await this.pool.connect();
    let committed = false;
    let broken = false;
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('fitquest.owner_id',$1,true)", [accountId]);
      // One short, consistent account guard precedes operation claims and aggregates.
      const owner = await client.query('SELECT account_id FROM m1b.accounts WHERE account_id=$1 FOR UPDATE', [accountId]);
      if (owner.rowCount !== 1) throw new OwnerUnavailable();
      const result = await work(client);
      if (afterCommit) await this.phase?.('before_commit');
      await client.query('COMMIT');
      committed = true;
      await afterCommit?.();
      return result;
    } catch (error) {
      if (!committed) { try { await client.query('ROLLBACK'); } catch { broken = true; } }
      throw error;
    } finally { client.release(broken); }
  }

  async execute(accountId: string, raw: Command): Promise<OperationOutcome> {
    const command = CommandSchema.parse(raw);
    const target = commandTarget(command);
    const requestHash = createHash('sha256').update(canonicalCommand(command)).digest('hex');
    return this.owned(accountId, async client => {
      const prior = await client.query<OutcomeRow>('SELECT request_hash,target_kind,target_id,state,outcome FROM m1b.operation_outcomes WHERE account_id=$1 AND operation_id=$2', [accountId, command.operationId]);
      if (prior.rows.length) {
        const row = prior.rows[0];
        if (row.request_hash.trim() !== requestHash || row.target_kind !== target.kind || row.target_id !== target.id) throw new OperationIdReused();
        if (row.state === 'claimed') throw new Error('Nonterminal operation claim');
        return OperationOutcomeSchema.parse(row.outcome);
      }
      await client.query('INSERT INTO m1b.operation_outcomes(account_id,operation_id,request_hash,target_kind,target_id,state) VALUES($1,$2,$3,$4,$5,$6)', [accountId, command.operationId, requestHash, target.kind, target.id, 'claimed']);
      await this.phase?.('after_claim');
      const current = await client.query<AggregateRow>('SELECT revision,document FROM m1b.aggregates WHERE account_id=$1 AND kind=$2 AND aggregate_id=$3', [accountId, target.kind, target.id]);
      const revision = current.rows[0]?.revision ?? 0;
      let rejection: { code: 'REVISION_CONFLICT' | 'PROFILE_REQUIRED' | 'INVALID_TRANSITION'; message: string; currentRevision: number } | null = null;
      if (command.expectedRevision !== revision) rejection = { code: 'REVISION_CONFLICT', message: 'The server record changed; review before replacing local work.', currentRevision: revision };
      else if (command.kind === 'session.put') {
        const profile = await client.query('SELECT 1 FROM m1b.aggregates WHERE account_id=$1 AND kind=$2 AND aggregate_id=$3', [accountId, 'profile', 'profile']);
        if (!profile.rows.length) rejection = { code: 'PROFILE_REQUIRED', message: 'A confirmed profile is required before a session.', currentRevision: revision };
        else {
          try { validateSessionTransition(current.rows[0]?.document ? SessionSnapshotSchema.parse({ revision, document: current.rows[0].document }).document : null, command.payload); }
          catch { rejection = { code: 'INVALID_TRANSITION', message: 'The session change needs review.', currentRevision: revision }; }
        }
      }
      const outcome: OperationOutcome = rejection
        ? { state: 'rejected', accountId, operationId: command.operationId, kind: command.kind, aggregateId: target.id, requestHash, error: rejection }
        : { state: 'committed', accountId, operationId: command.operationId, kind: command.kind, aggregateId: target.id, requestHash,
            receipt: { accountId, operationId: command.operationId, kind: command.kind, aggregateId: target.id, revision: revision + 1, requestHash } };
      if (!rejection) {
        await client.query(`INSERT INTO m1b.aggregates(account_id,kind,aggregate_id,revision,document) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(account_id,kind,aggregate_id) DO UPDATE SET revision=excluded.revision,document=excluded.document,updated_at=now()`,
          [accountId, target.kind, target.id, revision + 1, JSON.stringify(command.payload)]);
        await this.phase?.('after_aggregate');
        await client.query('INSERT INTO m1b.aggregate_revisions(account_id,kind,aggregate_id,revision,operation_id,document) VALUES($1,$2,$3,$4,$5,$6)',
          [accountId, target.kind, target.id, revision + 1, command.operationId, JSON.stringify(command.payload)]);
        await this.phase?.('after_revision');
      }
      await client.query('UPDATE m1b.operation_outcomes SET state=$3,outcome=$4,terminal_at=now() WHERE account_id=$1 AND operation_id=$2',
        [accountId, command.operationId, outcome.state, JSON.stringify(outcome)]);
      await this.phase?.('after_outcome');
      return OperationOutcomeSchema.parse(outcome);
    }, async () => { await this.phase?.('after_commit'); });
  }

  async outcome(accountId: string, operationId: string): Promise<OperationOutcome | null> {
    return this.owned(accountId, async client => {
      const found = await client.query<{ outcome: unknown }>('SELECT outcome FROM m1b.operation_outcomes WHERE account_id=$1 AND operation_id=$2 AND state IN ($3,$4)', [accountId, operationId, 'committed', 'rejected']);
      return found.rows[0] ? OperationOutcomeSchema.parse(found.rows[0].outcome) : null;
    });
  }

  async profile(accountId: string): Promise<ProfileSnapshot> {
    return this.owned(accountId, async client => {
      const found = await client.query<AggregateRow>('SELECT revision,document FROM m1b.aggregates WHERE account_id=$1 AND kind=$2 AND aggregate_id=$3', [accountId, 'profile', 'profile']);
      return ProfileSnapshotSchema.parse(found.rows[0] ?? { revision: 0, document: null });
    });
  }

  async session(accountId: string, id: string): Promise<SessionSnapshot | null> {
    return this.owned(accountId, async client => {
      const found = await client.query<AggregateRow>('SELECT revision,document FROM m1b.aggregates WHERE account_id=$1 AND kind=$2 AND aggregate_id=$3', [accountId, 'session', id]);
      return found.rows[0] ? SessionSnapshotSchema.parse(found.rows[0]) : null;
    });
  }

  async sessions(accountId: string, limit: number) {
    return this.owned(accountId, async client => {
      const found = await client.query<AggregateRow>(`SELECT revision,document FROM m1b.aggregates
        WHERE account_id=$1 AND kind='session' ORDER BY document->>'startedAt' DESC, aggregate_id DESC LIMIT $2`, [accountId, limit]);
      return SessionListSchema.parse({ items: found.rows.map(row => SessionSnapshotSchema.parse(row)) });
    });
  }
}
