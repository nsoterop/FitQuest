import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { assertOwnerMarker, assertTargetIdentity, assertDatabaseEvidence, base, data, socket, marker, database, port, owner, databaseMarker, migrations } from './m1c3-preflight.mjs';
const action = process.argv[2];
if (!['setup', 'start', 'stop', 'verify', 'status'].includes(action)) throw new Error('Use setup, start, stop, verify, or status');
if (process.env.DATABASE_URL) throw new Error('DATABASE_URL is not accepted by this guarded local task');

function run(bin, args) { return execFileSync(bin, args, { stdio: 'pipe', encoding: 'utf8' }); }
function assertPath(target) {
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || realpathSync(target) !== target || lstatSync(target).uid !== process.getuid()) throw new Error('Unowned or redirected M1c.3 path');
}
function assertMarker() {
  assertPath(base); assertPath(marker);
  assertOwnerMarker(JSON.parse(readFileSync(marker, 'utf8')));
  for (const entry of readdirSync(base)) if (!['TASK_OWNER.json', 'data', 'socket', 'postgres.log'].includes(entry)) throw new Error('Unknown M1c.3 cluster file');
  if (existsSync(path.join(base, 'postgres.log'))) assertPath(path.join(base, 'postgres.log'));
  if (existsSync(data)) {
    assertPath(data);
    if (readFileSync(path.join(data, 'PG_VERSION'), 'utf8').trim() !== '17') throw new Error('Unexpected PostgreSQL data version');
  }
  if (existsSync(socket)) assertPath(socket);
}
function running() {
  try { run('pg_ctl', ['-D', data, 'status']); return true; } catch { return false; }
}
async function client(name) {
  const c = new pg.Client({ host: socket, port, database: name, user: os.userInfo().username, connectionTimeoutMillis: 3000 });
  await c.connect();
  try {
    const row = (await c.query("SELECT current_database() AS db, current_setting('data_directory') AS dir, current_setting('port')::int AS port, inet_server_addr() AS tcp")).rows[0];
    assertTargetIdentity(row, name);
    return c;
  } catch (error) { await c.end(); throw error; }
}
async function assertDatabase(c, allowFresh = false) {
  const schemas = (await c.query("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname")).rows.map(row => row.nspname);
  const publicTables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(row => row.tablename);
  const tables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='m1b'")).rows.map(row => row.tablename);
  const markerRow = schemas.includes('m1b') ? await c.query("SELECT value FROM m1b.meta WHERE key='owner'") : { rows: [] };
  const ledger = schemas.includes('m1b') ? (await c.query('SELECT version,checksum FROM m1b.migrations ORDER BY version')).rows : [];
  return assertDatabaseEvidence({ schemas, publicTables, tables, markerValue: markerRow.rows[0]?.value, ledger }, allowFresh);
}
async function verify() {
  assertMarker();
  if (!running()) throw new Error('M1c.3 cluster is stopped');
  const c = await client(database);
  try {
    const ledger = await assertDatabase(c);
    if (ledger.length !== 4) throw new Error('M1c.3 migrations incomplete');
    const roles = await c.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('fitquest_m1b_api','fitquest_m1c3_api','fitquest_m1c3_lookup')");
    if (roles.rows.length !== 3 || roles.rows.some(row => row.rolsuper || row.rolbypassrls)) throw new Error('Unsafe or missing runtime role');
  } finally { await c.end(); }
}

if (action === 'setup') {
  if (existsSync(base)) { assertMarker(); if (!existsSync(data)) throw new Error('Marked cluster data is missing; refusing reinitialization'); }
  else {
    mkdirSync(base, { recursive: true, mode: 0o700 });
    writeFileSync(marker, JSON.stringify(owner), { mode: 0o600 });
    mkdirSync(socket, { recursive: true, mode: 0o700 });
    run('initdb', ['-D', data, '--auth-local=trust', '--auth-host=reject', '--no-instructions']);
  }
  assertMarker();
} else assertMarker();

if (action === 'stop') {
  if (running()) { await verify(); run('pg_ctl', ['-D', data, 'stop', '-m', 'fast']); }
  process.stdout.write('M1c.3 local PostgreSQL stopped; data retained.\n');
} else if (action === 'status') {
  if (running()) await verify();
  process.stdout.write(`M1c.3 local PostgreSQL ${running() ? 'running' : 'stopped'}.\n`);
} else {
  if (!running()) {
    if (!existsSync(data)) throw new Error('Run setup before start');
    if (readdirSync(socket).length) throw new Error('M1c.3 socket directory is occupied');
    run('pg_ctl', ['-D', data, '-l', path.join(base, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -p ${port}`, 'start']);
  }
  if (action === 'setup') {
    const bootstrap = await client('postgres');
    try {
      for (const role of ['fitquest_m1b_api', 'fitquest_m1c3_api', 'fitquest_m1c3_lookup']) {
        const found = await bootstrap.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
        if (!found.rows.length) await bootstrap.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`);
      }
      const found = await bootstrap.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
      if (!found.rows.length) await bootstrap.query(`CREATE DATABASE ${database}`);
    } finally { await bootstrap.end(); }
    const c = await client(database);
    try {
      const ledger = await assertDatabase(c, true);
      for (const migration of migrations.slice(ledger.length)) {
        const sql = readFileSync(migration.file, 'utf8');
        await c.query('BEGIN');
        try {
          await c.query(sql);
          if (migration.version === 1) await c.query('INSERT INTO m1b.meta(key,value) VALUES($1,$2)', ['owner', databaseMarker]);
          await c.query('INSERT INTO m1b.migrations(version,checksum) VALUES($1,$2)', [migration.version, createHash('sha256').update(sql).digest('hex')]);
          await c.query('COMMIT');
        } catch (error) { await c.query('ROLLBACK'); throw error; }
      }
    } finally { await c.end(); }
  }
  await verify();
  process.stdout.write('M1c.3 isolated local PostgreSQL target and four migrations verified.\n');
}
