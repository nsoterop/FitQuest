// Single-user mode bypasses RLS; use the integration fixture for runtime enforcement.
// Finite offline PostgreSQL execution: no listener, daemon, port or dev-server lifecycle.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordPlanDiagnostic } from '../dist-test/planDiagnosticStore.js';
const dir = mkdtempSync(join(tmpdir(), 'fitquest-diagnostic-sql-'));
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222',
  plan = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const literal = (v) =>
  v === null
    ? 'NULL'
    : "'" + (typeof v === 'object' ? JSON.stringify(v) : String(v)).replaceAll("'", "''") + "'";
const statements = [];
const add = (s) => statements.push(s);
const check = (condition, label) =>
  add(`DO $$ BEGIN IF NOT (${condition}) THEN RAISE EXCEPTION '${label}'; END IF; END $$`);
async function record(
  user,
  n,
  diagnostic = {
    stage: 'catalog',
    rule: 'tracking',
    day: 0,
    session: 1,
    block: 0,
    exercise: 0,
    activityId: 'FQ-ACT-00167',
    actualKind: 'repetitions',
    allowedKinds: ['duration', 'count'],
  },
) {
  const pool = {
    connect: async () => ({
      query: async (sql, values = []) => {
        add(sql.replace(/\$(\d+)/g, (_, n) => literal(values[Number(n) - 1])));
        return { rows: [] };
      },
      release() {},
    }),
  };
  await recordPlanDiagnostic(
    pool,
    { userId: user, sessionId: id(100) },
    { attempt: id(n), planId: plan },
    diagnostic,
  );
}
try {
  const init = spawnSync(
    'initdb',
    ['-D', dir, '-U', 'diagnostics_admin', '-A', 'trust', '--no-locale'],
    { encoding: 'utf8' },
  );
  assert.equal(init.status, 0, init.stderr);
  add(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE fitquest_app; CREATE SCHEMA fitquest; GRANT USAGE ON SCHEMA fitquest TO fitquest_app;
 CREATE TABLE fitquest.onboarding_attempts(user_id uuid,id uuid,provider_diagnostic jsonb,actual_micro bigint,PRIMARY KEY(user_id,id));
 CREATE TABLE fitquest.training_plans(user_id uuid,id uuid,PRIMARY KEY(user_id,id));
 INSERT INTO fitquest.training_plans VALUES('${a}','${plan}'),('${b}','${plan}');
 INSERT INTO fitquest.onboarding_attempts SELECT u::uuid,('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'{"httpStatus":200,"requestId":"req_synthetic"}',10 FROM unnest(ARRAY['${a}','${b}']) u CROSS JOIN generate_series(1,56) n;`);
  add('BEGIN');
  add(
    readFileSync(
      new URL(
        '../supabase/migrations/20261007180022_plan_validation_diagnostics.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  add('COMMIT');
  check(
    "(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='fitquest.plan_validation_diagnostics'::regclass)",
    'RLS not forced',
  );
  for (const role of ['anon', 'authenticated', 'service_role'])
    check(
      `NOT has_table_privilege('${role}','fitquest.plan_validation_diagnostics','SELECT,INSERT,UPDATE,DELETE')`,
      'public grant',
    );
  add('SET ROLE fitquest_app');
  await record(b, 1);
  await record(a, 1);
  await record(a, 2, {
    stage: 'conversion',
    rule: 'pair',
    day: 1,
    session: 0,
    block: 0,
    recovery: true,
  });
  add(`SELECT set_config('fitquest.user_id','${a}',false)`);
  check(
    `(SELECT count(*) FROM fitquest.plan_validation_diagnostics WHERE user_id='${a}')=2`,
    'retry record lost',
  );
  check(
    `(SELECT count(*) FROM fitquest.plan_validation_diagnostics WHERE user_id='${a}' AND attempt_id='${id(1)}' AND diagnostic->>'rule'='tracking')=1`,
    'original failure lost',
  );
  for (let n = 3; n <= 54; n++) await record(a, n);
  check(
    `(SELECT count(*) FROM fitquest.plan_validation_diagnostics WHERE user_id='${a}')=50`,
    'retention cap failed',
  );
  add('RESET ROLE');
  add(
    `UPDATE fitquest.plan_validation_diagnostics SET created_at=now()-interval '15 days',expires_at=now()-interval '1 day' WHERE user_id='${a}' AND attempt_id='${id(54)}'`,
  );
  add('SET ROLE fitquest_app');
  await record(a, 55);
  check(
    `NOT EXISTS(SELECT FROM fitquest.plan_validation_diagnostics WHERE attempt_id='${id(54)}')`,
    'expired record not purged',
  );
  add(
    `DO $$ BEGIN BEGIN INSERT INTO fitquest.plan_validation_diagnostics(user_id,attempt_id,plan_id,diagnostic,catalog_version,schema_version) VALUES('${a}','${id(56)}','${plan}','{"version":1,"stage":"schema","rule":"shape","secret":"must-not-persist"}','synthetic','complete-week-v1'); RAISE EXCEPTION 'hostile diagnostic accepted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$`,
  );
  add('RESET ROLE');
  check(
    `(SELECT count(*) FROM fitquest.plan_validation_diagnostics WHERE user_id='${b}')=1`,
    'other owner lost',
  );
  check(
    `(SELECT count(*) FROM fitquest.plan_validation_diagnostics d JOIN fitquest.onboarding_attempts a ON a.user_id=d.user_id AND a.id=d.attempt_id WHERE a.provider_diagnostic->>'requestId'='req_synthetic')=51`,
    'provider correlation lost',
  );
  check(
    '(SELECT count(*) FROM fitquest.onboarding_attempts WHERE actual_micro=10)=112',
    'accounting altered',
  );
  add(`DELETE FROM fitquest.training_plans WHERE user_id='${a}'`);
  check(
    `NOT EXISTS(SELECT FROM fitquest.plan_validation_diagnostics WHERE user_id='${a}')`,
    'scoped content cleanup failed',
  );
  check(
    `(SELECT count(*) FROM fitquest.plan_validation_diagnostics WHERE user_id='${b}')=1 AND (SELECT count(*) FROM fitquest.onboarding_attempts)=112`,
    'cleanup crossed account or ledger',
  );
  add("SELECT 'OFFLINE_DIAGNOSTICS_PASSED'");
  const script =
    statements
      .map(
        (s) =>
          s
            .replace(/--[^\n]*/g, '')
            .trim()
            .replace(/;\s*$/, '') + ';',
      )
      .join('\n\n') + '\n\n';
  const result = spawnSync('postgres', ['--single', '-D', dir, '-j', 'postgres'], {
    input: script,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /ERROR:|FATAL:|PANIC:/, result.stderr);
  assert.match(result.stdout, /OFFLINE_DIAGNOSTICS_PASSED/);
  console.log(
    'Offline PostgreSQL passed: exact migration, RLS/grant configuration (not runtime enforcement), scoped two-owner writes, retry retention, 50-record cap, 14-day opportunistic purge, hostile-key constraint, provider correlation, scoped cascade and 112 unchanged accounting rows. No listener was started.',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
