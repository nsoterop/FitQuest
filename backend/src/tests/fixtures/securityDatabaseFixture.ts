import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { accountRequestGuard } from '../../features/account/requestLimits.js';
import { reserveAI } from '../../ai/allowance.js';
import type { Account } from '../../features/account/auth.js';
import { buildApp } from '../../app.js';
import { postgresProfileStore } from '../../features/account/profileStore.js';
export async function verifySecurityDatabase(t: TestContext, owner: Pool, pool: Pool) {
  async function fresh(): Promise<Account> {
    const a = { userId: randomUUID(), sessionId: randomUUID() };
    await owner.query('INSERT INTO auth.users VALUES($1)', [a.userId]);
    await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
      a.sessionId,
      a.userId,
    ]);
    return a;
  }
  async function owned<T>(a: Account, run: (c: import('pg').PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('fitquest.user_id',$1,true)", [a.userId]);
      const value = await run(c);
      await c.query('COMMIT');
      return value;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async function reserve(a: Account, amount: number, schema = 'document_result_v1') {
    const id = randomUUID();
    const failure = await owned(a, async (c) => {
      await c.query(
        "INSERT INTO fitquest.onboarding_attempts(user_id,id,state,model,prompt_version,schema_version) VALUES($1,$2,'not_dispatched','synthetic','security',$3)",
        [a.userId, id, schema],
      );
      return reserveAI(c, id, amount, 7000000);
    });
    return { id, failure };
  }
  const configure = (calls = 60, daily = 4000000, lifetime = 5000000) =>
    owner.query(
      'UPDATE fitquest.security_policy SET enabled=true,requests_per_minute=3,requests_per_hour=6,ai_calls_per_day=$1,ai_daily_micro=$2,ai_lifetime_micro=$3',
      [calls, daily, lifetime],
    );
  try {
    await configure();
    await t.test(
      'durable request guard commits before invalid payloads, shares counts across instances and preserves revoked-session isolation',
      async () => {
        const a = await fresh(),
          b = await fresh();
        const first = accountRequestGuard(pool),
          second = accountRequestGuard(pool);
        const results = await Promise.all(
          Array.from({ length: 8 }, (_, i) => (i % 2 ? first : second)(a)),
        );
        assert.equal(results.filter((x) => x === 0).length, 3);
        assert(results.filter((x) => x > 0).every((x) => x <= 3600));
        assert.equal(await second(b), 0);
        const before = (
          await owner.query('SELECT * FROM fitquest.account_request_limits WHERE user_id=$1', [
            a.userId,
          ])
        ).rows;
        await assert.rejects(first({ ...a, sessionId: b.sessionId }), { code: 'session_ended' });
        assert.deepEqual(
          (
            await owner.query('SELECT * FROM fitquest.account_request_limits WHERE user_id=$1', [
              a.userId,
            ])
          ).rows,
          before,
        );
        await owner.query(
          "UPDATE fitquest.account_request_limits SET minute=minute-interval '1 minute' WHERE user_id=$1",
          [a.userId],
        );
        assert((await first(a)) > 0); // hour limit survives minute boundary
        await owner.query(
          "UPDATE fitquest.account_request_limits SET hour=hour-interval '1 hour' WHERE user_id=$1",
          [a.userId],
        );
        assert.equal(await first(a), 0);
        // Simulate a late arrival observing a window newer than its captured timestamp.
        await owner.query(
          "UPDATE fitquest.account_request_limits SET minute=date_trunc('minute',clock_timestamp(),'UTC')+interval '1 minute',minute_count=3,hour_count=0 WHERE user_id=$1",
          [a.userId],
        );
        const newerWindow = (
          await owner.query('SELECT minute FROM fitquest.account_request_limits WHERE user_id=$1', [
            a.userId,
          ])
        ).rows[0].minute;
        assert((await first(a)) > 0);
        const lateArrival = (
          await owner.query(
            'SELECT minute,minute_count FROM fitquest.account_request_limits WHERE user_id=$1',
            [a.userId],
          )
        ).rows[0];
        assert.deepEqual(lateArrival, { minute: newerWindow, minute_count: 4 });
        const c = await fresh();
        const app = buildApp(false, {
          store: postgresProfileStore(pool),
          verifyAccount: async () => c,
          accountRequestGuard: first,
        });
        try {
          for (let i = 0; i < 3; i++)
            assert.equal(
              (
                await app.inject({
                  method: 'POST',
                  url: '/profile-intake',
                  headers: { authorization: 'Bearer synthetic' },
                  payload: { bad: 'input' },
                })
              ).statusCode,
              400,
            );
          const denied = await app.inject({
            url: '/profile',
            headers: { authorization: 'Bearer synthetic' },
          });
          assert.equal(denied.statusCode, 429);
          assert(Number(denied.headers['retry-after']) > 0);
          await owner.query('DELETE FROM auth.sessions WHERE id=$1', [c.sessionId]);
          assert.equal(
            (await app.inject({ url: '/profile', headers: { authorization: 'Bearer synthetic' } }))
              .statusCode,
            401,
          );
        } finally {
          await app.close();
        }
        await owner.query(
          "UPDATE fitquest.account_request_limits SET touched_at=now()-interval '8 days' WHERE user_id=$1",
          [b.userId],
        );
        await first(await fresh());
        assert.equal(
          (
            await owner.query('SELECT 1 FROM fitquest.account_request_limits WHERE user_id=$1', [
              b.userId,
            ])
          ).rowCount,
          0,
        );
        await owned(a, async (client) => {
          assert.equal(
            (
              await client.query('SELECT * FROM fitquest.account_request_limits WHERE user_id=$1', [
                c.userId,
              ])
            ).rowCount,
            0,
          );
        });
        await assert.rejects(
          owned(a, (client) => client.query('UPDATE fitquest.security_policy SET enabled=false')),
          { code: '42501' },
        );
      },
    );
    await t.test(
      'counter cleanup is bounded and skips rows locked by another transaction',
      async () => {
        const expired = Array.from({ length: 102 }, () => randomUUID());
        await owner.query('INSERT INTO auth.users SELECT unnest($1::uuid[])', [expired]);
        await owner.query(
          "INSERT INTO fitquest.account_request_limits SELECT unnest($1::uuid[]),now()-interval '8 days',1,now()-interval '8 days',1,now()-interval '8 days'",
          [expired],
        );
        const a = await fresh();
        await owner.query('BEGIN');
        try {
          await owner.query(
            'SELECT 1 FROM fitquest.account_request_limits WHERE user_id=$1 FOR UPDATE',
            [expired[0]],
          );
          assert.equal(await accountRequestGuard(pool)(a), 0);
          assert.equal(
            (
              await owner.query(
                'SELECT count(*)::int n FROM fitquest.account_request_limits WHERE user_id=ANY($1::uuid[])',
                [expired],
              )
            ).rows[0].n,
            2,
          );
        } finally {
          await owner.query('ROLLBACK');
        }
        assert.equal(await accountRequestGuard(pool)(a), 0);
        assert.equal(
          (
            await owner.query(
              'SELECT count(*)::int n FROM fitquest.account_request_limits WHERE user_id=ANY($1::uuid[])',
              [expired],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      'one ledger atomically limits all AI paths, preserves unknown liabilities and separates daily/lifetime/global denial',
      async () => {
        await configure(1, 1000, 2000);
        const a = await fresh(),
          b = await fresh();
        const raced = await Promise.all([reserve(a, 100), reserve(a, 100, 'food-v1')]);
        assert.equal(raced.filter((x) => !x.failure).length, 1);
        assert.equal(raced.find((x) => x.failure)?.failure, 'account_ai_rate_limit');
        const granted = raced.find((x) => !x.failure)!;
        await owned(a, async (c) => {
          assert.equal(
            (
              await c.query('SELECT fitquest.reserve_onboarding($1,100,7000000) AS allowed', [
                granted.id,
              ])
            ).rows[0].allowed,
            false,
          );
          await c.query('SELECT fitquest.settle_onboarding($1,NULL)', [granted.id]);
        });
        const globalBefore = (await owner.query('SELECT * FROM fitquest.ai_budget')).rows;
        assert.equal((await reserve(a, 100, 'understanding-v4')).failure, 'account_ai_rate_limit');
        assert.deepEqual(
          (await owner.query('SELECT * FROM fitquest.ai_budget')).rows,
          globalBefore,
        );
        assert.equal((await reserve(b, 100)).failure, undefined);
        await configure(60, 150, 2000);
        await owner.query(
          "UPDATE fitquest.onboarding_attempts SET reserved_at=now()-interval '2 days' WHERE user_id=$1",
          [a.userId],
        );
        assert.equal((await reserve(a, 60)).failure, 'account_ai_daily_limit'); // old uncertain liability still reserved
        await owned(a, async (c) => {
          await c.query('SELECT fitquest.settle_onboarding($1,50)', [granted.id]);
          await c.query('SELECT fitquest.settle_onboarding($1,50)', [granted.id]);
        });
        assert.equal((await reserve(a, 150, 'food-v1')).failure, undefined); // past settled cost is lifetime only
        await configure(60, 1000, 200);
        assert.equal((await reserve(a, 1)).failure, 'account_ai_lifetime_limit');
        const actual = (
          await owner.query(
            'SELECT actual_micro,state FROM fitquest.onboarding_attempts WHERE id=$1',
            [granted.id],
          )
        ).rows[0];
        assert.deepEqual(actual, { actual_micro: '50', state: 'settled' });
        assert.equal(await accountRequestGuard(pool)(a), 0); // AI exhaustion never enters ordinary request counters
        await configure();
        const policy = (await owner.query('SELECT * FROM fitquest.security_policy')).rows[0];
        assert.equal(policy.ai_daily_micro, '4000000');
        // Maximum supported Sol reservation: 450K input bytes at the conservative premium + 48K output.
        assert.equal((await reserve(await fresh(), 2970000)).failure, undefined);
        const g = await fresh();
        await owned(g, async (c) => {
          const id = randomUUID();
          await c.query(
            "INSERT INTO fitquest.onboarding_attempts(user_id,id,state,model,prompt_version,schema_version) VALUES($1,$2,'not_dispatched','synthetic','security','food-v1')",
            [g.userId, id],
          );
          assert.equal(await reserveAI(c, id, 100, 1), 'budget_exhausted');
        });
      },
    );
    await t.test(
      'new functions and metadata are private; account deletion does not erase AI liabilities',
      async () => {
        for (const role of ['anon', 'authenticated', 'service_role'])
          for (const fn of ['take_account_request(uuid)', 'reserve_onboarding(uuid,bigint,bigint)'])
            assert.equal(
              (
                await owner.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS ok", [
                  role,
                  'fitquest.' + fn,
                ])
              ).rows[0].ok,
              false,
            );
        const a = await fresh();
        for (const column of ['reserved_at', 'allowance_denial', 'reserved_micro', 'actual_micro'])
          for (const privilege of ['INSERT', 'UPDATE'])
            assert.equal(
              (
                await owner.query('SELECT has_column_privilege($1,$2,$3,$4) AS ok', [
                  'fitquest_app',
                  'fitquest.onboarding_attempts',
                  column,
                  privilege,
                ])
              ).rows[0].ok,
              false,
            );
        await assert.rejects(
          owned(a, (client) =>
            client.query(
              "INSERT INTO fitquest.onboarding_attempts(user_id,id,state,model,prompt_version,schema_version,reserved_at) VALUES($1,$2,'not_dispatched','synthetic','security','food-v1',now())",
              [a.userId, randomUUID()],
            ),
          ),
          { code: '42501' },
        );
        await accountRequestGuard(pool)(a);
        await reserve(a, 10);
        await owner.query('DELETE FROM auth.users WHERE id=$1', [a.userId]);
        assert.equal(
          (
            await owner.query('SELECT 1 FROM fitquest.account_request_limits WHERE user_id=$1', [
              a.userId,
            ])
          ).rowCount,
          0,
        );
        assert.equal(
          (
            await owner.query('SELECT 1 FROM fitquest.onboarding_attempts WHERE user_id=$1', [
              a.userId,
            ])
          ).rowCount,
          1,
        );
      },
    );
  } finally {
    await owner.query(
      'UPDATE fitquest.security_policy SET enabled=false,requests_per_minute=120,requests_per_hour=1200,ai_calls_per_day=60,ai_daily_micro=4000000,ai_lifetime_micro=5000000',
    );
  }
}
