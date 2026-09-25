import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, Pool } from 'pg';
import { CommandSchema, OperationOutcomeSchema, SessionSnapshotSchema, type Command, type Session } from '@fitquest-rebuild/contracts';
import { createApp } from './app';
import { PostgresAthleteRepository, type WritePhase } from './repository';

const root = path.resolve(__dirname, '../../../');
const socket = path.join(root, 'private-test-artifacts', 'm1b-pg', 'socket');
const accounts = { A: '11111111-1111-4111-8111-111111111111', B: '22222222-2222-4222-8222-222222222222' } as const;
const now = '2026-09-25T12:00:00.000Z';
const profile = { displayName: 'Synthetic A', timeZone: 'America/New_York', units: { load: 'lb', distance: 'mi' } } as const;
const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const localDate = '2026-09-25';
const makeSession = (id = sessionId): Session => ({
  id, origin: 'unplanned', title: null, status: 'started', startedAt: now, endedAt: null, timeZone: 'America/New_York', localDate, correctionReason: null,
  activities: [
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Synthetic strength', variation: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', label: 'Standard' }, equipment: null, outcome: 'completed', startedAt: now, endedAt: now,
      results: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', kind: 'strength', observedAt: null, capturedAt: now, side: 'bilateral', notes: null, source: 'manual', voided: false, repetitions: 8, repetitionBasis: 'movement_cycles', load: { kind: 'external', mass: { value: '25', accuracy: 'reported', unit: 'lb' }, basis: 'per_dumbbell', implementCount: 2 }, rpe: null, rir: null }] },
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Synthetic run', variation: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', label: 'Easy' }, equipment: null, outcome: 'completed', startedAt: now, endedAt: now,
      results: [{ id: '99999999-9999-4999-8999-999999999999', kind: 'timed', observedAt: null, capturedAt: now, side: 'not_applicable', notes: null, source: 'manual', voided: false, duration: { value: '12', unit: 'min', accuracy: 'reported' }, durationMethod: 'manual' }] },
  ],
});
const profileCommand = (operationId = randomUUID(), expectedRevision = 0): Command => CommandSchema.parse({ contractVersion: 1, operationId, kind: 'profile.put', expectedRevision, payload: profile });
const sessionCommand = (operationId = randomUUID(), id = sessionId, expectedRevision = 0): Command => CommandSchema.parse({ contractVersion: 1, operationId, kind: 'session.put', expectedRevision, payload: makeSession(id) });

