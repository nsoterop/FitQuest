import { reserveAI } from '../../ai/allowance.js';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import type { Account } from '../account/auth.js';
import { OnboardingError } from '../onboarding/onboardingError.js';
import {
  foodDate,
  foodZone,
  foodToday,
  foodWeek,
  foodId,
  validFoodDocument,
  nutrients,
  type FoodCommand,
  type FoodDocument,
  type FoodOperation,
  type FoodState,
  type FoodCandidate,
} from '../../shared/foodContract.js';
import { prepareFood } from './foodProvider.js';
import { safeDiagnostic, type ProviderDiagnostic } from '../../ai/providerDiagnostics.js';
import type { OnboardingProvider } from '../../ai/onboardingProvider.js';
type FoodOperationRow = {
  id: string;
  status: FoodOperation['status'];
  error_code: string | null;
  candidate: FoodOperation['candidate'];
  entry_id: string | null;
};
const fail = (code: string, status = 409): never => {
  throw new OnboardingError(status, code);
};
const fields = (v: object, allowed: string[]) =>
  Object.keys(v).length === allowed.length && Object.keys(v).every((x) => allowed.includes(x));
export function checkFoodCommand(v: unknown): FoodCommand {
  if (!v || typeof v !== 'object') return fail('invalid_request', 400);
  const c = v as FoodCommand;
  if (!foodId(c.operationId)) return fail('invalid_request', 400);
  const base = ['operationId', 'kind'];
  if (c.kind === 'interpret') {
    if (
      !fields(c, [
        ...base,
        'message',
        'date',
        'timeZone',
        'previousOperation',
        'entryId',
        'expectedRevision',
      ]) ||
      typeof c.message !== 'string' ||
      !c.message.trim() ||
      c.message.length > 4000 ||
      !foodDate(c.date) ||
      !foodZone(c.timeZone) ||
      (c.previousOperation !== null && !foodId(c.previousOperation)) ||
      (c.entryId === null
        ? c.expectedRevision !== null
        : !foodId(c.entryId) || !Number.isInteger(c.expectedRevision) || c.expectedRevision! < 1)
    )
      return fail('invalid_request', 400);
  } else if (c.kind === 'save') {
    if (
      !fields(c, [
        ...base,
        'document',
        'entryId',
        'expectedRevision',
        'candidateOperation',
        'confirmConsumed',
      ]) ||
      !validFoodDocument(c.document) ||
      c.confirmConsumed !== true ||
      (c.entryId === null
        ? c.expectedRevision !== null
        : !foodId(c.entryId) || !Number.isInteger(c.expectedRevision) || c.expectedRevision! < 1) ||
      (c.candidateOperation !== null && !foodId(c.candidateOperation))
    )
      return fail('invalid_request', 400);
  } else if (c.kind === 'delete' || c.kind === 'undo') {
    if (
      !fields(c, [...base, 'entryId', 'expectedRevision']) ||
      !foodId(c.entryId) ||
      !Number.isInteger(c.expectedRevision) ||
      c.expectedRevision < 1
    )
      return fail('invalid_request', 400);
  } else if (c.kind === 'complete') {
    if (
      !fields(c, [...base, 'date', 'timeZone', 'expectedRevision', 'complete']) ||
      !foodDate(c.date) ||
      !foodZone(c.timeZone) ||
      !Number.isInteger(c.expectedRevision) ||
      c.expectedRevision < 0 ||
      typeof c.complete !== 'boolean'
    )
      return fail('invalid_request', 400);
  } else return fail('invalid_request', 400);
  return c;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}
