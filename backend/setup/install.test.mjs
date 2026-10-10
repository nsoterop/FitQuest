import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { installFresh } from './install.mjs';

const testUrl = process.env.FITQUEST_TEST_DATABASE_URL;
test(
  'safe fresh install matches legacy schema and preserves managed records',
  { skip: !testUrl },
  async (t) => {
    const url = new URL(testUrl);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.port, '55432');
    const admin = new pg.Client({ connectionString: testUrl });
    await admin.connect();
    assert.equal(
      (await admin.query("SELECT FROM pg_roles WHERE rolname='fitquest_app'")).rowCount,
      0,
      'Use a dedicated disposable cluster with no app role',
    );
    const databases = [];
    t.after(async () => {
      for (const { name, client } of databases) {
        await client.end();
        await admin.query(`DROP DATABASE ${name}`);
      }
      await admin.query('DROP ROLE IF EXISTS fitquest_app');
      await admin.end();
    });
    for (const mode of ['fresh', 'legacy']) {
      const name = `fitquest_install_${mode}_${process.pid}`;
      await admin.query(`CREATE DATABASE ${name}`);
      url.pathname = '/' + name;
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      databases.push({ name, client });
      await client.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
      CREATE TABLE auth.refresh_tokens(id text); CREATE TABLE auth.flow_state(id text);
      CREATE TABLE auth.audit_log_entries(id text); CREATE SCHEMA storage;
      CREATE TABLE storage.objects(id text); CREATE POLICY retained ON storage.objects USING(true);
      CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
      INSERT INTO supabase_migrations.schema_migrations VALUES('unrelated-record');
      INSERT INTO auth.users VALUES('11111111-1111-4111-8111-111111111111');
      INSERT INTO auth.sessions VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',NULL);
      INSERT INTO auth.refresh_tokens VALUES('synthetic'); INSERT INTO auth.flow_state VALUES('synthetic');
      INSERT INTO auth.audit_log_entries VALUES('synthetic'); INSERT INTO storage.objects VALUES('synthetic');
      DO $$ BEGIN
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      END $$;`);
    }
    const fresh = databases[0].client,
      legacy = databases[1].client;
    await t.test('mid-install failure rolls back schema, role and ledger changes', async () => {
      await fresh.query(`CREATE FUNCTION public.fail_install() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.version='20261003214718' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_install BEFORE INSERT ON supabase_migrations.schema_migrations FOR EACH ROW EXECUTE FUNCTION public.fail_install()`);
      await assert.rejects(installFresh(fresh), /synthetic failure/);
      assert.equal(
        (await fresh.query("SELECT FROM pg_namespace WHERE nspname='fitquest'")).rowCount,
        0,
      );
      assert.equal(
        (await fresh.query('SELECT FROM supabase_migrations.schema_migrations')).rowCount,
        1,
      );
      assert.equal(
        (await admin.query("SELECT FROM pg_roles WHERE rolname='fitquest_app'")).rowCount,
        0,
      );
      await fresh.query(
        'DROP TRIGGER fail_install ON supabase_migrations.schema_migrations; DROP FUNCTION public.fail_install()',
      );
    });
    await t.test('existing checkpoint refuses even when app schema is absent', async () => {
      await fresh.query(
        "INSERT INTO supabase_migrations.schema_migrations VALUES('20261002233706')",
      );
      await assert.rejects(installFresh(fresh), /checkpoint already recorded/);
      await fresh.query(
        "DELETE FROM supabase_migrations.schema_migrations WHERE version='20261002233706'",
      );
    });
    await installFresh(fresh);
    await t.test('all managed synthetic rows and policies survive; rerun refuses', async () => {
      for (const name of [
        'auth.users',
        'auth.sessions',
        'auth.refresh_tokens',
        'auth.flow_state',
        'auth.audit_log_entries',
        'storage.objects',
      ])
        assert.equal((await fresh.query(`SELECT FROM ${name}`)).rowCount, 1, name);
      assert.equal(
        (
          await fresh.query(
            "SELECT FROM pg_policies WHERE schemaname='storage' AND policyname='retained'",
          )
        ).rowCount,
        1,
      );
      assert.equal(
        (await fresh.query('SELECT FROM supabase_migrations.schema_migrations')).rowCount,
        21,
      );
      assert.deepEqual(
        (
          await fresh.query(
            'SELECT app_enabled,spent_micro::text,reserved_micro::text FROM fitquest.ai_budget',
          )
        ).rows,
        [{ app_enabled: false, spent_micro: '0', reserved_micro: '0' }],
      );
      await assert.rejects(installFresh(fresh), /no existing FitQuest schema/);
      assert.equal((await fresh.query('SELECT FROM auth.users')).rowCount, 1);
    });
    const manifest = JSON.parse(
      await readFile(new URL('./manifest.json', import.meta.url), 'utf8'),
    );
    await legacy.query('BEGIN');
    for (const { file } of manifest)
      await legacy.query(
        await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'),
      );
    await legacy.query('COMMIT');
    await t.test(
      'complete fresh schema, policies, functions and grants match legacy migrations',
      async () => {
        const dumps = databases.map(({ name }) =>
          execFileSync(
            'pg_dump',
            [
              '--schema-only',
              '--schema=fitquest',
              '--no-owner',
              '--host=127.0.0.1',
              '--port=55432',
              `--username=${url.username}`,
              name,
            ],
            { encoding: 'utf8' },
          ).replace(/^\\(?:un)?restrict .*$/gm, ''),
        );
        assert.equal(dumps[0], dumps[1]);
      },
    );
  },
);