describe('real local HTTP + PostgreSQL synchronization', () => {
  let admin: Client, pool: Pool, authority: { A: string; B: string };
  const db = { host: socket, port: 55439, database: 'fitquest_m1b_synthetic_test' };
  beforeAll(async () => {
    authority = JSON.parse(readFileSync(path.join(root, 'private-test-artifacts', 'm1b-fixture-authority.json'), 'utf8')) as typeof authority;
    admin = new Client({ ...db, user: os.userInfo().username }); await admin.connect();
    const target = await admin.query("SELECT current_database() AS db, current_setting('data_directory') AS dir, inet_server_addr() AS tcp, (SELECT value FROM m1b.meta WHERE key='owner') AS marker");
    if (target.rows[0]?.db !== db.database || path.resolve(target.rows[0]?.dir ?? '') !== path.join(root, 'private-test-artifacts', 'm1b-pg', 'data') || target.rows[0]?.tcp !== null || target.rows[0]?.marker !== 'FitQuest M1b disposable synthetic') throw new Error('Refusing unmarked or nonlocal integration database');
    pool = new Pool({ ...db, user: 'fitquest_m1b_api', max: 3 });
  });
  afterAll(async () => { await pool?.end(); await admin?.end(); });
  beforeEach(async () => {
    await admin.query('TRUNCATE m1b.aggregate_revisions,m1b.operation_outcomes,m1b.aggregates');
  });
  async function server(phase?: (phase: WritePhase) => void | Promise<void>) {
    const app = createApp({ repository: new PostgresAthleteRepository(pool, phase), identity: { verifyBearer: token => token === authority.A ? accounts.A : token === authority.B ? accounts.B : null } });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const request = async (token: string | null, method: string, url: string, body?: unknown) => {
      const response = await fetch(`${address}${url}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() as unknown };
    };
    return { app, request };
  }
  async function counts() {
    const rows = await admin.query('SELECT (SELECT count(*)::int FROM m1b.aggregates) AS aggregates, (SELECT count(*)::int FROM m1b.aggregate_revisions) AS revisions, (SELECT count(*)::int FROM m1b.operation_outcomes) AS outcomes');
    return rows.rows[0] as { aggregates: number; revisions: number; outcomes: number };
  }

  it('commits owned profile and mixed session over HTTP, then replays across API restart without duplication', async () => {
    const first = await server();
    const p = profileCommand(), s = sessionCommand();
    const sentProfile = await first.request(authority.A, 'POST', '/v1/commands', p);
    expect(sentProfile.status).toBe(200); expect(sentProfile.cache).toBe('no-store');
    expect(OperationOutcomeSchema.parse(sentProfile.body).state).toBe('committed');
    const sentSession = await first.request(authority.A, 'POST', '/v1/commands', s);
    expect(OperationOutcomeSchema.parse(sentSession.body).state).toBe('committed');
    const owned = await first.request(authority.A, 'GET', `/v1/sessions/${sessionId}`);
    expect(SessionSnapshotSchema.parse(owned.body)).toEqual({ revision: 1, document: makeSession() });
    expect((await first.request(authority.A, 'GET', '/v1/sessions?limit=1')).status).toBe(200);
    await first.app.close();
    const reopened = await server();
    expect((await reopened.request(authority.A, 'POST', '/v1/commands', p)).body).toEqual(sentProfile.body);
    expect((await reopened.request(authority.A, 'POST', '/v1/commands', s)).body).toEqual(sentSession.body);
    expect((await reopened.request(authority.A, 'GET', `/v1/operations/${s.operationId}`)).body).toEqual(sentSession.body);
    expect(await counts()).toEqual({ aggregates: 2, revisions: 2, outcomes: 2 });
    await reopened.app.close();
  });

  it.each(['after_claim', 'after_aggregate', 'after_revision', 'after_outcome', 'before_commit'] as const)('rolls back a %s write failure, then accepts the same operation once', async phase => {
    const p = profileCommand();
    const broken = await server(at => { if (at === phase) throw new Error('injected boundary'); });
    expect((await broken.request(authority.A, 'POST', '/v1/commands', p)).status).toBe(500);
    expect(await counts()).toEqual({ aggregates: 0, revisions: 0, outcomes: 0 });
    await broken.app.close();
    const retry = await server();
    expect(OperationOutcomeSchema.parse((await retry.request(authority.A, 'POST', '/v1/commands', p)).body).state).toBe('committed');
    expect(await counts()).toEqual({ aggregates: 1, revisions: 1, outcomes: 1 });
    await retry.app.close();
  });

  it('recovers committed-but-lost acknowledgement and concurrent identical submissions', async () => {
    const p = profileCommand();
    const lost = await server(at => { if (at === 'after_commit') throw new Error('lost response'); });
    expect((await lost.request(authority.A, 'POST', '/v1/commands', p)).status).toBe(500);
    expect(await counts()).toEqual({ aggregates: 1, revisions: 1, outcomes: 1 });
    await lost.app.close();
    const replay = await server();
    const results = await Promise.all(Array.from({ length: 6 }, () => replay.request(authority.A, 'POST', '/v1/commands', p)));
    expect(results.every(result => result.status === 200 && JSON.stringify(result.body) === JSON.stringify(results[0].body))).toBe(true);
    expect(await counts()).toEqual({ aggregates: 1, revisions: 1, outcomes: 1 });
    await replay.app.close();
  });

  it('claims an operation account-wide before either target and retains domain rejections', async () => {
    const api = await server();
    await api.request(authority.A, 'POST', '/v1/commands', profileCommand());
    const operationId = randomUUID();
    const x = sessionCommand(operationId);
    const y = sessionCommand(operationId, '88888888-8888-4888-8888-888888888888');
    const results = await Promise.all([api.request(authority.A, 'POST', '/v1/commands', x), api.request(authority.A, 'POST', '/v1/commands', y)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await counts()).toEqual({ aggregates: 2, revisions: 2, outcomes: 2 });
    const conflicting = profileCommand(randomUUID(), 0);
    const rejected = await api.request(authority.A, 'POST', '/v1/commands', conflicting);
    expect(OperationOutcomeSchema.parse(rejected.body)).toMatchObject({ state: 'rejected', error: { code: 'REVISION_CONFLICT', currentRevision: 1 } });
    expect((await api.request(authority.A, 'POST', '/v1/commands', conflicting)).body).toEqual(rejected.body);
    expect(await counts()).toEqual({ aggregates: 2, revisions: 2, outcomes: 3 });
    await api.app.close();
  });

  it('requires confirmed profile and isolates A/B reads, outcomes, writes, and pooled owner context', async () => {
    const api = await server();
    const s = sessionCommand();
    const noProfile = await api.request(authority.A, 'POST', '/v1/commands', s);
    expect(OperationOutcomeSchema.parse(noProfile.body)).toMatchObject({ state: 'rejected', error: { code: 'PROFILE_REQUIRED' } });
    expect((await api.request(authority.A, 'POST', '/v1/commands', s)).body).toEqual(noProfile.body);
    await api.request(authority.A, 'POST', '/v1/commands', profileCommand());
    await api.request(authority.A, 'POST', '/v1/commands', sessionCommand());
    expect((await api.request(authority.B, 'GET', `/v1/sessions/${sessionId}`)).status).toBe(404);
    expect((await api.request(authority.B, 'GET', `/v1/operations/${s.operationId}`)).status).toBe(404);
    expect((await api.request(authority.B, 'GET', '/v1/profile')).body).toEqual({ revision: 0, document: null });
    expect((await api.request(authority.B, 'GET', '/v1/sessions')).body).toEqual({ items: [] });
    expect((await api.request(null, 'GET', '/v1/profile')).status).toBe(401);
    expect((await api.request('invalid-fixture-authority-token', 'GET', '/v1/profile')).status).toBe(401);
    expect((await api.request(authority.A, 'GET', '/v1/sessions?limit=51')).status).toBe(400);
    const pooled = await pool.connect();
    try { expect((await pooled.query('SELECT count(*)::int AS n FROM m1b.aggregates')).rows[0].n).toBe(0); }
    finally { pooled.release(); }
    await api.app.close();
  });
});
