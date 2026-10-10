import { planningStore } from './planningStore.js';
import { intakeSummary } from './fixedIntake.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from './profileStore.js';
import { weightStore } from './weightStore.js';
import { trainingTestResetStatements } from './trainingTestReset.js';
import { buildApp } from './app.js';
import type { WeightCommand } from './weightContract.js';
export async function verifyWeightDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  const store = weightStore(pool);
  async function fresh() {
    const a = { userId: randomUUID(), sessionId: randomUUID() };
    await owner.query('INSERT INTO auth.users VALUES($1)', [a.userId]);
    await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
      a.sessionId,
      a.userId,
    ]);
    await profiles.save(a, {
      firstName: 'Synthetic',
      lastName: 'Weight',
      age: 30,
      height: { value: 68, unit: 'in' },
      weight: { value: 155, unit: 'lb' },
      gender: 'Unspecified',
    });
    return a;
  }
  const create = (
    date = '2026-10-05',
    value = 155.75,
    unit: 'lb' | 'kg' = 'lb',
  ): WeightCommand => ({
    kind: 'save',
    operationId: randomUUID(),
    entryId: null,
    expectedRevision: null,
    measurement: { value, unit, date, timeZone: 'America/New_York' },
  });
  async function protectedRows() {
    const output: unknown[] = [];
    for (const table of [
      'profiles',
      'training_plans',
      'onboarding_attempts',
      'ai_budget',
      'workout_journals',
      'workout_journal_operations',
      'food_entries',
      'food_days',
      'food_operations',
      'food_library',
      'food_library_operations',
    ])
      output.push(
        (
          await owner.query(
            `SELECT to_jsonb(t) AS v FROM fitquest.${table} t ORDER BY to_jsonb(t)::text`,
          )
        ).rows,
      );
    return output;
  }
  await t.test(
    'weight create/reopen/correction/delete preserve decimal units, latest measured date and all unrelated data; idempotent uncertain replay',
    async () => {
      const a = await fresh();
      await owner.query(
        "INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone) VALUES($1,1,$2,'UTC')",
        [
          a.userId,
          JSON.stringify(
            intakeSummary({
              version: 1,
              answers: ['Strength', 'Walking', 'Dumbbells', 'Flexible', 'None'],
            }),
          ),
        ],
      );
      await planningStore(pool).ensurePlan(a, 1);
      const before = await protectedRows();
      assert.deepEqual((await store.list(a)).items, []);
      const cmd = create();
      const [r, replay] = await Promise.all([store.command(a, cmd), store.command(a, cmd)]);
      assert.deepEqual(r, replay);
      assert.deepEqual(await store.readOperation(a, r.id), r);
      assert.equal((await store.list(a)).items.length, 1);
      const entry = await store.read(a, r.entryId);
      assert.deepEqual(entry.measurement, (cmd as any).measurement);
      const newer = await store.command(a, create('2026-10-06', 70.35, 'kg'));
      const backdated = await store.command(a, create('2026-10-03', 160.125));
      assert.equal((await store.list(a)).items[0]!.id, newer.entryId);
      const edit: WeightCommand = {
        kind: 'save',
        operationId: randomUUID(),
        entryId: backdated.entryId,
        expectedRevision: 1,
        measurement: { value: 71.25, unit: 'kg', date: '2026-10-07', timeZone: 'UTC' },
      };
      await store.command(a, edit);
      assert.equal((await store.list(a)).items[0]!.id, backdated.entryId);
      assert.equal((await store.read(a, backdated.entryId)).measurement!.value, 71.25);
      await assert.rejects(store.command(a, { ...edit, operationId: randomUUID() }), {
        code: 'weight_changed',
      });
      await assert.rejects(
        store.command(a, { ...edit, measurement: { ...edit.measurement, value: 72 } }),
        { code: 'operation_conflict' },
      );
      const del: WeightCommand = {
        kind: 'delete',
        operationId: randomUUID(),
        entryId: backdated.entryId,
        expectedRevision: 2,
      };
      const removed = await store.command(a, del);
      assert.deepEqual(await store.command(a, del), removed);
      assert.equal((await store.read(a, backdated.entryId)).measurement, null);
      assert.equal((await store.list(a)).items[0]!.id, newer.entryId);
      await assert.rejects(
        store.command(a, { ...edit, operationId: randomUUID(), expectedRevision: 3 }),
        { code: 'weight_changed' },
      );
      assert.deepEqual(await protectedRows(), before);
      const snapshot = async () => {
        const output = [];
        for (const table of ['body_weights', 'body_weight_operations'])
          output.push(
            (
              await owner.query(
                `SELECT to_jsonb(t) AS v FROM fitquest.${table} t WHERE user_id=$1 ORDER BY id`,
                [a.userId],
              )
            ).rows,
          );
        return output;
      };
      const saved = await snapshot();
      await owner.query('BEGIN');
      await owner.query('SET CONSTRAINTS ALL DEFERRED');
      for (const sql of trainingTestResetStatements) await owner.query(sql, [a.userId]);
      await owner.query('COMMIT');
      assert.deepEqual(await snapshot(), saved);
      assert.equal((await store.list(a)).items.length, 2);
      assert.deepEqual(await store.readOperation(a, r.id), r);
    },
  );
  await t.test(
    'weight routes and RLS isolate owners and revoked sessions; forged revisions/dates rejected without mutation',
    async () => {
      const a = await fresh(),
        b = await fresh(),
        r = await store.command(a, create());
      await assert.rejects(store.read(b, r.entryId), { code: 'weight_missing' });
      await assert.rejects(store.readOperation(b, r.id), { code: 'weight_operation_missing' });
      await assert.rejects(
        store.command(b, {
          kind: 'delete',
          operationId: randomUUID(),
          entryId: r.entryId,
          expectedRevision: 1,
        }),
        { code: 'weight_missing' },
      );
      await assert.rejects(store.command(a, create('2099-01-01')), { code: 'future_weight' });
      for (const table of ['body_weights', 'body_weight_operations']) {
        for (const role of ['anon', 'authenticated', 'service_role'])
          assert.equal(
            (
              await owner.query("SELECT has_table_privilege($1,$2,'SELECT') AS ok", [
                role,
                'fitquest.' + table,
              ])
            ).rows[0].ok,
            false,
          );
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          await c.query("SELECT set_config('fitquest.user_id',$1,true)", [b.userId]);
          assert.equal(
            (await c.query(`SELECT * FROM fitquest.${table} WHERE user_id=$1`, [a.userId]))
              .rowCount,
            0,
          );
          await c.query('ROLLBACK');
        } finally {
          c.release();
        }
      }
      const app = buildApp(false, {
        weight: store,
        verifyAccount: async (token) => (token === 'alice' ? a : token === 'bob' ? b : null),
      });
      try {
        for (const path of [
          '/body-weight',
          '/body-weight/' + r.entryId,
          '/body-weight/operations/' + r.id,
        ]) {
          const denied = await app.inject({ method: 'GET', url: path });
          assert.equal(denied.statusCode, 401);
          assert.equal(denied.headers['cache-control'], 'no-store');
        }
        const own = await app.inject({
          method: 'GET',
          url: '/body-weight/' + r.entryId,
          headers: { authorization: 'Bearer alice' },
        });
        assert.equal(own.statusCode, 200);
        assert.equal(own.headers['cache-control'], 'no-store');
        const other = await app.inject({
          method: 'GET',
          url: '/body-weight/' + r.entryId,
          headers: { authorization: 'Bearer bob' },
        });
        assert.equal(other.statusCode, 404);
        assert(!other.body.includes('155.75'));
        const invalid = await app.inject({
          method: 'POST',
          url: '/body-weight/commands',
          headers: { authorization: 'Bearer alice' },
          payload: {
            ...create(),
            measurement: { value: NaN, unit: 'lb', date: '2026-10-05', timeZone: 'UTC' },
          },
        });
        assert.equal(invalid.statusCode, 400);
      } finally {
        await app.close();
      }
      await owner.query('DELETE FROM auth.sessions WHERE id=$1', [a.sessionId]);
      await assert.rejects(store.list(a), { code: 'session_ended' });
    },
  );
  await t.test(
    'weight receipts and mutations commit atomically; complete history paginates in measured-date order',
    async () => {
      const a = await fresh(),
        cmd = create();
      await owner.query(
        `CREATE FUNCTION fitquest.fail_weight_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;CREATE CONSTRAINT TRIGGER fail_weight_test AFTER INSERT ON fitquest.body_weight_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.user_id='${a.userId}'::uuid) EXECUTE FUNCTION fitquest.fail_weight_test();`,
      );
      try {
        await assert.rejects(store.command(a, cmd));
        assert.equal((await store.list(a)).items.length, 0);
        await assert.rejects(store.readOperation(a, cmd.operationId), {
          code: 'weight_operation_missing',
        });
      } finally {
        await owner.query(
          'DROP TRIGGER fail_weight_test ON fitquest.body_weight_operations;DROP FUNCTION fitquest.fail_weight_test()',
        );
      }
      for (let i = 0; i < 51; i++) await store.command(a, create('2026-10-05', 150 + i / 10));
      const first = await store.list(a),
        last = await store.list(a, first.nextOffset!);
      assert.equal(first.items.length, 50);
      assert.equal(last.items.length, 1);
      assert.equal(last.nextOffset, null);
      assert.equal(new Set([...first.items, ...last.items].map((e) => e.id)).size, 51);
    },
  );
}
