import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as SQLite from 'expo-sqlite';
vi.stubGlobal('__DEV__', true);

const mocked = vi.hoisted(() => ({ secrets: new Map<string, string>(), generation: 1 }));
vi.mock('./access', () => ({ fixtureAccessBoundary: { assertLocalAccess: async (_id: string, generation: number) => { if (generation !== mocked.generation) throw new Error('Account access changed'); } } }));
vi.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6, getItemAsync: async (key: string) => mocked.secrets.get(key) ?? null, setItemAsync: async (key: string, value: string) => { mocked.secrets.set(key, value); } }));
vi.mock('expo-file-system', () => ({ File: class { exists = false; } }));
vi.mock('expo-crypto', async () => {
  const crypto = await import('node:crypto');
  return { CryptoDigestAlgorithm: { SHA256: 'SHA256' }, getRandomBytesAsync: async () => new Uint8Array(crypto.randomBytes(32)), digestStringAsync: async (_: string, value: string) => crypto.createHash('sha256').update(value).digest('hex'), randomUUID: crypto.randomUUID };
});
vi.mock('expo-sqlite', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { createHash } = await import('node:crypto');
  const databases = new Map<string, InstanceType<typeof DatabaseSync>>();
  class Adapter {
    constructor(private db: InstanceType<typeof DatabaseSync>) {}
    async execAsync(sql: string) { this.db.exec(sql); }
    async getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null> {
      if (sql === 'PRAGMA cipher_version') return { cipher_version: 'test SQLite' } as T;
      return (this.db.prepare(sql).get(...params) ?? null) as T | null;
    }
    async getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]> { return this.db.prepare(sql).all(...params) as T[]; }
    async runAsync(sql: string, ...params: (string | number)[]) { return this.db.prepare(sql).run(...params); }
    async withExclusiveTransactionAsync(task: (tx: Adapter) => Promise<void>) {
      this.db.exec('BEGIN');
      try { await task(this); this.db.exec('COMMIT'); }
      catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    async closeAsync() { /* Shared in-memory test database retained for reopen assertions. */ }
  }
  return { defaultDatabaseDirectory: '/synthetic', __resetSynthetic: (name: string) => { databases.get(name)?.close(); databases.delete(name); }, __seedLegacy: (name: string, sql: string, owner: string, profileRaw: string, commandRaw: string, operation: string) => {
    const db = new DatabaseSync(':memory:'); db.exec(sql);
    db.prepare('INSERT INTO migrations(version,checksum) VALUES(1,?)').run(createHash('sha256').update(sql).digest('hex'));
    db.prepare('INSERT INTO owner(environment,account_id) VALUES(?,?)').run('m1a.synthetic.v1', owner);
    db.prepare("INSERT INTO projections(kind,id,revision,document) VALUES('profile','profile',1,?)").run(profileRaw);
    db.prepare("INSERT INTO revisions(kind,id,revision,document,operation_id,captured_at) VALUES('profile','profile',1,?,?,?)").run(profileRaw, operation, '2026-09-23T15:00:00.000Z');
    db.prepare("INSERT INTO commands(operation_id,kind,aggregate_id,ordinal,depends_on,content,state) VALUES(?,'profile','profile',1,NULL,?,'queued')").run(operation, commandRaw);
    db.prepare('INSERT INTO drafts(id,raw,updated_at) VALUES(?,?,?)').run('profile', '{"nick":"legacy draft"}', '2026-09-23T15:00:00.000Z');
    databases.set(name, db);
    return db;
  }, openDatabaseAsync: async (name: string) => {
    let db = databases.get(name);
    if (!db) { db = new DatabaseSync(':memory:'); databases.set(name, db); }
    return new Adapter(db);
  } };
});

import { LocalStore, localMigrationV1Sql } from './store';
import { EditorCoordinator } from './editor';
import { chooseResultIntent, submitResultIntent } from './resultIntent';
import { canonicalCommand, commandTarget, type Activity, type Command, type OperationOutcome, type Profile, type Result, type Session } from '@fitquest-rebuild/contracts';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const profile: Profile = { displayName: 'Synthetic', timeZone: 'UTC', units: { load: 'lb', distance: 'mi' } };
const session: Session = { id: uuid(1), origin: 'unplanned', title: null, status: 'started', startedAt: '2026-09-23T15:00:00.000Z', endedAt: null, timeZone: 'UTC', localDate: '2026-09-23', activities: [], correctionReason: null };
const outcomeFor = (command: Command, accountId: string, state: 'committed' | 'rejected', currentRevision = 0): OperationOutcome => {
  const target = commandTarget(command), requestHash = createHash('sha256').update(canonicalCommand(command)).digest('hex');
  const identity = { accountId, operationId: command.operationId, kind: command.kind, aggregateId: target.id, requestHash };
  return state === 'committed' ? { ...identity, state, receipt: { ...identity, revision: command.expectedRevision + 1 } } : { ...identity, state, error: { code: 'REVISION_CONFLICT', message: 'Review server change.', currentRevision } };
};

