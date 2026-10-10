import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Account } from './auth.js';
import { OnboardingError } from './onboardingError.js';
import { foodId } from './foodContract.js';
import {
  validWeightCommand,
  weightToday,
  type WeightCommand,
  type WeightEntry,
  type WeightList,
  type WeightReceipt,
} from './weightContract.js';
const fail = (code: string, status = 409): never => {
  throw new OnboardingError(status, code);
};
const canonical = (v: unknown): string =>
  v && typeof v === 'object'
    ? '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    : JSON.stringify(v);
const entry = (r: any): WeightEntry => ({
  id: r.id,
  revision: r.revision,
  measurement: r.measurement,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  deletedAt: r.deleted_at?.toISOString() ?? null,
});
const receipt = (r: any): WeightReceipt => ({
  id: r.id,
  entryId: r.entry_id,
  revision: r.revision,
});
export function weightStore(pool: Pool) {
  async function tx<T>(a: Account, fn: (c: PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('fitquest.user_id',$1,true)", [a.userId]);
      if (
        !(
          await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active', [
            a.sessionId,
            a.userId,
          ])
        ).rows[0]?.active
      )
        fail('session_ended', 401);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [a.userId]);
      const value = await fn(c);
      await c.query('COMMIT');
      return value;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  return {
    list: (a: Account, offset = 0): Promise<WeightList> => {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
        fail('invalid_request', 400);
      return tx(a, async (c) => {
        const rows = (
          await c.query(
            "SELECT * FROM fitquest.body_weights WHERE user_id=$1 AND deleted_at IS NULL ORDER BY measurement->>'date' DESC,created_at DESC,id LIMIT 51 OFFSET $2",
            [a.userId, offset],
          )
        ).rows;
        return {
          items: rows.slice(0, 50).map(entry),
          nextOffset: rows.length > 50 ? offset + 50 : null,
        };
      });
    },
    read: (a: Account, id: string) => {
      if (!foodId(id)) fail('invalid_request', 400);
      return tx(a, async (c) => {
        const r = (
          await c.query('SELECT * FROM fitquest.body_weights WHERE user_id=$1 AND id=$2', [
            a.userId,
            id,
          ])
        ).rows[0];
        if (!r) fail('weight_missing', 404);
        return entry(r);
      });
    },
    readOperation: (a: Account, id: string) => {
      if (!foodId(id)) fail('invalid_request', 400);
      return tx(a, async (c) => {
        const r = (
          await c.query(
            'SELECT * FROM fitquest.body_weight_operations WHERE user_id=$1 AND id=$2',
            [a.userId, id],
          )
        ).rows[0];
        if (!r) fail('weight_operation_missing', 404);
        return receipt(r);
      });
    },
    command: (a: Account, cmd: WeightCommand) => {
      if (!validWeightCommand(cmd)) fail('invalid_request', 400);
      return tx(a, async (c) => {
        const digest = createHash('sha256').update(canonical(cmd)).digest('hex');
        const prior = (
          await c.query(
            'SELECT * FROM fitquest.body_weight_operations WHERE user_id=$1 AND id=$2',
            [a.userId, cmd.operationId],
          )
        ).rows[0];
        if (prior) {
          if (prior.digest !== digest) fail('operation_conflict');
          return receipt(prior);
        }
        let id = cmd.entryId,
          revision = 1;
        if (id) {
          const r = (
            await c.query(
              'SELECT * FROM fitquest.body_weights WHERE user_id=$1 AND id=$2 FOR UPDATE',
              [a.userId, id],
            )
          ).rows[0];
          if (!r) fail('weight_missing', 404);
          if (r.revision !== cmd.expectedRevision || r.deleted_at) fail('weight_changed');
          revision = r.revision + 1;
        }
        if (cmd.kind === 'delete')
          await c.query(
            'UPDATE fitquest.body_weights SET measurement=NULL,deleted_at=now(),updated_at=now(),revision=$3 WHERE user_id=$1 AND id=$2',
            [a.userId, id, revision],
          );
        else {
          if (cmd.measurement.date > weightToday(cmd.measurement.timeZone))
            fail('future_weight', 422);
          if (id)
            await c.query(
              'UPDATE fitquest.body_weights SET measurement=$3,revision=$4,updated_at=now() WHERE user_id=$1 AND id=$2',
              [a.userId, id, cmd.measurement, revision],
            );
          else {
            id = randomUUID();
            await c.query(
              'INSERT INTO fitquest.body_weights(user_id,id,measurement) VALUES($1,$2,$3)',
              [a.userId, id, cmd.measurement],
            );
          }
        }
        return receipt(
          (
            await c.query(
              'INSERT INTO fitquest.body_weight_operations(user_id,id,digest,entry_id,revision) VALUES($1,$2,$3,$4,$5) RETURNING *',
              [a.userId, cmd.operationId, digest, id, revision],
            )
          ).rows[0],
        );
      });
    },
  };
}
export type WeightStore = ReturnType<typeof weightStore>;