const op = (r: FoodOperationRow): FoodOperation => ({
  id: r.id,
  status: r.status,
  error: r.error_code,
  candidate: r.candidate,
  entryId: r.entry_id,
});
export function foodStore(pool: Pool, clock = () => new Date()) {
  async function tx<T>(a: Account, fn: (c: PoolClient) => Promise<T>, session = true) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('fitquest.user_id',$1,true)", [a.userId]);
      if (
        session &&
        !(
          await c.query('SELECT fitquest.onboarding_session_guard($1,$2) AS active', [
            a.sessionId,
            a.userId,
          ])
        ).rows[0]?.active
      )
        fail('session_ended', 401);
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [a.userId]);
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  async function recover(c: PoolClient, a: Account) {
    const expired = await c.query(
      "UPDATE fitquest.food_operations SET status='failed',error_code='interrupted' WHERE user_id=$1 AND status='pending' AND deadline<=now() RETURNING attempt_id",
      [a.userId],
    );
    for (const r of expired.rows)
      await c.query('SELECT fitquest.settle_onboarding($1,NULL)', [r.attempt_id]);
    await c.query(
      'UPDATE fitquest.food_entries SET document=NULL WHERE user_id=$1 AND deleted_at IS NOT NULL AND undo_until<=now() AND document IS NOT NULL',
      [a.userId],
    );
    await c.query(
      "UPDATE fitquest.food_operations SET candidate=NULL,message=NULL WHERE user_id=$1 AND created_at<now()-interval '24 hours' AND (candidate IS NOT NULL OR message IS NOT NULL)",
      [a.userId],
    );
  }
  async function operation(c: PoolClient, a: Account, id: string) {
    const row = (
      await c.query('SELECT * FROM fitquest.food_operations WHERE user_id=$1 AND id=$2', [
        a.userId,
        id,
      ])
    ).rows[0];
    if (!row) fail('food_operation_missing', 404);
    return row;
  }
  async function reviseDays(c: PoolClient, a: Account, dates: string[]) {
    for (const date of new Set(dates))
      await c.query(
        'INSERT INTO fitquest.food_days(user_id,date,revision,complete) VALUES($1,$2,1,false) ON CONFLICT(user_id,date) DO UPDATE SET revision=food_days.revision+1',
        [a.userId, date],
      );
  }
  return {
    async read(a: Account, date: string, zone: string): Promise<FoodState> {
      if (!foodDate(date) || !foodZone(zone)) fail('invalid_request', 400);
      return tx(a, async (c) => {
        await recover(c, a);
        const dates = foodWeek(date);
        const entries = (
          await c.query(
            `SELECT id,revision,document,created_at AS "createdAt",updated_at AS "updatedAt",deleted_at AS "deletedAt",undo_until AS "undoUntil" FROM fitquest.food_entries WHERE user_id=$1 AND consumed_date BETWEEN $2 AND $3 AND document IS NOT NULL ORDER BY consumed_date,created_at,id`,
            [a.userId, dates[0], dates[6]],
          )
        ).rows;
        const days = (
          await c.query(
            'SELECT date::text,revision,complete FROM fitquest.food_days WHERE user_id=$1 AND date BETWEEN $2 AND $3 ORDER BY date',
            [a.userId, dates[0], dates[6]],
          )
        ).rows;
        const today = foodToday(zone, clock());
        return { entries, days: days.map((d) => ({ ...d, ended: d.date < today })), dates, today };
      });
    },
    async readOperation(a: Account, id: string) {
      if (!foodId(id)) fail('invalid_request', 400);
      return tx(a, async (c) => {
        await recover(c, a);
        return op(await operation(c, a, id));
      });
    },
    async claim(a: Account, command: FoodCommand, provider?: OnboardingProvider) {
      const cmd = checkFoodCommand(command),
        digest = createHash('sha256').update(canonical(cmd)).digest('hex');
      return tx(a, async (c) => {
        await recover(c, a);
        const old = (
          await c.query('SELECT * FROM fitquest.food_operations WHERE user_id=$1 AND id=$2', [
            a.userId,
            cmd.operationId,
          ])
        ).rows[0];
        if (old) {
          if (old.digest !== digest) fail('operation_conflict');
          return { operation: op(old) };
        }
        const date =
          cmd.kind === 'save'
            ? cmd.document.date
            : cmd.kind === 'interpret' || cmd.kind === 'complete'
              ? cmd.date
              : null;
        const zone =
          cmd.kind === 'save'
            ? cmd.document.timeZone
            : cmd.kind === 'interpret' || cmd.kind === 'complete'
              ? cmd.timeZone
              : null;
        if (date && zone && date > foodToday(zone, clock())) fail('future_food', 422);
        if (cmd.kind === 'interpret') {
          const age = (
            await c.query('SELECT age FROM fitquest.profiles WHERE user_id=$1', [a.userId])
          ).rows[0]?.age;
          if (!age || age < 18) fail('adults_only', 422);
          if (
            (
              await c.query(
                "SELECT 1 FROM fitquest.food_operations WHERE user_id=$1 AND status='pending'",
                [a.userId],
              )
            ).rowCount
          )
            fail('food_pending');
          const context: unknown[] = [];
          let previous = cmd.previousOperation;
          const target = cmd.entryId
            ? (
                await c.query(
                  'SELECT document,revision,deleted_at FROM fitquest.food_entries WHERE user_id=$1 AND id=$2',
                  [a.userId, cmd.entryId],
                )
              ).rows[0]
            : null;
          if (
            cmd.entryId &&
            (!target || target.deleted_at || target.revision !== cmd.expectedRevision)
          )
            fail('food_changed');
          if (target?.document?.recipe) fail('food_recipe_manual', 422);
          while (previous) {
            if (context.length >= 6) fail('food_context_limit', 422);
            const row = await operation(c, a, previous);
            if (
              row.kind !== 'interpret' ||
              row.status !== 'completed' ||
              !row.candidate ||
              !row.message ||
              row.entry_id !== cmd.entryId
            )
              fail('food_context_expired');
            context.unshift({ message: row.message, candidate: row.candidate });
            previous = row.previous_operation;
          }
          if (target) context.unshift({ savedEntry: target.document });
          let work: { attempt: string; body: string; date: string; timeZone: string } | undefined,
            error = 'ai_disabled';
          if (provider) {
            const prepared = prepareFood(provider, {
              message: cmd.message,
              date: cmd.date,
              timeZone: cmd.timeZone,
              today: foodToday(cmd.timeZone, clock()),
              context,
            });
            const attempt = randomUUID();
            await c.query(
              "INSERT INTO fitquest.onboarding_attempts(user_id,id,purpose,state,model,prompt_version,schema_version) VALUES($1,$2,$3,'not_dispatched',$4,'food-v1','food-v1')",
              [a.userId, attempt, provider.purpose ?? 'app', provider.model],
            );
            error = (await reserveAI(c, attempt, prepared.reserveMicro, provider.capMicro)) ?? '';
            if (!error)
              work = { attempt, body: prepared.body, date: cmd.date, timeZone: cmd.timeZone };
          }
          await c.query(
            "INSERT INTO fitquest.food_operations(user_id,id,digest,kind,status,error_code,message,previous_operation,attempt_id,entry_id,deadline) VALUES($1,$2,$3,'interpret',$4,$5,$6,$7,$8,$9,now()+interval '65 seconds')",
            [
              a.userId,
              cmd.operationId,
              digest,
              work ? 'pending' : 'failed',
              work ? null : error,
              cmd.message,
              cmd.previousOperation,
              work?.attempt ?? null,
              cmd.entryId,
            ],
          );
          return { operation: op(await operation(c, a, cmd.operationId)), work };
        }
        let entryId: string | null = null;
        if (cmd.kind === 'complete') {
          const day = (
            await c.query('SELECT revision FROM fitquest.food_days WHERE user_id=$1 AND date=$2', [
              a.userId,
              cmd.date,
            ])
          ).rows[0];
          if ((day?.revision ?? 0) !== cmd.expectedRevision) fail('food_changed');
          if (
            cmd.complete &&
            !(
              await c.query(
                'SELECT 1 FROM fitquest.food_entries WHERE user_id=$1 AND consumed_date=$2 AND deleted_at IS NULL LIMIT 1',
                [a.userId, cmd.date],
              )
            ).rowCount
          )
            fail('empty_food_day');
          await c.query(
            'INSERT INTO fitquest.food_days(user_id,date,revision,complete) VALUES($1,$2,1,$3) ON CONFLICT(user_id,date) DO UPDATE SET revision=food_days.revision+1,complete=$3',
            [a.userId, cmd.date, cmd.complete],
          );
        } else {
          const existing = cmd.entryId
            ? (
                await c.query(
                  'SELECT *,consumed_date::text AS date FROM fitquest.food_entries WHERE user_id=$1 AND id=$2 FOR UPDATE',
                  [a.userId, cmd.entryId],
                )
              ).rows[0]
            : null;
          if (cmd.entryId && (!existing || existing.revision !== cmd.expectedRevision))
            fail('food_changed');
          if (cmd.kind === 'save') {
            if (existing?.deleted_at) fail('food_changed');
            if (!isDeepStrictEqual(cmd.document.recipe, existing?.document?.recipe))
              fail('food_source_changed', 422);
            let basis: FoodDocument | undefined = existing?.document;
            if (cmd.candidateOperation) {
              const candidate = await operation(c, a, cmd.candidateOperation);
              if (
                candidate.kind !== 'interpret' ||
                candidate.status !== 'completed' ||
                candidate.entry_id !== cmd.entryId ||
                !candidate.candidate?.document
              )
                fail('food_candidate_changed');
              if (
                (
                  await c.query(
                    "SELECT 1 FROM fitquest.food_operations WHERE user_id=$1 AND kind='save' AND previous_operation=$2",
                    [a.userId, cmd.candidateOperation],
                  )
                ).rowCount
              )
                fail('food_candidate_used');
              basis = candidate.candidate.document;
            }
            for (const [i, item] of cmd.document.items.entries())
              for (const n of nutrients)
                if (item.nutrients[n].source === 'estimated') {
                  const p = basis?.items[i];
                  if (
                    !p ||
                    p.name !== item.name ||
                    p.portion !== item.portion ||
                    p.quantity !== item.quantity ||
                    p.unit !== item.unit ||
                    !isDeepStrictEqual(p.nutrients[n], item.nutrients[n])
                  )
                    fail('food_source_changed', 422);
                }
            entryId = existing?.id ?? randomUUID();
            await c.query(
              `INSERT INTO fitquest.food_entries(user_id,id,revision,consumed_date,document) VALUES($1,$2,1,$3,$4) ON CONFLICT(user_id,id) DO UPDATE SET revision=food_entries.revision+1,consumed_date=$3,document=$4,updated_at=now()`,
              [a.userId, entryId, cmd.document.date, cmd.document],
            );
            await reviseDays(c, a, [cmd.document.date, ...(existing ? [existing.date] : [])]);
          } else {
            if (!existing) fail('food_changed');
            entryId = existing.id;
            if (cmd.kind === 'delete') {
              if (existing.deleted_at) fail('food_changed');
              await c.query(
                "UPDATE fitquest.food_entries SET revision=revision+1,deleted_at=now(),undo_until=now()+interval '30 seconds',updated_at=now() WHERE user_id=$1 AND id=$2",
                [a.userId, entryId],
              );
            } else {
              if (
                !existing.deleted_at ||
                !existing.document ||
                new Date(existing.undo_until).getTime() <= Date.now()
              )
                fail('food_undo_expired');
              await c.query(
                'UPDATE fitquest.food_entries SET revision=revision+1,deleted_at=NULL,undo_until=NULL,updated_at=now() WHERE user_id=$1 AND id=$2',
                [a.userId, entryId],
              );
            }
            await reviseDays(c, a, [existing.date]);
          }
        }
        await c.query(
          "INSERT INTO fitquest.food_operations(user_id,id,digest,kind,status,entry_id,previous_operation) VALUES($1,$2,$3,$4,'completed',$5,$6)",
          [
            a.userId,
            cmd.operationId,
            digest,
            cmd.kind,
            entryId,
            cmd.kind === 'save' ? cmd.candidateOperation : null,
          ],
        );
        return { operation: op(await operation(c, a, cmd.operationId)) };
      });
    },
    async settle(
      a: Account,
      attempt: string,
      cost: number | null,
      diagnostic?: ProviderDiagnostic,
    ) {
      await tx(
        a,
        (c) => c.query('SELECT fitquest.settle_onboarding($1,$2)', [attempt, cost]),
        false,
      );
      if (diagnostic)
        try {
          await tx(
            a,
            (c) =>
              c.query(
                'UPDATE fitquest.onboarding_attempts SET provider_diagnostic=$3 WHERE user_id=$1 AND id=$2',
                [a.userId, attempt, safeDiagnostic(diagnostic)],
              ),
            false,
          );
        } catch {}
    },
    async finish(
      a: Account,
      id: string,
      attempt: string,
      candidate: FoodCandidate | null,
      error: string | null,
    ) {
      return tx(a, async (c) => {
        await recover(c, a);
        await c.query(
          "UPDATE fitquest.food_operations SET status=$4,candidate=$5,error_code=$6 WHERE user_id=$1 AND id=$2 AND attempt_id=$3 AND status='pending' AND deadline>now()",
          [a.userId, id, attempt, error ? 'failed' : 'completed', candidate, error],
        );
        return op(await operation(c, a, id));
      });
    },
  };
}
export type FoodStore = ReturnType<typeof foodStore>;
