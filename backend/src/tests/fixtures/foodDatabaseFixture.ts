import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from '../../features/account/profileStore.js';
import type { OnboardingProvider } from '../../ai/onboardingProvider.js';
import { foodFixture } from './foodFixture.js';
import { foodStore } from '../../features/nutrition/foodStore.js';
import { foodService } from '../../features/nutrition/food.js';
import {
  foodTotal,
  foodAverage,
  type FoodCommand,
  type FoodCandidate,
} from '../../shared/foodContract.js';
export async function verifyFoodDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  const yes = async () => true;
  async function fresh(clock?: () => Date) {
    const a = { userId: randomUUID(), sessionId: randomUUID() };
    await owner.query('INSERT INTO auth.users VALUES($1)', [a.userId]);
    await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
      a.sessionId,
      a.userId,
    ]);
    await profiles.save(a, {
      firstName: 'Synthetic',
      lastName: 'Food',
      age: 30,
      height: { value: 68, unit: 'in' },
      weight: { value: 155, unit: 'lb' },
      gender: 'Unspecified',
    });
    let calls = 0;
    let candidate: FoodCandidate = { intent: 'consumed', question: null, document: foodFixture() };
    let mode = 'valid';
    const provider: OnboardingProvider = {
      mode: 'test',
      model: 'gpt-6.1-sol',
      capMicro: 7000000,
      cost: () => 10,
      prepare: () => ({ body: 'unused', reserveMicro: 10 }),
      call: async () => {
        calls++;
        return mode === 'unknown'
          ? { failure: 'provider_error' }
          : mode === 'refused'
            ? { failure: 'refused', usage: { input: 1, output: 1, cached: 0, cacheWrite: 0 } }
            : { proposal: candidate, usage: { input: 1, output: 1, cached: 0, cacheWrite: 0 } };
      },
    };
    const store = foodStore(pool, clock),
      service = foodService(store, provider);
    const interpret = (): FoodCommand => ({
      operationId: randomUUID(),
      kind: 'interpret',
      message: 'I ate one container.',
      date: '2026-10-09',
      timeZone: 'America/New_York',
      previousOperation: null,
      entryId: null,
      expectedRevision: null,
    });
    const manual = (): FoodCommand => ({
      operationId: randomUUID(),
      kind: 'save',
      document: foodFixture(),
      entryId: null,
      expectedRevision: null,
      candidateOperation: null,
      confirmConsumed: true,
    });
    return {
      a,
      provider,
      store,
      service,
      interpret,
      manual,
      calls: () => calls,
      set: (c: FoodCandidate) => {
        candidate = c;
      },
      mode: (m: string) => {
        mode = m;
      },
      read: () => store.read(a, '2026-10-08', 'America/New_York'),
    };
  }
  await t.test(
    'past-day closure is derived across midnight and timezone changes without rewriting receipts; corrections remain free',
    async () => {
      let instant = new Date('2026-10-09T03:59:59Z');
      const f = await fresh(() => instant),
        cmd = f.manual();
      const saved = await f.service.command(f.a, cmd, yes);
      const before = await owner.query(
        'SELECT date::text,revision,complete FROM fitquest.food_days WHERE user_id=$1',
        [f.a.userId],
      );
      assert.equal((await f.read()).days[0]!.ended, false);
      assert.equal(foodAverage(await f.read(), 'protein').days, 0);
      instant = new Date('2026-10-09T04:00:00Z');
      assert.equal((await f.read()).days[0]!.ended, true);
      assert.equal(foodAverage(await f.read(), 'protein').days, 1);
      assert.equal(
        (await f.store.read(f.a, '2026-10-08', 'America/Los_Angeles')).days[0]!.ended,
        false,
      );
      assert.deepEqual(
        (
          await owner.query(
            'SELECT date::text,revision,complete FROM fitquest.food_days WHERE user_id=$1',
            [f.a.userId],
          )
        ).rows,
        before.rows,
      );
      const e = (await f.read()).entries[0]!;
      await f.service.command(
        f.a,
        {
          operationId: randomUUID(),
          kind: 'save',
          candidateOperation: null,
          confirmConsumed: true,
          entryId: e.id,
          expectedRevision: e.revision,
          document: { ...e.document, date: '2026-10-04' },
        },
        yes,
      );
      assert.equal(foodAverage(await f.read(), 'protein').days, 0);
      const oldWeek = await f.store.read(f.a, '2026-10-04', 'America/New_York');
      assert.equal(foodAverage(oldWeek, 'protein').days, 1);
      const moved = oldWeek.entries[0]!;
      await f.service.command(
        f.a,
        {
          operationId: randomUUID(),
          kind: 'delete',
          entryId: moved.id,
          expectedRevision: moved.revision,
        },
        yes,
      );
      const deleted = (await f.store.read(f.a, '2026-10-04', 'America/New_York')).entries[0]!;
      assert.equal(
        foodAverage(await f.store.read(f.a, '2026-10-04', 'America/New_York'), 'protein').days,
        0,
      );
      await f.service.command(
        f.a,
        {
          operationId: randomUUID(),
          kind: 'undo',
          entryId: deleted.id,
          expectedRevision: deleted.revision,
        },
        yes,
      );
      assert.equal(
        foodAverage(await f.store.read(f.a, '2026-10-04', 'America/New_York'), 'protein').days,
        1,
      );
      assert.equal((await f.store.readOperation(f.a, cmd.operationId)).entryId, saved.entryId);
      assert.equal(f.calls(), 0);
    },
  );
  await t.test(
    'account AI denial is durable and idempotent while manual food logging remains available',
    async () => {
      await owner.query('UPDATE fitquest.security_policy SET enabled=true,ai_calls_per_day=1');
      try {
        const f = await fresh();
        await f.service.command(f.a, f.interpret(), yes);
        const cmd = f.interpret();
        const denied = await f.service.command(f.a, cmd, yes);
        assert.equal(denied.error, 'account_ai_rate_limit');
        await f.service.command(f.a, cmd, yes);
        assert.equal(f.calls(), 1);
        await f.service.command(f.a, f.manual(), yes);
        assert.equal(f.calls(), 1);
      } finally {
        await owner.query('UPDATE fitquest.security_policy SET enabled=false,ai_calls_per_day=60');
      }
    },
  );
  await t.test(
    'food persistence uses owned entries, atomic receipts, decimals, explicit completion, corrections and moved dates without AI',
    async () => {
      const f = await fresh(),
        cmd = f.manual();
      const saved = await f.service.command(f.a, cmd, yes);
      assert.equal(f.calls(), 0);
      const first = await f.read();
      assert.equal(first.entries.length, 1);
      assert.equal(
        foodTotal(
          first.entries.map((e) => e.document),
          'calories',
        ).value,
        123.456,
      );
      await f.service.command(f.a, cmd, yes);
      assert.equal((await f.read()).entries.length, 1);
      await assert.rejects(
        f.service.command(
          f.a,
          {
            operationId: cmd.operationId,
            kind: 'complete',
            date: '2026-10-08',
            timeZone: 'UTC',
            complete: true,
            expectedRevision: 1,
          },
          yes,
        ),
        { code: 'operation_conflict' },
      );
      await f.service.command(
        f.a,
        {
          operationId: randomUUID(),
          kind: 'complete',
          date: '2026-10-08',
          timeZone: 'UTC',
          expectedRevision: 1,
          complete: true,
        },
        yes,
      );
      const complete = await f.read();
      assert.equal(foodAverage(complete, 'protein').days, 1);
      assert.equal(foodAverage(complete, 'carbs').days, 0);
      const entry = complete.entries[0]!;
      const edit: FoodCommand = {
        operationId: randomUUID(),
        kind: 'save',
        document: { ...entry.document, date: '2026-10-07', servings: 1.5 },
        entryId: entry.id,
        expectedRevision: entry.revision,
        candidateOperation: null,
        confirmConsumed: true,
      };
      await f.service.command(f.a, edit, yes);
      const moved = await f.read();
      assert.equal(moved.entries[0]!.document.date, '2026-10-07');
      assert.equal(moved.days.find((d) => d.date === '2026-10-08')?.complete, true);
      assert.equal(foodAverage(moved, 'protein').days, 1);
      assert.equal(
        foodTotal(
          moved.entries.map((e) => e.document),
          'calories',
        ).value,
        185.184,
      );
      await assert.rejects(f.service.command(f.a, { ...edit, operationId: randomUUID() }, yes), {
        code: 'food_changed',
      });
      assert.equal((await f.store.readOperation(f.a, cmd.operationId)).entryId, saved.entryId);
    },
  );
  await t.test(
    'food interpretation clarification and hypothetical candidates never affect totals; duplicates are one dispatch and reviewed save/reopen are free',
    async () => {
      const f = await fresh();
      f.set({ intent: 'unclear', question: 'How much did you eat?', document: null });
      const q = f.interpret();
      const results = await Promise.all([
        f.service.command(f.a, q, yes),
        f.service.command(f.a, q, yes),
      ]);
      assert.equal(f.calls(), 1);
      assert.equal((await f.read()).entries.length, 0);
      assert(results.some((r) => r.candidate?.question));
      f.set({ intent: 'planned', question: null, document: foodFixture() });
      const next = { ...f.interpret(), previousOperation: q.operationId } as FoodCommand;
      const proposal = await f.service.command(f.a, next, yes);
      assert.equal(proposal.candidate?.intent, 'planned');
      assert.equal((await f.read()).entries.length, 0);
      const save: FoodCommand = {
        operationId: randomUUID(),
        kind: 'save',
        document: proposal.candidate!.document!,
        candidateOperation: next.operationId,
        entryId: null,
        expectedRevision: null,
        confirmConsumed: true,
      };
      await f.service.command(f.a, save, yes);
      await f.service.command(f.a, save, yes);
      assert.equal(f.calls(), 2);
      assert.equal((await f.read()).entries.length, 1);
      await assert.rejects(f.service.command(f.a, { ...save, operationId: randomUUID() }, yes), {
        code: 'food_candidate_used',
      });
    },
  );
  await t.test(
    'food estimate provenance survives scaling, user corrections and bounded Undo; expired deletion cannot be restored',
    async () => {
      const f = await fresh(),
        doc = foodFixture();
      doc.items[0]!.nutrients.protein.source = 'estimated';
      f.set({ intent: 'consumed', question: null, document: doc });
      const turn = f.interpret();
      await f.service.command(f.a, turn, yes);
      await f.service.command(
        f.a,
        {
          ...f.manual(),
          kind: 'save',
          document: doc,
          candidateOperation: turn.operationId,
          entryId: null,
          expectedRevision: null,
          confirmConsumed: true,
        },
        yes,
      );
      const e = (await f.read()).entries[0]!;
      const edit = {
        ...f.manual(),
        kind: 'save' as const,
        entryId: e.id,
        expectedRevision: e.revision,
        document: { ...doc, servings: 0.5 },
        candidateOperation: null,
        confirmConsumed: true as const,
      };
      await f.service.command(f.a, edit, yes);
      const scaled = (await f.read()).entries[0]!;
      assert.equal(foodTotal([scaled.document], 'protein').value, 6.05);
      assert.equal(scaled.document.items[0]!.nutrients.protein.source, 'estimated');
      const incompatible = structuredClone(scaled.document);
      incompatible.items[0]!.name = 'Different food';
      await assert.rejects(
        f.service.command(
          f.a,
          {
            ...edit,
            operationId: randomUUID(),
            expectedRevision: scaled.revision,
            document: incompatible,
          },
          yes,
        ),
        { code: 'food_source_changed' },
      );
      await f.service.command(
        f.a,
        {
          operationId: randomUUID(),
          kind: 'delete',
          entryId: e.id,
          expectedRevision: scaled.revision,
        },
        yes,
      );
      const deleted = (await f.read()).entries[0]!;
      assert(deleted.deletedAt);
      assert.equal(foodAverage(await f.read(), 'protein').days, 0);
      await f.service.command(
        f.a,
        {
          operationId: randomUUID(),
          kind: 'undo',
          entryId: e.id,
          expectedRevision: deleted.revision,
        },
        yes,
      );
      const restored = (await f.read()).entries[0]!;
      assert.equal(restored.deletedAt, null);
      assert.deepEqual(restored.document, scaled.document);
      await f.service.command(
        f.a,
        {
          operationId: randomUUID(),
          kind: 'delete',
          entryId: e.id,
          expectedRevision: restored.revision,
        },
        yes,
      );
      await owner.query(
        "UPDATE fitquest.food_entries SET deleted_at=now()-interval '31 seconds',undo_until=now()-interval '1 second' WHERE user_id=$1",
        [f.a.userId],
      );
      await assert.rejects(
        f.service.command(
          f.a,
          {
            operationId: randomUUID(),
            kind: 'undo',
            entryId: e.id,
            expectedRevision: restored.revision + 1,
          },
          yes,
        ),
        { code: 'food_undo_expired' },
      );
      assert.equal((await f.read()).entries.length, 0);
      assert.equal(
        (
          await owner.query('SELECT document FROM fitquest.food_entries WHERE user_id=$1', [
            f.a.userId,
          ])
        ).rows[0].document,
        null,
      );
    },
  );
  await t.test(
    'food AI corrections target the selected owned revision and update without a duplicate meal',
    async () => {
      const f = await fresh();
      const saved = await f.service.command(f.a, f.manual(), yes);
      const before = (await f.read()).entries[0]!;
      const doc = { ...before.document, servings: 0.5 };
      f.set({ intent: 'consumed', question: null, document: doc });
      let body = '';
      const call = f.provider.call;
      f.provider.call = async (b, signal) => {
        body = b;
        return call(b, signal);
      };
      const interpretation = {
        ...f.interpret(),
        entryId: saved.entryId,
        expectedRevision: 1,
      } as FoodCommand;
      const candidate = await f.service.command(f.a, interpretation, yes);
      assert(JSON.parse(body).input.includes('savedEntry'));
      assert(!body.includes(f.a.userId));
      assert.equal((await f.read()).entries[0]!.document.servings, 1);
      await f.service.command(
        f.a,
        {
          operationId: randomUUID(),
          kind: 'save',
          document: doc,
          entryId: saved.entryId,
          expectedRevision: 1,
          candidateOperation: candidate.id,
          confirmConsumed: true,
        },
        yes,
      );
      const after = await f.read();
      assert.equal(after.entries.length, 1);
      assert.equal(after.entries[0]!.document.servings, 0.5);
      assert.equal(after.entries[0]!.revision, 2);
      await assert.rejects(
        f.service.command(f.a, { ...interpretation, operationId: randomUUID() }, yes),
        { code: 'food_changed' },
      );
    },
  );
  await t.test(
    'food RLS, account-owned revisions and operation context reject cross-account reads and writes',
    async () => {
      const f = await fresh(),
        other = await fresh();
      const s = await f.service.command(f.a, f.manual(), yes);
      assert.equal((await other.read()).entries.length, 0);
      await assert.rejects(
        other.service.command(
          other.a,
          { operationId: randomUUID(), kind: 'delete', entryId: s.entryId!, expectedRevision: 1 },
          yes,
        ),
        { code: 'food_changed' },
      );
      await assert.rejects(other.store.readOperation(other.a, s.id), {
        code: 'food_operation_missing',
      });
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('fitquest.user_id',$1,true)", [other.a.userId]);
        assert.equal(
          (await c.query('SELECT * FROM fitquest.food_entries WHERE id=$1', [s.entryId])).rowCount,
          0,
        );
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
      for (const role of ['anon', 'authenticated', 'service_role'])
        for (const table of ['food_entries', 'food_days', 'food_operations'])
          assert.equal(
            (
              await owner.query("SELECT has_table_privilege($1,$2,'SELECT') AS ok", [
                role,
                'fitquest.' + table,
              ])
            ).rows[0].ok,
            false,
          );
    },
  );
  await t.test(
    'food failure, uncertainty, expired leases, budget exhaustion and late settlement preserve shared accounting without automatic retry',
    async () => {
      const f = await fresh();
      f.mode('unknown');
      const command = f.interpret();
      const result = await f.service.command(f.a, command, yes);
      assert.equal(result.status, 'failed');
      await f.service.command(f.a, command, yes);
      assert.equal(f.calls(), 1);
      const attempts = () =>
        owner.query(
          'SELECT * FROM fitquest.onboarding_attempts WHERE user_id=$1 ORDER BY created_at',
          [f.a.userId],
        );
      assert.equal((await attempts()).rows[0].state, 'uncertain');
      await f.store.settle(f.a, (await attempts()).rows[0].id, 7);
      assert.equal((await attempts()).rows[0].state, 'settled');
      const pending = f.interpret();
      const claim = await f.store.claim(f.a, pending, f.provider);
      assert(claim.work);
      await owner.query(
        "UPDATE fitquest.food_operations SET deadline=now()-interval '1 second' WHERE user_id=$1 AND id=$2",
        [f.a.userId, pending.operationId],
      );
      assert.equal((await f.store.readOperation(f.a, pending.operationId)).error, 'interrupted');
      await f.store.settle(f.a, claim.work.attempt, 5);
      await f.store.finish(
        f.a,
        pending.operationId,
        claim.work.attempt,
        { intent: 'consumed', question: null, document: foodFixture() },
        null,
      );
      assert.equal((await f.store.readOperation(f.a, pending.operationId)).candidate, null);
      f.provider.capMicro = 1;
      const exhausted = await f.service.command(f.a, f.interpret(), yes);
      assert.equal(exhausted.error, 'budget_exhausted');
      assert.equal(f.calls(), 1);
      await f.service.command(f.a, f.manual(), yes);
      assert.equal((await f.read()).entries.length, 1);
      f.provider.capMicro = 7000000;
      f.mode('valid');
      await assert.rejects(
        f.service.command(f.a, f.interpret(), async () => false),
        { code: 'session_ended' },
      );
      assert.equal((await attempts()).rows.at(-1).state, 'settled');
    },
  );
  await t.test(
    'a completed paid food result remains recoverable after response-token rejection or a temporary recheck failure without another dispatch',
    async () => {
      for (const unavailable of [false, true]) {
        const f = await fresh(),
          command = f.interpret();
        await assert.rejects(
          f.service.command(f.a, command, async () => {
            if (unavailable) throw Error('Synthetic temporary verification failure');
            return false;
          }),
        );
        const saved = await f.store.readOperation(f.a, command.operationId);
        assert.equal(saved.status, 'completed');
        assert(saved.candidate);
        assert.equal((await f.read()).entries.length, 0);
        assert.deepEqual(await f.service.command(f.a, command, yes), saved);
        assert.equal(f.calls(), 1);
        assert.equal(
          (
            await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE user_id=$1', [
              f.a.userId,
            ])
          ).rows[0].state,
          'settled',
        );
      }
    },
  );
  await t.test(
    'a session actually revoked during food interpretation cannot finish or read the private candidate',
    async () => {
      const f = await fresh(),
        command = f.interpret(),
        call = f.provider.call;
      f.provider.call = async (...args) => {
        const result = await call(...args);
        await owner.query(
          "UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",
          [f.a.sessionId],
        );
        return result;
      };
      await assert.rejects(f.service.command(f.a, command, yes), { code: 'session_ended' });
      await assert.rejects(f.store.readOperation(f.a, command.operationId), {
        code: 'session_ended',
      });
      const stored = (
        await owner.query(
          'SELECT candidate FROM fitquest.food_operations WHERE user_id=$1 AND id=$2',
          [f.a.userId, command.operationId],
        )
      ).rows[0];
      assert.equal(stored.candidate, null);
      assert.equal(f.calls(), 1);
      assert.equal(
        (
          await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE user_id=$1', [
            f.a.userId,
          ])
        ).rows[0].state,
        'settled',
      );
    },
  );
  await t.test(
    'food save rollback leaves no entry or receipt, allowing exact retry without AI',
    async () => {
      const f = await fresh();
      const cmd = f.manual();
      await owner.query(
        `CREATE FUNCTION fitquest.fail_food_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE CONSTRAINT TRIGGER fail_food_test AFTER INSERT ON fitquest.food_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.user_id='${f.a.userId}'::uuid) EXECUTE FUNCTION fitquest.fail_food_test();`,
      );
      try {
        await assert.rejects(f.service.command(f.a, cmd, yes));
        assert.equal((await f.read()).entries.length, 0);
        await assert.rejects(f.store.readOperation(f.a, cmd.operationId), {
          code: 'food_operation_missing',
        });
      } finally {
        await owner.query(
          'DROP TRIGGER fail_food_test ON fitquest.food_entries;DROP FUNCTION fitquest.fail_food_test()',
        );
      }
      await f.service.command(f.a, cmd, yes);
      assert.equal((await f.read()).entries.length, 1);
      assert.equal(f.calls(), 0);
    },
  );
}
