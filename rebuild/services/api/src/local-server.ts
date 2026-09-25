import { timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createApp, type IdentityBoundary } from './app';
import { PostgresAthleteRepository } from './repository';

const root = path.resolve(__dirname, '../../../');
const base = path.join(root, 'private-test-artifacts', 'm1b-pg');
const socket = path.join(base, 'socket');
const authorityFile = path.join(root, 'private-test-artifacts', 'm1b-fixture-authority.json');
const accounts = { A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222' } as const;

if (process.env.FITQUEST_M1B_LOCAL_FIXTURE !== '1' || process.env.NODE_ENV === 'production') throw new Error('Local fixture API requires explicit development opt-in');
if (!existsSync(path.join(base, 'TASK_OWNER.json')) || !existsSync(authorityFile)) throw new Error('Run the guarded M1b local database setup first');
const marker = JSON.parse(readFileSync(path.join(base, 'TASK_OWNER.json'), 'utf8')) as unknown;
if (JSON.stringify(marker) !== JSON.stringify({ project: 'FitQuest', purpose: 'M1b disposable local PostgreSQL', version: 1 })) throw new Error('Local PostgreSQL ownership marker mismatch');
const authority = JSON.parse(readFileSync(authorityFile, 'utf8')) as Record<string, unknown>;
if (typeof authority.A !== 'string' || typeof authority.B !== 'string' || !/^[a-f0-9]{64}$/.test(authority.A) || !/^[a-f0-9]{64}$/.test(authority.B) || authority.A === authority.B) throw new Error('Invalid local fixture authority');
const equal = (left: string, right: string) => left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const identity: IdentityBoundary = { verifyBearer(token) { return equal(token, authority.A as string) ? accounts.A : equal(token, authority.B as string) ? accounts.B : null; } };
const pool = new Pool({ host: socket, port: 55439, user: 'fitquest_m1b_api', database: 'fitquest_m1b_synthetic', max: 4, connectionTimeoutMillis: 3000, idleTimeoutMillis: 5000 });
const port = Number(process.env.M1B_LOCAL_PORT ?? 3401);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid M1b local API port');

async function start() {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT current_database() AS database, inet_server_addr() AS tcp_address, (SELECT value FROM m1b.meta WHERE key='owner') AS marker");
    if (result.rows[0]?.database !== 'fitquest_m1b_synthetic' || result.rows[0]?.tcp_address !== null || result.rows[0]?.marker !== 'FitQuest M1b disposable synthetic') throw new Error('Unexpected local PostgreSQL target');
  } finally { client.release(); }
  const app = createApp({ repository: new PostgresAthleteRepository(pool), identity });
  await app.listen({ host: '127.0.0.1', port });
  const close = async () => { await app.close(); await pool.end(); };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
}
start().catch(() => { process.stderr.write('M1b local API startup failed. Verify the guarded local database and port.\n'); process.exitCode = 1; void pool.end(); });
