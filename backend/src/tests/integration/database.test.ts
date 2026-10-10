import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { buildApp } from '../../app.js';
import { postgresProfileStore } from '../../features/account/profileStore.js';
import { verifyOnboardingDatabase } from '../fixtures/onboardingDatabaseFixture.js';

// Explicit opt-in, isolated local cluster only. Never accepts a hosted URL.
const testUrl = process.env.FITQUEST_TEST_DATABASE_URL;
test(
  'local PostgreSQL: persistence, RLS isolation, full account reset and fresh baseline',
  { skip: !testUrl },
  async (t) => {
    const url = new URL(testUrl!);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '55432');
    const admin = new Pool({ connectionString: testUrl, max: 1 });
    const database = `fitquest_profiles_test_${process.pid}`;
    const previous = await admin.query('SELECT datname FROM pg_database WHERE datname=$1', [
      database,
    ]);
    assert.equal(previous.rowCount, 0);
    await admin.query(`CREATE DATABASE ${database}`);
    url.pathname = `/${database}`;
    const owner = new Pool({ connectionString: url.toString(), max: 1 });
    const pools = new Set<Pool>([owner]);
    t.after(async () => {
      await Promise.all([...pools].map((pool) => pool.end()));
      await admin.query(`DROP DATABASE ${database}`);
      await admin.query('DROP ROLE fitquest_app');
      await admin.end();
    });
    // Synthetic Auth schema implements just the referenced columns, not hosted auth verification.
    await owner.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users ON DELETE CASCADE, not_after timestamptz);
    CREATE TABLE auth.identities (id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users ON DELETE CASCADE);
    CREATE TABLE auth.refresh_tokens (id text PRIMARY KEY, session_id uuid REFERENCES auth.sessions ON DELETE CASCADE);
    CREATE TABLE auth.flow_state (id text PRIMARY KEY);
    CREATE TABLE auth.audit_log_entries (id text PRIMARY KEY);
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects (id uuid PRIMARY KEY);
    CREATE POLICY "Users can read own progress media" ON storage.objects FOR SELECT USING (true);
    CREATE POLICY "Users can update own progress media" ON storage.objects FOR UPDATE USING (true);
    CREATE POLICY "Users can upload own progress media" ON storage.objects FOR INSERT WITH CHECK (true);
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
    INSERT INTO supabase_migrations.schema_migrations VALUES ('old-baseline');
    ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE auth.sessions FORCE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;`);
    const baseline = await readFile(
      new URL(
        '../../../../database/migrations/20261002233706_reset_accounts_and_profiles.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await owner.query('BEGIN');
    await owner.query(baseline);
    await owner.query(
      await readFile(
        new URL(
          '../../../../database/migrations/20261010190000_profile_birthday.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await owner.query('COMMIT');
    const alice = {
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    const bob = {
      userId: '22222222-2222-4222-8222-222222222222',
      sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    await owner.query('INSERT INTO auth.users VALUES ($1),($2)', [alice.userId, bob.userId]);
    await owner.query('INSERT INTO auth.sessions VALUES ($1,$2,NULL),($3,$4,NULL)', [
      alice.sessionId,
      alice.userId,
      bob.sessionId,
      bob.userId,
    ]);
    const input = {
      firstName: 'Alex',
      lastName: 'Example',
      height: { value: 68, unit: 'in' as const },
      age: 29,
      weight: { value: 155.5, unit: 'lb' as const },
      gender: 'Male',
    };
    url.username = 'fitquest_app';
    const restricted = new Pool({ connectionString: url.toString(), max: 1 });
    pools.add(restricted);
    const store = postgresProfileStore(restricted);
    await store.save(alice, input);
    await store.save(bob, { ...input, firstName: 'Jordan' });
    await store.save(alice, { ...input, age: 30, weight: { value: 156.5, unit: 'lb' } });
    const saved = await store.read(alice);
    assert.equal(saved?.age, 30);
    assert.equal(saved?.weight.value, 156.5);
    assert.ok(saved?.ageCapturedAt && saved.updatedAt);
    assert.equal((await owner.query('SELECT count(*) FROM fitquest.profiles')).rows[0].count, '2');
    assert.equal((await store.read(bob))?.firstName, 'Jordan');
    await restricted.end();
    pools.delete(restricted);
    const reopened = new Pool({ connectionString: url.toString(), max: 1 });
    pools.add(reopened);
    const durable = postgresProfileStore(reopened);
    assert.deepEqual(await durable.read(alice), saved);
    const c = await reopened.connect();
    try {
      // No account context: RLS sees no rows. Alice context: broad query still cannot see Bob.
      assert.equal((await c.query('SELECT * FROM fitquest.profiles')).rowCount, 0);
      await assert.rejects(c.query('SELECT id FROM auth.sessions'), { code: '42501' });
      await c.query('BEGIN');
      await c.query("SELECT set_config('fitquest.user_id', $1, true)", [alice.userId]);
      assert.equal((await c.query('SELECT * FROM fitquest.profiles')).rowCount, 1);
      assert.equal(
        (
          await c.query("UPDATE fitquest.profiles SET first_name='Intruder' WHERE user_id=$1", [
            bob.userId,
          ])
        ).rowCount,
        0,
      );
      await assert.rejects(
        c.query('UPDATE fitquest.profiles SET user_id=$1 WHERE user_id=$2', [
          bob.userId,
          alice.userId,
        ]),
        { code: '42501' },
      );
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const permissions = await owner.query(
        "SELECT has_schema_privilege($1,'fitquest','USAGE') AS schema, has_table_privilege($1,'fitquest.profiles','SELECT') AS read, has_table_privilege($1,'fitquest.profiles','INSERT') AS write",
        [role],
      );
      assert.deepEqual(permissions.rows[0], { schema: false, read: false, write: false });
      assert.equal(
        (
          await owner.query(
            "SELECT has_function_privilege($1,'fitquest.session_active(uuid,uuid)','EXECUTE') AS allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    }
    // Deliberately fail at COMMIT, after the SQL write ran. The old row must survive.
    await owner.query(`CREATE FUNCTION fitquest.fail_test_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic deferred write failure'; END $$;
    CREATE CONSTRAINT TRIGGER fail_test_commit AFTER INSERT OR UPDATE ON fitquest.profiles
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.first_name='AbortExample')
    EXECUTE FUNCTION fitquest.fail_test_commit();`);
    const app = buildApp(false, {
      store: durable,
      verifyAccount: async (token) => (token === 'alice' ? alice : null),
    });
    t.after(() => app.close());
    const failure = await app.inject({
      method: 'POST',
      url: '/profile-intake',
      headers: { authorization: 'Bearer alice' },
      payload: { ...input, firstName: 'AbortExample' },
    });
    assert.equal(failure.statusCode, 503);
    assert.equal(failure.body.includes('User Data Saved'), false);
    assert.deepEqual(await durable.read(alice), saved);
    await owner.query('DELETE FROM auth.sessions WHERE id=$1', [alice.sessionId]);
    assert.equal(await durable.sessionActive(alice), false);
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/profile',
          headers: { authorization: 'Bearer alice' },
        })
      ).statusCode,
      401,
    );
    await owner.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1", [
      bob.sessionId,
    ]);
    assert.equal(await durable.sessionActive(bob), false);

    // The complete reset removes accounts/tokens and rebuilds a private empty baseline.
    await owner.query('DROP TRIGGER fail_test_commit ON fitquest.profiles');
    await owner.query('DROP FUNCTION fitquest.fail_test_commit()');
    await owner.query('INSERT INTO auth.identities VALUES ($1,$2)', [
      alice.sessionId,
      alice.userId,
    ]);
    await owner.query("INSERT INTO auth.refresh_tokens VALUES ('detached-old-token',NULL)");
    await owner.query("INSERT INTO auth.flow_state VALUES ('old-flow')");
    await owner.query("INSERT INTO auth.audit_log_entries VALUES ('old-audit')");
    await owner.query("INSERT INTO supabase_migrations.schema_migrations VALUES ('old-ledger')");
    const managedObjects = (
      await owner.query(`SELECT 'auth.users'::regclass::oid AS users,
    'auth.sessions'::regclass::oid AS sessions, 'storage.objects'::regclass::oid AS objects`)
    ).rows[0];
    const oldProfileOid = (
      await owner.query("SELECT 'fitquest.profiles'::regclass::oid AS profile")
    ).rows[0].profile;
    // RESTRICT rolls back any partial reset when an unexpected schema object exists.
    await owner.query('CREATE TABLE fitquest.unexpected_dependency (id int)');
    await owner.query('BEGIN');
    await assert.rejects(owner.query(baseline), { code: '2BP01' });
    await owner.query('ROLLBACK');
    assert.equal((await owner.query('SELECT FROM fitquest.profiles')).rowCount, 2);
    assert.equal((await owner.query('SELECT FROM auth.users')).rowCount, 2);
    await owner.query('DROP TABLE fitquest.unexpected_dependency');
    await owner.query('DROP FUNCTION fitquest.profile_age(integer,date,date)');
    await owner.query('BEGIN');
    await owner.query(baseline);
    await owner.query('COMMIT');
    for (const table of [
      'auth.users',
      'auth.identities',
      'auth.sessions',
      'auth.refresh_tokens',
      'auth.flow_state',
      'auth.audit_log_entries',
      'fitquest.profiles',
      'supabase_migrations.schema_migrations',
    ]) {
      assert.equal((await owner.query(`SELECT FROM ${table}`)).rowCount, 0);
    }
    assert.equal(
      (await owner.query("SELECT FROM pg_policies WHERE schemaname='storage'")).rowCount,
      0,
    );
    assert.notEqual(
      (await owner.query("SELECT 'fitquest.profiles'::regclass::oid AS profile")).rows[0].profile,
      oldProfileOid,
    );
    assert.deepEqual(
      (
        await owner.query(`SELECT 'auth.users'::regclass::oid AS users,
    'auth.sessions'::regclass::oid AS sessions, 'storage.objects'::regclass::oid AS objects`)
      ).rows[0],
      managedObjects,
    );
    assert.equal(await durable.sessionActive(alice), false);
    const casey = {
      userId: '33333333-3333-4333-8333-333333333333',
      sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    };
    await owner.query('INSERT INTO auth.users VALUES ($1)', [casey.userId]);
    await owner.query('INSERT INTO auth.sessions VALUES ($1,$2,NULL)', [
      casey.sessionId,
      casey.userId,
    ]);
    await owner.query(
      "INSERT INTO fitquest.profiles(user_id,first_name,last_name,height_inches,age,weight_lb,gender) VALUES($1,'Alex','Example',68,29,155.5,'Prefer not to say')",
      [casey.userId],
    );
    const beforeBirthday = (
      await owner.query('SELECT to_jsonb(p) AS data FROM fitquest.profiles p ORDER BY user_id')
    ).rows.map((row) => row.data);
    await owner.query('BEGIN');
    await owner.query(
      await readFile(
        new URL(
          '../../../../database/migrations/20261010190000_profile_birthday.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await owner.query('COMMIT');
    const afterBirthday = (
      await owner.query(
        "SELECT to_jsonb(p)-'birthday' AS data FROM fitquest.profiles p ORDER BY user_id",
      )
    ).rows.map((row) => row.data);
    assert.deepEqual(afterBirthday, JSON.parse(JSON.stringify(beforeBirthday)));
    assert.equal((await durable.read(casey))?.gender, 'Prefer not to say');
    assert.equal((await durable.read(casey))?.birthday, undefined);
    await durable.save(casey, input);
    assert.equal((await durable.read(casey))?.firstName, 'Alex');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(
        (
          await owner.query(
            "SELECT has_table_privilege($1,'fitquest.profiles','SELECT') AS allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    }
    assert.deepEqual(
      (
        await owner.query(
          "SELECT relrowsecurity AS rls,relforcerowsecurity AS forced FROM pg_class WHERE oid='fitquest.profiles'::regclass",
        )
      ).rows[0],
      { rls: true, forced: true },
    );
    await verifyOnboardingDatabase(t, owner, reopened, durable);
    await t.test(
      'birthday persistence, age boundaries and legacy writes preserve isolation and grants',
      async () => {
        const { birthdayAge } = await import('../../shared/profileBirthday.js');
        const birthday = '2000-02-29';
        const next = { ...input, birthday, age: birthdayAge(birthday)! };
        await durable.save(casey, next);
        const read = await durable.read(casey);
        assert.equal(read?.birthday, birthday);
        assert.equal(read?.age, birthdayAge(birthday));
        // An old client's age-only save must not erase an actual recorded birthday.
        await durable.save(casey, { ...input, age: 40 });
        assert.equal((await durable.read(casey))?.birthday, birthday);
        assert.equal((await durable.read(casey))?.age, birthdayAge(birthday));
        const ages = await owner.query(
          "SELECT fitquest.profile_age(30,NULL,DATE '2025-02-28') AS legacy,fitquest.profile_age(30,DATE '2000-02-29',DATE '2025-02-28') AS before,fitquest.profile_age(30,DATE '2000-02-29',DATE '2025-03-01') AS after",
        );
        assert.deepEqual(ages.rows[0], { legacy: 30, before: 24, after: 25 });
        for (const role of ['anon', 'authenticated', 'service_role'])
          assert.equal(
            (
              await owner.query(
                "SELECT has_function_privilege($1,'fitquest.profile_age(integer,date,date)','EXECUTE') AS allowed",
                [role],
              )
            ).rows[0].allowed,
            false,
          );
        assert.equal(
          (
            await owner.query(
              "SELECT has_function_privilege('fitquest_app','fitquest.profile_age(integer,date,date)','EXECUTE') AS allowed",
            )
          ).rows[0].allowed,
          true,
        );
        const isolated = {
          userId: '99999999-9999-4999-8999-999999999999',
          sessionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        };
        await owner.query('INSERT INTO auth.users(id) VALUES($1)', [isolated.userId]);
        await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
          isolated.sessionId,
          isolated.userId,
        ]);
        assert.equal(await durable.read(isolated), null);
      },
    );
  },
);
