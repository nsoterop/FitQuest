import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'private-test-artifacts', 'm1b-pg');
const data = path.join(base, 'data');
const socket = path.join(base, 'socket');
const marker = path.join(base, 'TASK_OWNER.json');
const testDatabase = 'fitquest_m1b_synthetic_test';
const owner = { project: 'FitQuest', purpose: 'M1b disposable local PostgreSQL', version: 1 };
const action = process.argv[2];
if (!['start', 'stop', 'verify', 'status'].includes(action)) throw new Error('Use start, stop, verify, or status');
if (process.env.DATABASE_URL) throw new Error('DATABASE_URL is not accepted');

function run(bin, args) { return execFileSync(bin, args, { stdio: 'pipe', encoding: 'utf8' }); }
function checkPath(value) {
  if (!existsSync(value) || lstatSync(value).isSymbolicLink() || realpathSync(value) !== value || lstatSync(value).uid !== process.getuid()) throw new Error('Unexpected M1b path');
}
function localFiles() {
  for (const value of [base, data, socket, marker]) checkPath(value);
  if (existsSync(path.join(base, 'postgres.log'))) checkPath(path.join(base, 'postgres.log'));
  if (JSON.stringify(JSON.parse(readFileSync(marker, 'utf8'))) !== JSON.stringify(owner)) throw new Error('M1b ownership marker mismatch');
  if (readFileSync(path.join(data, 'PG_VERSION'), 'utf8').trim() !== '17') throw new Error('Unexpected M1b PostgreSQL data version');
}
function running() { try { run('pg_ctl', ['-D', data, 'status']); return true; } catch { return false; } }
async function verify() {
  localFiles();
  if (!running()) throw new Error('M1b cluster is stopped');
  const c = new pg.Client({ host: socket, port: 55439, user: os.userInfo().username, database: testDatabase, connectionTimeoutMillis: 3000 });
  await c.connect();
  try {
    const row = (await c.query("SELECT current_database() AS db,current_setting('data_directory') AS dir,inet_server_addr() AS tcp,(SELECT value FROM m1b.meta WHERE key='owner') AS marker")).rows[0];
    if (row.db !== testDatabase || path.resolve(row.dir) !== data || row.tcp !== null || row.marker !== 'FitQuest M1b disposable synthetic') throw new Error('Unexpected M1b regression database');
    const ledger = (await c.query('SELECT version,checksum FROM m1b.migrations ORDER BY version')).rows;
    if (ledger.length !== 2) throw new Error('Unexpected M1b regression ledger');
    for (let i = 0; i < 2; i++) {
      const file = path.join(root, 'services/api/migrations', `${String(i + 1).padStart(3, '0')}_${i === 0 ? 'local_sync' : 'local_marker_read'}.sql`);
      if (ledger[i].version !== i + 1 || ledger[i].checksum !== createHash('sha256').update(readFileSync(file)).digest('hex')) throw new Error('Changed M1b regression ledger');
    }
  } finally { await c.end(); }
}

localFiles();
if (action === 'start') {
  if (!running()) {
    if (readdirSync(socket).length) throw new Error('M1b socket directory occupied');
    run('pg_ctl', ['-D', data, '-l', path.join(base, 'postgres.log'), '-o', `-c listen_addresses='' -c unix_socket_directories='${socket}' -p 55439`, 'start']);
  }
  await verify();
  process.stdout.write('M1b regression database verified without migrations or seeds.\n');
} else if (action === 'stop') {
  if (running()) { await verify(); run('pg_ctl', ['-D', data, 'stop', '-m', 'fast']); }
  process.stdout.write('M1b PostgreSQL stopped; retained data unchanged by startup.\n');
} else if (action === 'verify') {
  await verify(); process.stdout.write('M1b regression database verified read-only.\n');
} else {
  if (running()) await verify();
  process.stdout.write(`M1b PostgreSQL ${running() ? 'running' : 'stopped'}.\n`);
}