describe('local repository SQL transactions', () => {
  it('refuses fixture storage in Release even with an injected permissive boundary', async () => {
    vi.stubGlobal('__DEV__', false);
    try { await expect(LocalStore.open('A', 1, { assertLocalAccess: async () => {} })).rejects.toThrow('unavailable in this build'); }
    finally { vi.stubGlobal('__DEV__', true); }
  });
  it('rolls back projection, history, and immutable outbox together, then retries once', async () => {
    const store = await LocalStore.open('A', 1);
    await store.saveProfile(profile, uuid(2));
    await store.saveSession(session, uuid(3));
    const before = await store.pendingCommands();
    for (const phase of ['after_projection', 'after_revision', 'after_command'] as const) {
      store.injectFailureOnce(phase);
      await expect(store.saveSession({ ...session, title: phase }, uuid(10 + before.length))).rejects.toThrow('Injected local write failure');
      expect(await store.sessions()).toEqual([session]);
      expect((await store.pendingCommands()).length).toBe(before.length);
    }
    const corrected = { ...session, title: 'Corrected' };
    await store.saveSession(corrected, uuid(4));
    await store.saveSession(corrected, uuid(4));
    expect(await store.sessions()).toEqual([corrected]);
    expect((await store.pendingCommands()).length).toBe(before.length + 1);
    await expect(store.saveSession({ ...corrected, title: 'Different' }, uuid(4))).rejects.toThrow('Operation ID reused');
    await store.saveDraft('raw', '{"reps":"not a number"}');
    expect((await store.pendingCommands()).length).toBe(before.length + 1);
    await store.close();
    const reopened = await LocalStore.open('A', 1);
    expect(await reopened.draft('raw')).toBe('{"reps":"not a number"}');
    expect(await reopened.sessions()).toEqual([corrected]);
    mocked.generation = 2;
    await expect(reopened.saveSession(corrected, uuid(5))).rejects.toThrow('Account access changed');
    mocked.generation = 1;
    await reopened.close();
  });
  it('finalizes a persisted result intent atomically and replays a committed write after failed readback', async () => {
    const store = await LocalStore.open('A', 1);
    await store.saveProfile(profile, uuid(100));
    const activity: Activity = { id: uuid(101), name: 'Synthetic run', variation: { id: uuid(102), label: 'Standard' }, equipment: null, outcome: 'started', startedAt: '2026-09-23T15:01:00.000Z', endedAt: null, results: [] };
    const first = { ...session, id: uuid(103), activities: [activity] };
    await store.saveSession(first, uuid(104));
    const result: Result = { id: uuid(105), kind: 'timed', observedAt: null, capturedAt: '2026-09-23T15:02:00.000Z', side: 'not_applicable', notes: null, source: 'manual', voided: false, duration: { value: '12', unit: 'min', accuracy: 'reported' }, durationMethod: 'manual' };
    const draftId = `result:${activity.id}`;
    const form = { kind: 'timed', duration: '12' };
    const intent = chooseResultIntent(null, form, result, uuid(106), first.id, activity.id);
    const editor = new EditorCoordinator(); editor.select(draftId, 0);
    await expect(submitResultIntent(editor, intent, (id, raw, sequence) => store.saveDraft(id, raw, sequence), () => undefined, async () => { throw new Error('Interrupted before fact'); })).rejects.toThrow('Interrupted before fact');
    const raw = JSON.stringify(intent);
    await store.close(); // interrupted after intent, before fact
    const reopened = await LocalStore.open('A', 1);
    expect(await reopened.draft(draftId)).toBe(raw);
    const restored = chooseResultIntent(JSON.parse(raw) as typeof intent, form, { ...result, id: uuid(107) }, uuid(108), first.id, activity.id);
    expect(restored).toEqual(intent);
    const commandsBefore = (await reopened.pendingCommands()).length;
    const reopenedEditor = new EditorCoordinator(); reopenedEditor.select(draftId, 1);
    reopened.injectFailureOnce('after_command');
    await expect(submitResultIntent(reopenedEditor, restored, (id, value, sequence) => reopened.saveDraft(id, value, sequence), () => undefined, (value, stamp) => reopened.saveResultFromDraft(first.id, activity.id, value.result, value.operationId, draftId, stamp.sequence))).rejects.toThrow('Injected local write failure');
    expect(await reopened.draft(draftId)).toBe(raw);
    expect((await reopened.sessions()).find(s => s.id === first.id)?.activities[0]?.results).toEqual([]);
    await expect(submitResultIntent(reopenedEditor, restored, (id, value, sequence) => reopened.saveDraft(id, value, sequence), () => undefined, async (value, stamp) => {
      await reopened.saveResultFromDraft(first.id, activity.id, value.result, value.operationId, draftId, stamp.sequence);
      throw new Error('Failed readback after committed fact');
    })).rejects.toThrow('Failed readback after committed fact');
    expect(await reopened.draft(draftId)).toBe('');
    expect((await reopened.pendingCommands()).length).toBe(commandsBefore + 1);
    await reopened.close(); // fact committed, UI/readback interrupted
    const again = await LocalStore.open('A', 1);
    await again.saveResultFromDraft(first.id, activity.id, result, uuid(106), draftId, 3);
    expect((await again.pendingCommands()).length).toBe(commandsBefore + 1);
    expect((await again.sessions()).find(s => s.id === first.id)?.activities[0]?.results).toEqual([result]);
    expect(await again.draft(draftId)).toBe('');
    await again.close();
  });
  it.each(['completed', 'ended_early'] as const)('corrects strength and time in a %s session under the same IDs', async status => {
    const store = await LocalStore.open('A', 1);
    await store.saveProfile(profile, uuid(status === 'completed' ? 200 : 220));
    const base = status === 'completed' ? 201 : 221;
    const strength: Result = { id: uuid(base + 2), kind: 'strength', observedAt: null, capturedAt: '2026-09-23T15:02:00.000Z', side: 'bilateral', notes: null, source: 'manual', voided: false, repetitions: 5, repetitionBasis: 'movement_cycles', load: null, rpe: null, rir: null };
    const timed: Result = { id: uuid(base + 3), kind: 'timed', observedAt: null, capturedAt: '2026-09-23T15:03:00.000Z', side: 'not_applicable', notes: null, source: 'manual', voided: false, duration: { value: '10', unit: 'min', accuracy: 'reported' }, durationMethod: 'manual' };
    const activity: Activity = { id: uuid(base + 1), name: 'Synthetic mixed', variation: { id: uuid(base + 4), label: 'Standard' }, equipment: null, outcome: 'completed', startedAt: '2026-09-23T15:01:00.000Z', endedAt: '2026-09-23T15:04:00.000Z', results: [strength, timed] };
    const finished: Session = { ...session, id: uuid(base), status, endedAt: '2026-09-23T15:05:00.000Z', activities: [activity] };
    await store.saveSession(finished, uuid(base + 5));
    const before = (await store.pendingCommands()).find(c => c.operationId === uuid(base + 5));
    const revisedStrength = { ...strength, repetitions: 6 };
    const revisedTimed = { ...timed, duration: { value: '12', unit: 'min' as const, accuracy: 'reported' as const } };
    await store.saveDraft(`result:${activity.id}`, JSON.stringify(chooseResultIntent(null, { reps: '6' }, revisedStrength, uuid(base + 6), finished.id, activity.id)), 1);
    await store.saveResultFromDraft(finished.id, activity.id, revisedStrength, uuid(base + 6), `result:${activity.id}`, 1);
    await store.saveDraft(`result:${activity.id}`, JSON.stringify(chooseResultIntent(null, { duration: '12' }, revisedTimed, uuid(base + 7), finished.id, activity.id)), 2);
    await store.saveResultFromDraft(finished.id, activity.id, revisedTimed, uuid(base + 7), `result:${activity.id}`, 2);
    await store.close();
    const reopened = await LocalStore.open('A', 1);
    const saved = (await reopened.sessions()).find(s => s.id === finished.id);
    expect(saved?.status).toBe(status);
    expect(saved?.startedAt).toBe(finished.startedAt);
    expect(saved?.endedAt).toBe(finished.endedAt);
    expect(saved?.activities[0]?.outcome).toBe('completed');
    expect(saved?.activities[0]?.results).toEqual([revisedStrength, revisedTimed]);
    expect((await reopened.pendingCommands()).find(c => c.operationId === uuid(base + 5))).toEqual(before);
    await reopened.close();
  });
  it('recovers incomplete profile, activity, and result drafts only for their owner without commands', async () => {
    const a = await LocalStore.open('A', 1);
    const before = (await a.pendingCommands()).length;
    const editor = new EditorCoordinator();
    const drafts = [
      ['profile', '{"nick":"unfinished synthetic nickname","zone":"invalid"}'],
      ['activity:synthetic-session', '{"name":"unfinished practice","variation":"","equipment":"","kind":"timed"}'],
      ['result:synthetic-activity', '{"kind":"strength","reps":"not-a-number"}'],
    ] as const;
    for (const [key, raw] of drafts) {
      editor.select(key, 0);
      await editor.persist(raw, (id, value, sequence) => a.saveDraft(id, value, sequence), () => undefined);
    }
    expect((await a.pendingCommands()).length).toBe(before);
    await a.close();
    const b = await LocalStore.open('B', 1);
    for (const [key] of drafts) expect(await b.draft(key)).toBeNull();
    await b.close();
    const reopened = await LocalStore.open('A', 1);
    for (const [key, raw] of drafts) expect(await reopened.draft(key)).toBe(raw);
    expect((await reopened.pendingCommands()).length).toBe(before);
    await reopened.close();
  });
  it('does not let a late older draft write revive cleared input or replace a newer edit', async () => {
    const store = await LocalStore.open('A', 1);
    expect(await store.saveDraft('ordered', 'newer', 5)).toBe(5);
    expect(await store.saveDraft('ordered', 'older', 4)).toBe(5);
    expect(await store.draft('ordered')).toBe('newer');
    expect(await store.saveDraft('ordered', '', 6)).toBe(6);
    expect(await store.saveDraft('ordered', 'stale', 5)).toBe(6);
    expect(await store.draft('ordered')).toBe('');
    await store.close();
  });
  it('commits profile and add-activity draft finalization with their facts', async () => {
    const store = await LocalStore.open('A', 1);
    const revised = { ...profile, displayName: 'Committed synthetic profile' };
    const profileDraft = 'profile:atomic-test';
    await store.saveDraft(profileDraft, '{"nick":"Committed synthetic profile"}', 1);
    store.injectFailureOnce('after_command');
    await expect(store.saveProfileFromDraft(revised, uuid(260), profileDraft, 1)).rejects.toThrow('Injected local write failure');
    expect(await store.draft(profileDraft)).toBe('{"nick":"Committed synthetic profile"}');
    await store.saveProfileFromDraft(revised, uuid(260), profileDraft, 1);
    expect(await store.draft(profileDraft)).toBe('');
    const base: Session = { ...session, id: uuid(261), activities: [] };
    await store.saveSession(base, uuid(262));
    const added: Activity = { id: uuid(263), name: 'Synthetic practice', variation: { id: uuid(264), label: 'Standard' }, equipment: null, outcome: 'started', startedAt: '2026-09-23T15:01:00.000Z', endedAt: null, results: [] };
    await store.saveDraft(`activity:${base.id}`, '{"name":"Synthetic practice"}', 1);
    store.injectFailureOnce('after_command');
    await expect(store.saveSessionFromDraft({ ...base, activities: [added] }, uuid(265), `activity:${base.id}`, 1)).rejects.toThrow('Injected local write failure');
    expect((await store.sessions()).find(s => s.id === base.id)?.activities).toEqual([]);
    expect(await store.draft(`activity:${base.id}`)).toBe('{"name":"Synthetic practice"}');
    await store.saveSessionFromDraft({ ...base, activities: [added] }, uuid(265), `activity:${base.id}`, 1);
    expect((await store.sessions()).find(s => s.id === base.id)?.activities).toEqual([added]);
    expect(await store.draft(`activity:${base.id}`)).toBe('');
    await store.close();
  });
  it('migrates a v1 synthetic store forward without changing its history, pending command, or raw draft', async () => {
    const operation = uuid(300);
    const command = { contractVersion: 1, operationId: operation, kind: 'profile.put', expectedRevision: 0, payload: profile };
    const seed = (SQLite as unknown as { __seedLegacy: (name: string, sql: string, owner: string, profileRaw: string, commandRaw: string, operation: string) => { prepare: (sql: string) => { all: () => unknown[] } } }).__seedLegacy;
    const db = seed('fitquest-m1a-synthetic-A.db', localMigrationV1Sql, 'A', JSON.stringify(profile), JSON.stringify(command), operation);
    const migrated = await LocalStore.open('A', 1);
    expect(await migrated.profile()).toEqual(profile);
    expect((await migrated.pendingCommands()).map(c => c.operationId)).toEqual([operation]);
    expect(await migrated.draftRecord('profile')).toEqual({ raw: '{"nick":"legacy draft"}', sequence: 0 });
    expect((db.prepare('SELECT version FROM migrations ORDER BY version').all() as Array<{ version: number }>).map(row => row.version)).toEqual([1, 2, 3]);
    expect((db.prepare('SELECT state FROM sync_delivery').all() as Array<{ state: string }>).map(row => row.state)).toEqual(['queued']);
    await migrated.saveDraft('profile', '{"nick":"continued"}', 1);
    await migrated.close();
    const reopened = await LocalStore.open('A', 1);
    expect(await reopened.draft('profile')).toBe('{"nick":"continued"}');
    expect((await reopened.pendingCommands()).map(c => c.operationId)).toEqual([operation]);
    await reopened.close();
  });
  it('holds a dependent session until a durable profile receipt and retries an unknown operation unchanged', async () => {
    const reset = (SQLite as unknown as { __resetSynthetic: (name: string) => void }).__resetSynthetic;
    reset('fitquest-m1a-synthetic-B.db'); mocked.secrets.delete('fitquest.m1a.fixture.B.dbkey');
    const store = await LocalStore.open('B', 1);
    await store.saveProfile(profile, uuid(400));
    await store.saveSession({ ...session, id: uuid(401) }, uuid(402));
    const first = await store.takeNextSyncWork();
    expect(first?.command.operationId).toBe(uuid(400));
    expect(await store.takeNextSyncWork()).toBeNull();
    await store.markOutcomeUnknown(uuid(400));
    expect(await store.takeNextSyncWork()).toBeNull();
    const retry = await store.takeNextSyncWork(true);
    expect(retry?.command).toEqual(first?.command);
    const bad = outcomeFor(first!.command, '22222222-2222-4222-8222-222222222222', 'committed') as Extract<OperationOutcome, { state: 'committed' }>;
    await expect(store.applySyncOutcome(uuid(400), { ...bad, receipt: { ...bad.receipt, revision: 2 } })).rejects.toThrow('Mismatched sync receipt');
    await store.markOutcomeUnknown(uuid(400));
    expect((await store.takeNextSyncWork(true))?.command).toEqual(first?.command);
    store.injectSyncAcknowledgementFailureOnce();
    await expect(store.applySyncOutcome(uuid(400), bad)).rejects.toThrow('Injected local acknowledgement failure');
    expect((await store.syncSummary()).acknowledged).toBe(0);
    await store.markOutcomeUnknown(uuid(400));
    expect((await store.takeNextSyncWork(true))?.command).toEqual(first?.command);
    await store.applySyncOutcome(uuid(400), bad);
    const dependent = await store.takeNextSyncWork();
    expect(dependent?.command.operationId).toBe(uuid(402));
    await store.applySyncOutcome(uuid(402), outcomeFor(dependent!.command, '22222222-2222-4222-8222-222222222222', 'committed'));
    expect(await store.syncSummary()).toEqual({ pending: 0, sending: 0, unknown: 0, blocked: 0, acknowledged: 2 });
    await store.close();
    const reopened = await LocalStore.open('B', 1);
    expect(await reopened.takeNextSyncWork()).toBeNull();
    expect((await reopened.pendingCommands()).length).toBe(0);
    await reopened.close();
  });
  it('blocks a rejected initial profile chain, then explicitly rebuilds profile and session without losing history', async () => {
    const reset = (SQLite as unknown as { __resetSynthetic: (name: string) => void }).__resetSynthetic;
    reset('fitquest-m1a-synthetic-B.db'); mocked.secrets.delete('fitquest.m1a.fixture.B.dbkey');
    const store = await LocalStore.open('B', 1);
    await store.saveProfile(profile, uuid(410));
    await store.saveSession({ ...session, id: uuid(411) }, uuid(412));
    const first = (await store.takeNextSyncWork())!.command;
    await store.applySyncOutcome(first.operationId, outcomeFor(first, '22222222-2222-4222-8222-222222222222', 'rejected'));
    expect((await store.syncSummary()).blocked).toBe(2);
    expect(await store.takeNextSyncWork(true)).toBeNull();
    await store.saveDraft('profile', '{"nick":"latest unsent correction"}', 1);
    const profileReview = await store.prepareRecovery('profile', 'profile', { revision: 0, document: null });
    await store.resolveRecovery(profileReview, 'apply_local', uuid(413));
    expect(await store.draft('profile')).toBe('{"nick":"latest unsent correction"}');
    const replacement = (await store.takeNextSyncWork())!.command;
    expect(replacement.operationId).toBe(uuid(413)); expect(replacement.expectedRevision).toBe(0);
    await store.applySyncOutcome(replacement.operationId, outcomeFor(replacement, '22222222-2222-4222-8222-222222222222', 'committed'));
    const sessionReview = await store.prepareRecovery('session', uuid(411), { revision: 0, document: null });
    await store.resolveRecovery(sessionReview, 'apply_local', uuid(414));
    const sessionReplacement = (await store.takeNextSyncWork())!.command;
    expect(sessionReplacement.operationId).toBe(uuid(414)); expect(sessionReplacement.expectedRevision).toBe(0);
    await store.applySyncOutcome(sessionReplacement.operationId, outcomeFor(sessionReplacement, '22222222-2222-4222-8222-222222222222', 'committed'));
    expect((await store.syncSummary()).pending).toBe(0);
    await store.close();
    const reopened = await LocalStore.open('B', 1);
    expect((await reopened.sessions()).find(s => s.id === uuid(411))).toEqual({ ...session, id: uuid(411) });
    expect(await reopened.draft('profile')).toBe('{"nick":"latest unsent correction"}');
    await reopened.close();
  });
  it('preserves newer edits when a rejected A blocks B, and atomically replaces the chain at reviewed server revision', async () => {
    const reset = (SQLite as unknown as { __resetSynthetic: (name: string) => void }).__resetSynthetic;
    reset('fitquest-m1a-synthetic-B.db'); mocked.secrets.delete('fitquest.m1a.fixture.B.dbkey');
    const store = await LocalStore.open('B', 1);
    for (let n = 0; n < 3; n++) {
      await store.saveProfile({ ...profile, displayName: `Base ${n + 1}` }, uuid(420 + n));
      const command = (await store.takeNextSyncWork())!.command;
      await store.applySyncOutcome(command.operationId, outcomeFor(command, '22222222-2222-4222-8222-222222222222', 'committed'));
    }
    await store.saveProfile({ ...profile, displayName: 'A' }, uuid(423));
    await store.saveProfile({ ...profile, displayName: 'B latest' }, uuid(424));
    const a = (await store.takeNextSyncWork())!.command;
    expect(a.expectedRevision).toBe(3);
    await store.applySyncOutcome(a.operationId, outcomeFor(a, '22222222-2222-4222-8222-222222222222', 'rejected', 4));
    expect((await store.syncSummary()).blocked).toBe(2);
    expect(await store.takeNextSyncWork()).toBeNull();
    const server = { revision: 4, document: { ...profile, displayName: 'Another client' } };
    const stale = await store.prepareRecovery('profile', 'profile', server);
    await store.saveDraft('profile', '{"nick":"newer raw"}', 1);
    await expect(store.resolveRecovery(stale, 'apply_local', uuid(425))).rejects.toThrow('LOCAL_RESOLUTION_STALE');
    const review = await store.prepareRecovery('profile', 'profile', server);
    mocked.generation = 2;
    await expect(store.resolveRecovery(review, 'apply_local', uuid(425))).rejects.toThrow('Account access changed');
    mocked.generation = 1;
    store.injectFailureOnce('after_command');
    await expect(store.resolveRecovery(review, 'apply_local', uuid(425))).rejects.toThrow('Injected local write failure');
    expect((await store.syncSummary()).blocked).toBe(2);
    await store.close();
    const reopened = await LocalStore.open('B', 1);
    const rereview = await reopened.prepareRecovery('profile', 'profile', server);
    await reopened.resolveRecovery(rereview, 'apply_local', uuid(425));
    const replacement = (await reopened.takeNextSyncWork())!.command;
    expect(replacement.operationId).toBe(uuid(425)); expect(replacement.expectedRevision).toBe(4);
    expect(replacement.kind === 'profile.put' && replacement.payload.displayName).toBe('B latest');
    expect(await reopened.draft('profile')).toBe('{"nick":"newer raw"}');
    await reopened.applySyncOutcome(replacement.operationId, outcomeFor(replacement, '22222222-2222-4222-8222-222222222222', 'rejected', 5));
    expect((await reopened.syncSummary()).blocked).toBe(1);
    await reopened.close();
  });
  it('adopts reviewed server state explicitly while retaining superseded local revisions and drafts', async () => {
    const reset = (SQLite as unknown as { __resetSynthetic: (name: string) => void }).__resetSynthetic;
    reset('fitquest-m1a-synthetic-B.db'); mocked.secrets.delete('fitquest.m1a.fixture.B.dbkey');
    const store = await LocalStore.open('B', 1);
    await store.saveProfile({ ...profile, displayName: 'Local intent' }, uuid(440));
    await store.saveDraft('profile', '{"nick":"unsubmitted raw"}', 1);
    const item = (await store.takeNextSyncWork())!.command;
    await store.applySyncOutcome(item.operationId, outcomeFor(item, '22222222-2222-4222-8222-222222222222', 'rejected', 2));
    const review = await store.prepareRecovery('profile', 'profile', { revision: 2, document: { ...profile, displayName: 'Server choice' } });
    await store.resolveRecovery(review, 'adopt_server', uuid(441));
    expect((await store.profile())?.displayName).toBe('Server choice');
    expect(await store.draft('profile')).toBe('{"nick":"unsubmitted raw"}');
    expect((await store.syncSummary()).pending).toBe(0);
    await store.saveProfile({ ...profile, displayName: 'Later local edit' }, uuid(442));
    expect((await store.takeNextSyncWork())?.command.expectedRevision).toBe(2);
    await store.close();
    const reopened = await LocalStore.open('B', 1);
    expect((await reopened.profile())?.displayName).toBe('Later local edit');
    expect(await reopened.draft('profile')).toBe('{"nick":"unsubmitted raw"}');
    await reopened.close();
  });
  it('adopts a selected session without deleting its result draft or superseded history', async () => {
    const reset = (SQLite as unknown as { __resetSynthetic: (name: string) => void }).__resetSynthetic;
    reset('fitquest-m1a-synthetic-B.db'); mocked.secrets.delete('fitquest.m1a.fixture.B.dbkey');
    const store = await LocalStore.open('B', 1);
    await store.saveProfile(profile, uuid(450));
    const setup = (await store.takeNextSyncWork())!.command;
    await store.applySyncOutcome(setup.operationId, outcomeFor(setup, '22222222-2222-4222-8222-222222222222', 'committed'));
    const base = { ...session, id: uuid(451), title: 'Base' };
    await store.saveSession(base, uuid(452));
    const first = (await store.takeNextSyncWork())!.command;
    await store.applySyncOutcome(first.operationId, outcomeFor(first, '22222222-2222-4222-8222-222222222222', 'committed'));
    await store.saveSession({ ...base, title: 'Local correction' }, uuid(453));
    await store.saveDraft(`result:${uuid(454)}`, '{"reps":"newer raw"}', 1);
    const conflicting = (await store.takeNextSyncWork())!.command;
    await store.applySyncOutcome(conflicting.operationId, outcomeFor(conflicting, '22222222-2222-4222-8222-222222222222', 'rejected', 2));
    const review = await store.prepareRecovery('session', base.id, { revision: 2, document: { ...base, title: 'Server correction' } });
    await store.resolveRecovery(review, 'adopt_server', uuid(455));
    expect((await store.sessions())[0].title).toBe('Server correction');
    expect(await store.draft(`result:${uuid(454)}`)).toBe('{"reps":"newer raw"}');
    expect((await store.syncSummary()).pending).toBe(0);
    await store.close();
    const reopened = await LocalStore.open('B', 1);
    expect((await reopened.sessions())[0].title).toBe('Server correction');
    expect(await reopened.draft(`result:${uuid(454)}`)).toBe('{"reps":"newer raw"}');
    await reopened.close();
  });
});
