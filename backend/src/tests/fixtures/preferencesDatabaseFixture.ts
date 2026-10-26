import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from '../../features/account/profileStore.js';
import { preferencesStore } from '../../features/account/preferencesStore.js';
import { buildApp } from '../../app.js';
export async function verifyPreferencesDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  await t.test(
    'account preferences persist across clients, reject stale writes and enforce private ownership/session boundaries',
    async () => {
      const a = { userId: randomUUID(), sessionId: randomUUID() },
        b = { userId: randomUUID(), sessionId: randomUUID() };
      await owner.query('INSERT INTO auth.users VALUES($1),($2)', [a.userId, b.userId]);
      await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4)', [
        a.sessionId,
        a.userId,
        b.sessionId,
        b.userId,
      ]);
      const protectedBefore = (
        await owner.query('SELECT to_jsonb(p) AS v FROM fitquest.profiles p ORDER BY user_id')
      ).rows;
      const first = preferencesStore(pool),
        second = preferencesStore(pool);
      assert.deepEqual(await first.read(a), { weightUnit: 'lb', revision: 0 });
      assert.deepEqual(await first.save(a, { weightUnit: 'kg', expectedRevision: 0 }), {
        weightUnit: 'kg',
        revision: 1,
      });
      assert.deepEqual(await second.read(a), { weightUnit: 'kg', revision: 1 });
      assert.deepEqual(await second.read(b), { weightUnit: 'lb', revision: 0 });
      await assert.rejects(second.save(a, { weightUnit: 'lb', expectedRevision: 0 }), {
        code: 'preferences_changed',
      });
      assert.deepEqual(await second.save(a, { weightUnit: 'kg', expectedRevision: 1 }), {
        weightUnit: 'kg',
        revision: 1,
      });
      const concurrent = await Promise.allSettled([
        first.save(a, { weightUnit: 'lb', expectedRevision: 1 }),
        second.save(a, { weightUnit: 'kg', expectedRevision: 1 }),
      ]);
      assert.equal(concurrent.filter((x) => x.status === 'fulfilled').length, 1);
      assert.equal((await first.read(a)).weightUnit, 'lb');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('fitquest.user_id',$1,true)", [b.userId]);
        assert.equal(
          (await client.query('SELECT * FROM fitquest.account_preferences')).rowCount,
          0,
        );
        await assert.rejects(
          client.query(
            "INSERT INTO fitquest.account_preferences(user_id,weight_unit,revision) VALUES($1,'kg',1)",
            [a.userId],
          ),
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      const security = (
        await owner.query(
          "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='fitquest.account_preferences'::regclass",
        )
      ).rows[0];
      assert.deepEqual(security, { relrowsecurity: true, relforcerowsecurity: true });
      for (const role of ['anon', 'authenticated', 'service_role'])
        assert.equal(
          (
            await owner.query(
              "SELECT has_table_privilege($1,'fitquest.account_preferences','SELECT,INSERT,UPDATE,DELETE') AS allowed",
              [role],
            )
          ).rows[0].allowed,
          false,
        );
      const api = buildApp(false, {
        store: profiles,
        preferences: first,
        verifyAccount: async (token) => (token === 'synthetic-a' ? a : null),
      });
      try {
        assert.equal((await api.inject({ url: '/account-preferences' })).statusCode, 401);
        const response = await api.inject({
          url: '/account-preferences',
          headers: { authorization: 'Bearer synthetic-a' },
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(
          (
            await api.inject({
              method: 'PUT',
              url: '/account-preferences',
              headers: { authorization: 'Bearer synthetic-a' },
              payload: { weightUnit: 'kg', expectedRevision: 2, userId: b.userId },
            })
          ).statusCode,
          400,
        );
        assert.equal(
          (
            await api.inject({
              method: 'PUT',
              url: '/account-preferences',
              headers: { authorization: 'Bearer synthetic-a' },
              payload: { weightUnit: 'stone', expectedRevision: 2 },
            })
          ).statusCode,
          400,
        );
        await owner.query('DELETE FROM auth.sessions WHERE id=$1', [a.sessionId]);
        await assert.rejects(first.read(a), { code: 'session_ended' });
        assert.equal(
          (
            await api.inject({
              url: '/account-preferences',
              headers: { authorization: 'Bearer synthetic-a' },
            })
          ).statusCode,
          401,
        );
      } finally {
        await api.close();
      }
      assert.deepEqual(
        (await owner.query('SELECT to_jsonb(p) AS v FROM fitquest.profiles p ORDER BY user_id'))
          .rows,
        protectedBefore,
      );
    },
  );
}
