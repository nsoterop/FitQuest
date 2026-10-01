import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const base = path.join(root, 'private-test-artifacts', 'm1c4b-pg');
export const data = path.join(base, 'data');
export const socket = path.join(base, 'socket');
export const marker = path.join(base, 'TASK_OWNER.json');
export const database = 'fitquest_m1c4b_exchange_test';
export const port = 55441;
export const owner = { project: 'FitQuest', purpose: 'M1c.4b isolated simulated exchange PostgreSQL', version: 1, database, port };
export const databaseMarker = 'FitQuest M1c4b isolated simulated exchange test';
export const migrations = [1, 2, 3, 4, 5, 6, 7].map(version => ({ version, file: path.join(root, 'services/api/migrations', `${String(version).padStart(3, '0')}_${{ 1: 'local_sync', 2: 'local_marker_read', 3: 'transactional_sessions', 4: 'session_invariants', 5: 'simulated_exchange', 6: 'exchange_argument_guards', 7: 'preauthentication_denial' }[version]}.sql`) }));
const knownTables = new Set(['meta', 'migrations', 'accounts', 'aggregates', 'aggregate_revisions', 'operation_outcomes', 'provider_identities', 'session_families', 'credential_generations', 'revocation_capabilities', 'auth_challenges', 'auth_exchange_attempts']);

export function assertOwnerMarker(value) {
  if (JSON.stringify(value) !== JSON.stringify(owner)) throw new Error('M1c.4b ownership marker missing or changed');
}

export function assertTargetIdentity(row, name) {
  if (row?.db !== name || path.resolve(row?.dir ?? '') !== data || row?.port !== port || row?.tcp !== null || row?.listeners !== '' || row?.sockets !== socket) throw new Error('Unexpected PostgreSQL target');
}

export function assertDatabaseEvidence({ schemas, publicTables, tables, markerValue, ledger }, allowFresh = false) {
  if (schemas.some(name => !['public', 'm1b'].includes(name))) throw new Error('Unknown database schema');
  if (publicTables.length) throw new Error('Unknown public database table');
  const present = schemas.includes('m1b');
  if (!present) {
    if (!allowFresh || schemas.length !== 1 || schemas[0] !== 'public') throw new Error('Database marker absent');
    return [];
  }
  if (tables.some(name => !knownTables.has(name)) || !tables.includes('meta') || !tables.includes('migrations')) throw new Error('Unknown M1c.4b table set');
  if (markerValue !== databaseMarker) throw new Error('Database owner marker mismatch');
  if (ledger.length < 1 || ledger.length > migrations.length) throw new Error('Unexpected migration ledger');
  for (let i = 0; i < ledger.length; i++) {
    const item = migrations[i], checksum = createHash('sha256').update(readFileSync(item.file)).digest('hex');
    if (ledger[i].version !== item.version || ledger[i].checksum !== checksum) throw new Error('Changed or unknown migration ledger');
  }
  if (ledger.length < 3 && tables.some(name => !['meta', 'migrations', 'accounts', 'aggregates', 'aggregate_revisions', 'operation_outcomes'].includes(name))) throw new Error('Unrecorded authentication tables');
  if (ledger.length >= 3 && ['provider_identities', 'session_families', 'credential_generations', 'revocation_capabilities'].some(name => !tables.includes(name))) throw new Error('Missing authentication table');
  const exchangeTables = ['auth_challenges', 'auth_exchange_attempts'];
  if (ledger.length < 5 && exchangeTables.some(name => tables.includes(name))) throw new Error('Unrecorded exchange tables');
  if (ledger.length >= 5 && exchangeTables.some(name => !tables.includes(name))) throw new Error('Missing exchange table');
  const domainTables = ['meta','migrations','accounts','aggregates','aggregate_revisions','operation_outcomes'];
  if (domainTables.some(name => !tables.includes(name))) throw new Error('Missing domain table');
  if (schemas.length !== 2 || !schemas.includes('public')) throw new Error('Unexpected schema set');
  return ledger;
}

export const roles = ['fitquest_m1b_api','fitquest_m1c3_api','fitquest_m1c3_lookup','fitquest_m1c4b_api','fitquest_m1c4b_preauth','fitquest_m1c4b_lookup'];
export function assertPath(target) {
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || realpathSync(target) !== target || lstatSync(target).uid !== process.getuid()) throw new Error('Unowned or redirected M1c.4b path');
}
export function assertFilesystem() {
  if (process.env.DATABASE_URL) throw new Error('DATABASE_URL is not accepted by this guarded local task');
  assertPath(base); assertPath(marker); assertPath(data); assertPath(socket);
  assertOwnerMarker(JSON.parse(readFileSync(marker,'utf8')));
  for (const entry of readdirSync(base)) if (!['TASK_OWNER.json','data','socket','postgres.log'].includes(entry)) throw new Error('Unknown M1c.4b cluster file');
  if (existsSync(path.join(base,'postgres.log'))) assertPath(path.join(base,'postgres.log'));
  assertPath(path.join(data,'PG_VERSION'));
  if (readFileSync(path.join(data,'PG_VERSION'),'utf8').trim() !== '17') throw new Error('Unexpected PostgreSQL data version');
}
export async function readEvidence(c) {
  const schemas = (await c.query("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname")).rows.map(row => row.nspname);
  const publicTables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(row => row.tablename);
  const tables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='m1b'")).rows.map(row => row.tablename);
  const markerValue = schemas.includes('m1b') ? (await c.query("SELECT value FROM m1b.meta WHERE key='owner'")).rows[0]?.value : undefined;
  const ledger = schemas.includes('m1b') ? (await c.query('SELECT version,checksum FROM m1b.migrations ORDER BY version')).rows : [];
  return { schemas,publicTables,tables,markerValue,ledger };
}
export async function preflight(c) {
  assertFilesystem();
  const identity = (await c.query("SELECT current_database() AS db,current_setting('data_directory') AS dir,current_setting('port')::int AS port,inet_server_addr() AS tcp,current_setting('listen_addresses') AS listeners,current_setting('unix_socket_directories') AS sockets")).rows[0];
  assertTargetIdentity(identity,database);
  if (identity.listeners !== '' || identity.sockets !== socket) throw new Error('Unexpected PostgreSQL listeners/socket');
  const ledger = assertDatabaseEvidence(await readEvidence(c));
  if (ledger.length !== migrations.length) throw new Error('M1c.4b migrations incomplete');
  const found = (await c.query('SELECT rolname,rolsuper,rolbypassrls,rolinherit,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=ANY($1)',[roles])).rows;
  if (found.length !== roles.length || found.some(row => row.rolsuper || row.rolbypassrls || row.rolinherit || row.rolcreatedb || row.rolcreaterole)) throw new Error('Unsafe or missing runtime role');
  const members = (await c.query('SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=ANY($1)',[roles])).rows;
  if (members.length) throw new Error('Unexpected role membership');
  const tables = (await c.query("SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relnamespace='m1b'::regnamespace AND relkind='r' AND relname NOT IN ('meta','migrations')")).rows;
  if (tables.some(row => !row.relrowsecurity || !row.relforcerowsecurity || roles.includes(row.owner))) throw new Error('Unsafe table ownership/RLS');
}
