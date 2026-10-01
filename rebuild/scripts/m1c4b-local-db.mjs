import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { assertTargetIdentity, assertDatabaseEvidence, base, data, socket, marker, database, port, owner, databaseMarker, migrations, roles, assertPath, assertFilesystem, preflight, readEvidence } from './m1c4b-preflight.mjs';
const action = process.argv[2];
if (!['setup', 'start', 'stop', 'verify', 'status'].includes(action)) throw new Error('Use setup, start, stop, verify, or status');
if (process.env.DATABASE_URL) throw new Error('DATABASE_URL is not accepted by this guarded local task');

function run(bin, args) { return execFileSync(bin, args, { stdio: 'pipe', encoding: 'utf8' }); }
function assertNoPortConflict() {
  for (const [bin,args] of [['lsof',['-nP',`-iTCP:${port}`]],['pgrep',['-fl',`postgres.*${port}`]]]) {
    try { if (run(bin,args).trim()) throw new Error('M1c.4b proposed port/process is occupied'); }
    catch (error) { if (error.status !== 1) throw error; }
  }
}
function assertMarker() { assertFilesystem(); }
function running() {
  try { run('pg_ctl', ['-D', data, 'status']); return true; } catch { return false; }
}
async function client(name) {
  const c = new pg.Client({ host: socket, port, database: name, user: os.userInfo().username, connectionTimeoutMillis: 3000 });
  await c.connect();
  try {
    const row = (await c.query("SELECT current_database() AS db, current_setting('data_directory') AS dir, current_setting('port')::int AS port, inet_server_addr() AS tcp,current_setting('listen_addresses') AS listeners,current_setting('unix_socket_directories') AS sockets")).rows[0];
    assertTargetIdentity(row, name);
    return c;
  } catch (error) { await c.end(); throw error; }
}
async function assertDatabase(c, allowFresh = false) {
  return assertDatabaseEvidence(await readEvidence(c), allowFresh);
}
async function verify() {
  assertMarker();
  if (!running()) throw new Error('M1c.4b cluster is stopped');
  const c = await client(database);
  try { await preflight(c); } finally { await c.end(); }
}

if (action === 'setup') {
  if (existsSync(base)) { assertMarker(); }
  else {
    assertNoPortConflict();
    assertPath(path.dirname(base));
    mkdirSync(base, { mode: 0o700 });
    writeFileSync(marker, JSON.stringify(owner), { mode: 0o600 });
    mkdirSync(socket, { recursive: true, mode: 0o700 });
    run('initdb', ['-D', data, '--auth-local=trust', '--auth-host=reject', '--no-instructions']);
  }
  assertMarker();
} else assertMarker();

if (action === 'stop') {
  if (running()) { await verify(); run('pg_ctl', ['-D', data, 'stop', '-m', 'fast']); }
  process.stdout.write('M1c.4b local PostgreSQL stopped; data retained.\n');
} else if (action === 'status') {
  if (running()) await verify();
  process.stdout.write(`M1c.4b local PostgreSQL ${running() ? 'running' : 'stopped'}.\n`);
} else {
  if (!running()) {
    if (!existsSync(data)) throw new Error('Run setup before start');
    assertNoPortConflict();
    if (readdirSync(socket).length) throw new Error('M1c.4b socket directory is occupied');
    run('pg_ctl', ['-D', data, '-l', path.join(base, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -p ${port}`, 'start']);
  }
  if (action === 'setup') {
    const bootstrap = await client('postgres');
    try {
      const databases = (await bootstrap.query('SELECT datname FROM pg_database')).rows;
      if (databases.some(row => !['postgres','template0','template1',database].includes(row.datname))) throw new Error('Unknown cluster database');
      // Validate existing database evidence BEFORE bootstrap mutates roles or databases.
      if (databases.some(row => row.datname === database)) {
        const existing=await client(database);
        try {
          const ledger=await assertDatabase(existing,true);
          if (ledger.length===migrations.length) await preflight(existing);
        } finally {await existing.end();}
      }
      const existingRoles=(await bootstrap.query('SELECT rolname,rolsuper,rolbypassrls,rolinherit,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=ANY($1)',[roles])).rows;
      if (existingRoles.some(row => row.rolsuper || row.rolbypassrls || row.rolinherit || row.rolcreatedb || row.rolcreaterole)) throw new Error('Unsafe existing runtime role');
      if ((await bootstrap.query('SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=ANY($1)',[roles])).rows.length) throw new Error('Unexpected runtime membership');
      for (const role of roles) {
        const found = await bootstrap.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
        if (!found.rows.length) await bootstrap.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT`);
        const safety = (await bootstrap.query('SELECT rolsuper,rolbypassrls,rolinherit,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',[role])).rows[0];
        if (Object.values(safety).some(Boolean)) throw new Error('Unsafe existing runtime role');
      }
      const found = await bootstrap.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
      if (!found.rows.length) await bootstrap.query(`CREATE DATABASE ${database}`);
    } finally { await bootstrap.end(); }
    const c = await client(database);
    try {
      const ledger = await assertDatabase(c, true);
      if (ledger.length === migrations.length) await preflight(c);
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
  process.stdout.write('M1c.4b isolated local PostgreSQL target and seven migrations verified.\n');
}
