import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'private-test-artifacts', 'm1b-pg');
const data = path.join(base, 'data');
const socket = path.join(base, 'socket');
const marker = path.join(base, 'TASK_OWNER.json');
const authorityFile = path.join(root, 'private-test-artifacts', 'm1b-fixture-authority.json');
const owner = { project: 'FitQuest', purpose: 'M1b disposable local PostgreSQL', version: 1 };
const port = 55439;
const databases = ['fitquest_m1b_synthetic', 'fitquest_m1b_synthetic_test'];
const accounts = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const migrations = [
  { version: 1, file: path.join(root, 'services/api/migrations/001_local_sync.sql') },
  { version: 2, file: path.join(root, 'services/api/migrations/002_local_marker_read.sql') },
];

function assertMarker() {
  if (!existsSync(marker) || JSON.stringify(JSON.parse(readFileSync(marker, 'utf8'))) !== JSON.stringify(owner)) {
    throw new Error('M1b task ownership marker missing or changed; refusing database action');
  }
}
function run(bin, args) { execFileSync(bin, args, { stdio: 'pipe' }); }
function running() {
  try { run('pg_ctl', ['-D', data, 'status']); return true; } catch { return false; }
}
async function client(database, user = os.userInfo().username) {
  const c = new pg.Client({ host: socket, port, database, user, connectionTimeoutMillis: 3000 });
  await c.connect();
  const identity = await c.query('SELECT current_database() AS database, current_setting($1) AS data_directory, inet_server_addr() AS tcp_address', ['data_directory']);
  if (identity.rows[0]?.database !== database || path.resolve(identity.rows[0]?.data_directory ?? '') !== data || identity.rows[0]?.tcp_address !== null) {
    await c.end(); throw new Error('Unexpected PostgreSQL target; refusing database action');
  }
  return c;
}
async function migrate(database) {
  assertMarker();
  if (!databases.includes(database)) throw new Error('Unowned database name');
  const c = await client(database);
  try {
    const present = await c.query("SELECT to_regclass('m1b.meta') AS marker");
    if (present.rows[0]?.marker) {
      const meta = await c.query("SELECT value FROM m1b.meta WHERE key='owner'");
      if (meta.rows[0]?.value !== 'FitQuest M1b disposable synthetic') throw new Error('Database owner marker mismatch');
    }
    for (const migration of migrations) {
      const sql = readFileSync(migration.file, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = present.rows[0]?.marker ? await c.query('SELECT checksum FROM m1b.migrations WHERE version=$1', [migration.version]) : { rows: [] };
      if (prior.rows.length) { if (prior.rows[0].checksum !== checksum) throw new Error('Migration checksum changed'); continue; }
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query("INSERT INTO m1b.meta(key,value) VALUES('owner','FitQuest M1b disposable synthetic') ON CONFLICT(key) DO NOTHING");
        await c.query('INSERT INTO m1b.migrations(version,checksum) VALUES($1,$2)', [migration.version, checksum]);
        await c.query('COMMIT');
      } catch (error) { await c.query('ROLLBACK'); throw error; }
    }
    for (const id of accounts) await c.query("INSERT INTO m1b.accounts(account_id,environment) VALUES($1,'m1b.synthetic.local.v1') ON CONFLICT(account_id) DO NOTHING", [id]);
    const ledger = await c.query('SELECT version,checksum FROM m1b.migrations ORDER BY version');
    if (ledger.rows.length !== migrations.length) throw new Error('Unexpected migration ledger');
    const role = await c.query("SELECT 1 FROM pg_roles WHERE rolname='fitquest_m1b_api'");
    if (role.rows.length !== 1) throw new Error('API role absent');
  } finally { await c.end(); }
}

const action = process.argv[2];
if (!['setup', 'start', 'stop', 'verify', 'status'].includes(action)) throw new Error('Use setup, start, stop, verify, or status');
if (action === 'setup') {
  if (existsSync(base)) assertMarker();
  else { mkdirSync(base, { recursive: true, mode: 0o700 }); writeFileSync(marker, JSON.stringify(owner), { mode: 0o600 }); }
  mkdirSync(socket, { recursive: true, mode: 0o700 });
  if (!existsSync(data)) run('initdb', ['-D', data, '--auth-local=trust', '--auth-host=reject', '--no-instructions']);
}
if (action !== 'setup') assertMarker();
if (action === 'stop') {
  if (running()) run('pg_ctl', ['-D', data, 'stop', '-m', 'fast']);
  process.stdout.write('M1b local PostgreSQL stopped; data retained.\n');
} else if (action === 'status') {
  process.stdout.write(`M1b local PostgreSQL ${running() ? 'running' : 'stopped'}.\n`);
} else {
  if (!running()) {
    if (!existsSync(data)) throw new Error('Run setup before start');
    run('pg_ctl', ['-D', data, '-l', path.join(base, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -p ${port}`, 'start']);
  }
  const bootstrap = await client('postgres');
  try {
    if (action === 'setup') {
      const role = await bootstrap.query("SELECT 1 FROM pg_roles WHERE rolname='fitquest_m1b_api'");
      if (!role.rows.length) await bootstrap.query('CREATE ROLE fitquest_m1b_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT');
      for (const database of databases) {
        const found = await bootstrap.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
        if (!found.rows.length) await bootstrap.query(`CREATE DATABASE ${database}`);
      }
    }
  } finally { await bootstrap.end(); }
  for (const database of databases) await migrate(database);
  if (action === 'setup' && !existsSync(authorityFile)) {
    const authority = { A: randomBytes(32).toString('hex'), B: randomBytes(32).toString('hex') };
    writeFileSync(authorityFile, JSON.stringify(authority), { mode: 0o600 });
  }
  if (!existsSync(authorityFile)) throw new Error('Fixture authority file absent');
  const authority = JSON.parse(readFileSync(authorityFile, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(authority.A) || !/^[a-f0-9]{64}$/.test(authority.B) || authority.A === authority.B) throw new Error('Fixture authority file invalid');
  process.stdout.write(`M1b local PostgreSQL ready; ${databases.length} marked databases verified. Fixture values were not printed.\n`);
}
