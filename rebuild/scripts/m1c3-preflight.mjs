import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const base = path.join(root, 'private-test-artifacts', 'm1c3-pg');
export const data = path.join(base, 'data');
export const socket = path.join(base, 'socket');
export const marker = path.join(base, 'TASK_OWNER.json');
export const database = 'fitquest_m1c3_auth_test';
export const port = 55440;
export const owner = { project: 'FitQuest', purpose: 'M1c.3 isolated synthetic auth PostgreSQL', version: 1, database, port };
export const databaseMarker = 'FitQuest M1c3 isolated synthetic auth test';
export const migrations = [1, 2, 3, 4].map(version => ({ version, file: path.join(root, 'services/api/migrations', `${String(version).padStart(3, '0')}_${{ 1: 'local_sync', 2: 'local_marker_read', 3: 'transactional_sessions', 4: 'session_invariants' }[version]}.sql`) }));
const knownTables = new Set(['meta', 'migrations', 'accounts', 'aggregates', 'aggregate_revisions', 'operation_outcomes', 'provider_identities', 'session_families', 'credential_generations', 'revocation_capabilities']);

export function assertOwnerMarker(value) {
  if (JSON.stringify(value) !== JSON.stringify(owner)) throw new Error('M1c.3 ownership marker missing or changed');
}

export function assertTargetIdentity(row, name) {
  if (row?.db !== name || path.resolve(row?.dir ?? '') !== data || row?.port !== port || row?.tcp !== null) throw new Error('Unexpected PostgreSQL target');
}

export function assertDatabaseEvidence({ schemas, publicTables, tables, markerValue, ledger }, allowFresh = false) {
  if (schemas.some(name => !['public', 'm1b'].includes(name))) throw new Error('Unknown database schema');
  if (publicTables.length) throw new Error('Unknown public database table');
  const present = schemas.includes('m1b');
  if (!present) {
    if (!allowFresh || schemas.length !== 1 || schemas[0] !== 'public') throw new Error('Database marker absent');
    return [];
  }
  if (tables.some(name => !knownTables.has(name)) || !tables.includes('meta') || !tables.includes('migrations')) throw new Error('Unknown M1c.3 table set');
  if (markerValue !== databaseMarker) throw new Error('Database owner marker mismatch');
  if (ledger.length < 1 || ledger.length > migrations.length) throw new Error('Unexpected migration ledger');
  for (let i = 0; i < ledger.length; i++) {
    const item = migrations[i], checksum = createHash('sha256').update(readFileSync(item.file)).digest('hex');
    if (ledger[i].version !== item.version || ledger[i].checksum !== checksum) throw new Error('Changed or unknown migration ledger');
  }
  if (ledger.length < 3 && tables.some(name => !['meta', 'migrations', 'accounts', 'aggregates', 'aggregate_revisions', 'operation_outcomes'].includes(name))) throw new Error('Unrecorded authentication tables');
  if (ledger.length >= 3 && ['provider_identities', 'session_families', 'credential_generations', 'revocation_capabilities'].some(name => !tables.includes(name))) throw new Error('Missing authentication table');
  return ledger;
}
