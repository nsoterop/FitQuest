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
  const keys = new Map<string, string>();
  const latchReadFailures = new Set<string>();
  class Adapter {
    private key: string | null = null;
    constructor(private db: InstanceType<typeof DatabaseSync>, private name: string) {}
    private check(sql: string) {
      if (sql === 'PRAGMA cipher_version' || sql.startsWith('PRAGMA key =')) return;
      const expected = keys.get(this.name);
      if (expected && this.key !== expected) throw new Error('Wrong encrypted database key');
      if (!expected && this.key) keys.set(this.name, this.key);
    }
    async execAsync(sql: string) { const match = /^PRAGMA key = '([^']+)'$/.exec(sql); if (match) { this.key = match[1]; return; } this.check(sql); this.db.exec(sql); }
    async getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null> {
      if (sql === 'PRAGMA cipher_version') return { cipher_version: 'test SQLite' } as T;
      this.check(sql);
      if (sql.includes('FROM local_auth_latch') && latchReadFailures.delete(this.name)) throw new Error('Injected SQLite latch readback failure');
      return (this.db.prepare(sql).get(...params) ?? null) as T | null;
    }
    async getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]> { this.check(sql); return this.db.prepare(sql).all(...params) as T[]; }
    async runAsync(sql: string, ...params: (string | number)[]) { this.check(sql); return this.db.prepare(sql).run(...params); }
    async withExclusiveTransactionAsync(task: (tx: Adapter) => Promise<void>) {
      this.db.exec('BEGIN');
      try { await task(this); this.db.exec('COMMIT'); }
      catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    async closeAsync() { /* Shared in-memory test database retained for reopen assertions. */ }
  }
  return { defaultDatabaseDirectory: '/synthetic', __failNextLatchRead: (name: string) => { latchReadFailures.add(name); }, __resetSynthetic: (name: string) => { databases.get(name)?.close(); databases.delete(name); keys.delete(name); latchReadFailures.delete(name); }, __seedLegacy: (name: string, sql: string, owner: string, profileRaw: string, commandRaw: string, operation: string) => {
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
    return new Adapter(db, name);
  } };
});

import { LocalStore, localMigrationV1Sql } from './store';
import { syntheticAccountNamespace, type SyntheticAccountStore } from './ownership';
import type { ProtectedRecordPort, SyntheticIdentityAuthority, LatchFault, LatchPhase, LatchWrite } from './auth/localLatch';
import { CredentialRecoveryCoordinator, type AuthTransportPort, type CredentialStoragePort } from './auth/coordinator';
import { SyncSender } from './sync';
import { DurableAccountSwitch } from './auth/durableSwitch';
import { EditorCoordinator } from './editor';
import { chooseResultIntent, submitResultIntent } from './resultIntent';
import { canonicalCommand, commandTarget, type Activity, type Command, type OperationOutcome, type PendingCredentials, type PersistedCredentials, type Profile, type Result, type Session } from '@fitquest-rebuild/contracts';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const profile: Profile = { displayName: 'Synthetic', timeZone: 'UTC', units: { load: 'lb', distance: 'mi' } };
const session: Session = { id: uuid(1), origin: 'unplanned', title: null, status: 'started', startedAt: '2026-09-23T15:00:00.000Z', endedAt: null, timeZone: 'UTC', localDate: '2026-09-23', activities: [], correctionReason: null };
const outcomeFor = (command: Command, accountId: string, state: 'committed' | 'rejected', currentRevision = 0): OperationOutcome => {
  const target = commandTarget(command), requestHash = createHash('sha256').update(canonicalCommand(command)).digest('hex');
  const identity = { accountId, operationId: command.operationId, kind: command.kind, aggregateId: target.id, requestHash };
  return state === 'committed' ? { ...identity, state, receipt: { ...identity, revision: command.expectedRevision + 1 } } : { ...identity, state, error: { code: 'REVISION_CONFLICT', message: 'Review server change.', currentRevision } };
};

const testOwner = (n: number, epoch = 1): SyntheticAccountStore => ({ kind: 'synthetic-account-test', environment: 'test_local', accountId: uuid(n), storeId: uuid(n + 1), installInstanceId: uuid(n + 2), localEpoch: epoch });
function accountHarness(owner = testOwner(700)) {
  const seen = new Set<string>(), keys = new Map<string, string>(), protectedRows = new Map<string, { revision: number; value: unknown }>();
  let epoch = owner.localEpoch, failProtected = false, failNextProtectedRead = false, fault: LatchFault = () => undefined;
  const resources = {
    exists: (name: string) => seen.has(name),
    readKey: async (key: string) => keys.get(key) ?? null,
    writeKey: async (key: string, value: string) => { keys.set(key, value); },
    openDatabase: async (name: string) => { seen.add(name); return SQLite.openDatabaseAsync(name); },
    randomKey: async () => 'a'.repeat(64),
  };
  const protectedPort: ProtectedRecordPort = {
    read: async key => {
      if (failNextProtectedRead) { failNextProtectedRead = false; throw new Error('Injected protected readback failure'); }
      return structuredClone(protectedRows.get(key) ?? null);
    },
    compareAndSwap: async (key, revision, value, guard) => {
      if (failProtected || !guard() || (protectedRows.get(key)?.revision ?? null) !== revision) throw new Error('Protected write failed');
      const next = (revision ?? 0) + 1;
      protectedRows.set(key, { revision: next, value: structuredClone(value) });
      return next;
    },
  };
  const authority: SyntheticIdentityAuthority = {
    current: value => value.localEpoch === epoch && value.environment === owner.environment && value.accountId === owner.accountId && value.storeId === owner.storeId && value.installInstanceId === owner.installInstanceId,
    verify: async (value, identity) => value.accountId === identity.accountId,
  };
  const open = (value = owner) => LocalStore.openSyntheticAccountTest(value, resources, protectedPort, authority, (phase, write) => fault(phase, write));
  const verified = (store: Awaited<ReturnType<typeof open>>, session = uuid(790)) => store.latch!.authorize({ accountId: store.account, sessionId: session, credentialGeneration: 1 }, owner.environment, owner.localEpoch, () => true);
  return { owner, resources, protectedPort, protectedRows, keys, seen, authority, open, verified, setEpoch: (value: number) => { epoch = value; }, failProtected: (value: boolean) => { failProtected = value; }, failProtectedRead: () => { failNextProtectedRead = true; }, setFault: (value: LatchFault) => { fault = value; } };
}

const authInput = { challengeId: uuid(960), state: 'synthetic-state', identityToken: 'synthetic-identity', authorizationCode: 'single-use-synthetic-code' };
const authBundle = (accountId: string, sessionId: string): PendingCredentials => ({
  accountId, sessionId, credentialGeneration: 1, accessToken: 'synthetic-access', accessExpiresAt: '2026-09-25T10:15:00.000Z',
  refreshToken: 'synthetic-refresh', refreshExpiresAt: '2026-10-25T10:00:00.000Z', sessionExpiresAt: '2026-12-24T10:00:00.000Z',
  revocationToken: 'synthetic-revoke', activationExpiresAt: '2026-09-25T10:05:00.000Z',
});
function coordinatorHarness(owner: SyntheticAccountStore) {
  let row: { revision: number; value: unknown } | null = null;
  let offered = authBundle(owner.accountId, uuid(961)), exchanges = 0, activations = 0;
  const credentials: CredentialStoragePort = {
    read: async () => structuredClone(row),
    compareAndSwap: async (expected, next: PersistedCredentials, guard) => {
      if (!guard() || (row?.revision ?? null) !== expected) throw new Error('Stale credential revision');
      const revision = (row?.revision ?? 0) + 1;
      row = { revision, value: structuredClone(next) };
      return revision;
    },
  };
  const transport: AuthTransportPort = {
    exchange: async () => { exchanges++; return { kind: 'credentials', bundle: offered }; },
    refresh: async () => ({ kind: 'reauth_required' }),
    activate: async bundle => { activations++; return { kind: 'active', identity: { accountId: bundle.accountId, sessionId: bundle.sessionId, credentialGeneration: bundle.credentialGeneration }, alreadyActive: false }; },
    identity: async bundle => ({ kind: 'active', identity: { accountId: bundle.accountId, sessionId: bundle.sessionId, credentialGeneration: bundle.credentialGeneration } }),
    revoke: async () => 'revoked',
  };
  const make = (store: Awaited<ReturnType<ReturnType<typeof accountHarness>['open']>>) => new CredentialRecoveryCoordinator(owner.environment, owner.localEpoch, {
    now: () => Date.parse('2026-09-25T10:00:00.000Z'), operationId: () => uuid(962), current: fence => store.latch!.current(fence),
    expectedLocalOwner: store.latch!.expectedOwner, credentials, local: store.latch!, transport,
  });
  return {
    make, setOffered: (bundle: PendingCredentials) => { offered = bundle; },
    corrupt: () => { row = { revision: (row?.revision ?? 0) + 1, value: { ...(row!.value as PersistedCredentials), bundle: { ...(row!.value as PersistedCredentials).bundle, accountId: uuid(999), refreshToken: null } } }; },
    expireAccess: () => { const current = row!.value as PersistedCredentials; row = { revision: row!.revision + 1, value: { ...current, bundle: { ...current.bundle, activationExpiresAt: '2026-09-25T09:58:00.000Z', accessExpiresAt: '2026-09-25T09:59:00.000Z' } } }; },
    row: () => structuredClone(row), exchanges: () => exchanges, activations: () => activations,
  };
}

describe('local repository SQL transactions', () => {
  it('refuses fixture storage in Release even with an injected permissive boundary', async () => {
    vi.stubGlobal('__DEV__', false);
    try { await expect(LocalStore.open('A', 1, { assertLocalAccess: async () => {} })).rejects.toThrow('unavailable in this build'); }
    finally { vi.stubGlobal('__DEV__', true); }
  });
  it('rejects an invalid fixture label despite an injected permissive boundary', async () => {
    await expect(LocalStore.open('not-a-fixture' as 'A', 1, { assertLocalAccess: async () => undefined })).rejects.toThrow('Invalid fixture identity');
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

describe('coordinator and sender through the UUID local boundary', () => {
  it('repairs damaged rotating credentials from independent owner/latch evidence while retaining local work', async () => {
    const h = accountHarness(testOwner(850)), auth = coordinatorHarness(h.owner);
    const store = await h.open(), first = auth.make(store);
    expect((await first.exchange(authInput)).syncReady).toBe(true);
    await store.saveProfile(profile, uuid(853)); await store.saveDraft('profile:unfinished', '{"nick":"kept"}', 1);
    await store.close(); auth.corrupt();
    const restarted = await h.open(), repair = auth.make(restarted);
    expect(await repair.recover()).toMatchObject({ phase: 'local_only', localAccess: 'authorized', code: 'AUTH_REAUTH_REQUIRED' });
    const fresh = { ...authBundle(h.owner.accountId, uuid(963)), accessToken: 'fresh-access', refreshToken: 'fresh-refresh', revocationToken: 'fresh-revoke' };
    auth.setOffered(fresh);
    expect((await repair.exchange(authInput)).syncReady).toBe(true);
    expect(auth.exchanges()).toBe(2);
    expect(await restarted.profile()).toEqual(profile);
    expect(await restarted.draft('profile:unfinished')).toBe('{"nick":"kept"}');
    expect((await restarted.pendingCommands()).map(value => value.operationId)).toEqual([uuid(853)]);
    await restarted.close();
  });

  it('rejects foreign verified identity and corrupt independent authority without consuming local commands', async () => {
    const h = accountHarness(testOwner(860)), auth = coordinatorHarness(h.owner);
    const store = await h.open(); expect((await auth.make(store).exchange(authInput)).syncReady).toBe(true);
    await store.saveProfile(profile, uuid(863)); await store.close(); auth.corrupt();
    const returned = await h.open(), repair = auth.make(returned);
    expect((await repair.recover()).localAccess).toBe('authorized');
    const before = auth.row(); auth.setOffered(authBundle(uuid(999), uuid(964)));
    expect(await repair.exchange(authInput)).toMatchObject({ phase: 'local_only', localAccess: 'authorized', syncReady: false });
    expect(auth.row()).toEqual(before);
    expect((await returned.pendingCommands()).map(value => value.operationId)).toEqual([uuid(863)]);
    const namespace = syntheticAccountNamespace(h.owner);
    h.protectedRows.set(namespace.protected, { revision: 99, value: { state: 'authorized', binding: { accountId: uuid(999) } } });
    expect(await auth.make(returned).recover()).toMatchObject({ phase: 'recovery_required', localAccess: 'locked' });
    await expect(returned.profile()).rejects.toThrow('authorization is locked');
    await returned.close();
  });

  it('keeps ordinary access expiry local-only and permits fresh same-account sign-in after durable logout', async () => {
    const h = accountHarness(testOwner(880)), auth = coordinatorHarness(h.owner);
    const store = await h.open(), first = auth.make(store);
    expect((await first.exchange(authInput)).syncReady).toBe(true);
    await store.saveProfile(profile, uuid(883)); await store.close();
    auth.expireAccess();
    const expired = await h.open(), old = auth.make(expired);
    expect(await old.recover()).toMatchObject({ phase: 'local_only', localAccess: 'authorized', code: 'ACCESS_EXPIRED' });
    expect(await expired.profile()).toEqual(profile);
    expect(await old.logoutOrSwitch()).toMatchObject({ phase: 'logged_out', localAccess: 'locked' });
    await expect(expired.profile()).rejects.toThrow('authorization is locked');
    await expired.close();
    const returned = await h.open(), fresh = auth.make(returned);
    expect(await fresh.recover()).toMatchObject({ phase: 'locked', localAccess: 'locked' });
    auth.setOffered(authBundle(h.owner.accountId, uuid(965)));
    expect((await fresh.exchange(authInput)).syncReady).toBe(true);
    expect(await returned.profile()).toEqual(profile);
    expect((await returned.pendingCommands()).map(value => value.operationId)).toEqual([uuid(883)]);
    await returned.close();
  });

  it('stops delayed UUID acknowledgement after lock and recovers its own queue on verified return', async () => {
    const h = accountHarness(testOwner(870)), store = await h.open(); await h.verified(store); await store.saveProfile(profile, uuid(873));
    const [command] = await store.pendingCommands();
    let resolve!: (outcome: OperationOutcome) => void;
    const delayed = new Promise<OperationOutcome>(done => { resolve = done; });
    const sent: string[] = [], views: string[] = [];
    const transport = { identity: async () => h.owner.accountId, command: async (item: Command) => { sent.push(item.operationId); return delayed; }, profile: async () => ({ revision: 0, document: null }), session: async () => ({ revision: 0, document: null }), close: () => undefined };
    const sender = new SyncSender(store, transport, async () => (await store.latch!.inspect()).state === 'authorized', view => views.push(view.connection));
    const running = sender.runOnce();
    await vi.waitFor(() => expect(sent).toEqual([uuid(873)]));
    sender.stop(); expect(await store.latch!.lock()).toBe(true);
    resolve(outcomeFor(command, h.owner.accountId, 'committed'));
    await running;
    await expect(store.syncSummary()).rejects.toThrow('authorization is locked');
    await store.close();
    const returned = await h.open(); await h.verified(returned, uuid(874));
    const acknowledgements: string[] = [];
    const retry = new SyncSender(returned, { ...transport, command: async item => { acknowledgements.push(item.operationId); return outcomeFor(item, h.owner.accountId, 'committed'); } }, async () => true, () => undefined);
    await retry.runOnce(true);
    expect(acknowledgements).toEqual([uuid(873)]);
    expect((await returned.syncSummary()).acknowledged).toBe(1);
    expect(views.at(-1)).not.toBe('confirmed');
    retry.stop(); await returned.close();
  });
});

describe('UUID-owned synthetic account repository and durable local latch', () => {
  it('uses a separate validated namespace even when the UUID equals fixture A and reuses repository transactions across restart', async () => {
    const owner = { ...testOwner(700), accountId: '11111111-1111-4111-8111-111111111111' };
    const h = accountHarness(owner), namespace = syntheticAccountNamespace(owner);
    expect(namespace.database).not.toBe('fitquest-m1a-synthetic-A.db');
    expect(namespace.key).not.toBe('fitquest.m1a.fixture.A.dbkey');
    expect(() => syntheticAccountNamespace({ ...owner, environment: '../fixture' })).toThrow();
    const store = await h.open();
    await expect(store.profile()).rejects.toThrow('authorization is locked');
    expect(await h.verified(store)).toMatchObject({ state: 'authorized' });
    await store.saveProfile(profile, uuid(703));
    await store.saveSession(session, uuid(704));
    await store.saveDraft('result:unfinished', '{"reps":"unknown"}', 1);
    const commands = await store.pendingCommands();
    expect(commands.map(command => command.operationId)).toEqual([uuid(703), uuid(704)]);
    await store.close();
    const reopened = await h.open();
    expect(await reopened.profile()).toEqual(profile);
    expect(await reopened.sessions()).toEqual([session]);
    expect(await reopened.draft('result:unfinished')).toBe('{"reps":"unknown"}');
    expect(await reopened.pendingCommands()).toEqual(commands);
    const first = await reopened.takeNextSyncWork();
    expect(first?.command.operationId).toBe(uuid(703));
    await reopened.applySyncOutcome(uuid(703), outcomeFor(first!.command, owner.accountId, 'committed'));
    expect((await reopened.takeNextSyncWork())?.command.operationId).toBe(uuid(704));
    await reopened.close();
    await expect(h.open(testOwner(710))).rejects.toThrow('Trusted account context changed');
  });

  it('rejects wrong keys, missing metadata, and unknown migration without replacing retained files', async () => {
    for (const [number, mutation] of [[720, 'missing-key'], [730, 'wrong-key'], [740, 'missing-metadata'], [750, 'unknown-migration']] as const) {
      const h = accountHarness(testOwner(number)), namespace = syntheticAccountNamespace(h.owner);
      const original = await h.open(); await h.verified(original); await original.saveProfile(profile, uuid(number + 3)); await original.close();
      const key = h.keys.get(namespace.key)!;
      if (mutation === 'missing-key') h.keys.delete(namespace.key);
      if (mutation === 'wrong-key') h.keys.set(namespace.key, 'b'.repeat(64));
      if (mutation === 'missing-metadata' || mutation === 'unknown-migration') {
        const db = await h.resources.openDatabase(namespace.database);
        await db.execAsync(`PRAGMA key = '${key}'`);
        await db.runAsync(mutation === 'missing-metadata' ? 'DELETE FROM store_metadata' : "UPDATE migrations SET checksum='invalid' WHERE version=4");
      }
      await expect(h.open()).rejects.toThrow(mutation === 'missing-key' ? 'Encryption key missing' : mutation === 'wrong-key' ? 'Wrong encrypted database key' : mutation === 'missing-metadata' ? 'ownership mismatch' : 'Unknown or changed local migration');
      expect(h.seen.has(namespace.database)).toBe(true);
      if (mutation === 'missing-key' || mutation === 'wrong-key') {
        h.keys.set(namespace.key, key);
        const restored = await h.open(); expect(await restored.profile()).toEqual(profile); await restored.close();
      }
    }
  });

  const interruptionCases: Array<{ name: string; prior: boolean; write: LatchWrite; phase: LatchPhase; number: number }> = [];
  const writePhases: Array<[LatchWrite, LatchPhase[]]> = [
    ['protected_locked', ['before_protected_write', 'after_protected_write', 'after_protected_readback']],
    ['sqlite_locked', ['before_latch_write', 'after_latch_write', 'after_latch_commit', 'after_latch_readback']],
    ['protected_authorized', ['before_protected_write', 'after_protected_write', 'after_protected_readback']],
    ['sqlite_authorized', ['before_latch_write', 'after_latch_write', 'after_latch_commit', 'after_latch_readback']],
  ];
  for (const prior of [false, true]) for (const [write, phases] of writePhases) for (const phase of phases) {
    const number = 1100 + interruptionCases.length * 10;
    interruptionCases.push({ name: `${prior ? 'reauthorize' : 'initial'} ${write} ${phase}`, prior, write, phase, number });
  }
  it.each(interruptionCases)('$name: restart observes only complete matching authorization', async ({ prior, write, phase, number }) => {
    const h = accountHarness(testOwner(number)), store = await h.open();
    const oldSession = uuid(number + 6), newSession = uuid(number + 7);
    if (prior) {
      expect(await h.verified(store, oldSession)).toMatchObject({ state: 'authorized' });
      await store.saveProfile(profile, uuid(number + 3));
      await store.saveSession({ ...session, id: uuid(number + 4) }, uuid(number + 5));
      await store.saveDraft('retained:input', '{"reps":"unknown"}', 1);
    }
    h.setFault((at, target) => { if (at === phase && target === write) throw new Error('Injected exact-stage interruption'); });
    await expect(store.latch!.authorize({ accountId: h.owner.accountId, sessionId: newSession, credentialGeneration: 2 }, h.owner.environment, h.owner.localEpoch, () => true)).rejects.toThrow('Injected exact-stage interruption');
    await store.close(); h.setFault(() => undefined);
    const restarted = await h.open();
    const status = await restarted.latch!.inspect();
    const oldBindingUnchanged = prior && write === 'protected_locked' && phase === 'before_protected_write';
    const committedButUnacknowledged = write === 'sqlite_authorized' && (phase === 'after_latch_commit' || phase === 'after_latch_readback');
    if (oldBindingUnchanged || committedButUnacknowledged) {
      expect(status).toMatchObject({ state: 'authorized', binding: { sessionId: oldBindingUnchanged ? oldSession : newSession } });
    } else {
      expect(status).toMatchObject({ state: 'locked' });
      await expect(restarted.profile()).rejects.toThrow('authorization is locked');
      expect(await h.verified(restarted, newSession)).toMatchObject({ state: 'authorized' });
    }
    if (prior) {
      expect(await restarted.profile()).toEqual(profile);
      expect((await restarted.sessions()).map(value => value.id)).toEqual([uuid(number + 4)]);
      expect(await restarted.draft('retained:input')).toBe('{"reps":"unknown"}');
      expect((await restarted.pendingCommands()).map(value => value.operationId)).toEqual([uuid(number + 3), uuid(number + 5)]);
    }
    await restarted.close();
  });

  it.each([
    { write: 'protected_locked', phase: 'after_protected_write', number: 1420, acknowledged: false },
    { write: 'sqlite_locked', phase: 'after_latch_commit', number: 1430, acknowledged: false },
    { write: 'protected_authorized', phase: 'after_protected_write', number: 1440, acknowledged: false },
    { write: 'sqlite_authorized', phase: 'after_latch_commit', number: 1450, acknowledged: true },
  ] as const)('$write actual readback failure retains the committed boundary', async ({ write, phase, number, acknowledged }) => {
    const h = accountHarness(testOwner(number)), store = await h.open();
    const namespace = syntheticAccountNamespace(h.owner);
    h.setFault((at, target) => {
      if (at !== phase || target !== write) return;
      if (write.startsWith('protected')) h.failProtectedRead();
      else (SQLite as unknown as { __failNextLatchRead(name: string): void }).__failNextLatchRead(namespace.database);
    });
    await expect(h.verified(store, uuid(number + 6))).rejects.toThrow(write.startsWith('protected') ? 'protected readback failure' : 'SQLite latch readback failure');
    await store.close(); h.setFault(() => undefined);
    const restarted = await h.open();
    expect(await restarted.latch!.inspect()).toMatchObject({ state: acknowledged ? 'authorized' : 'locked' });
    if (!acknowledged) expect(await h.verified(restarted, uuid(number + 6))).toMatchObject({ state: 'authorized' });
    await restarted.close();
  });

  it.each([
    { write: 'protected_authorized', phase: 'after_protected_write', number: 1460 },
    { write: 'sqlite_authorized', phase: 'after_latch_commit', number: 1470 },
  ] as const)('logout wins a delayed $write callback after its durable write', async ({ write, phase, number }) => {
    const h = accountHarness(testOwner(number)), store = await h.open();
    await h.verified(store, uuid(number + 6));
    await store.saveProfile(profile, uuid(number + 3));
    await store.saveDraft('retained:input', '{"reps":"kept"}', 1);
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.setFault(async (at, target) => { if (at === phase && target === write) { entered(); await gate; } });
    const delayed = store.latch!.authorize({ accountId: h.owner.accountId, sessionId: uuid(number + 7), credentialGeneration: 2 }, h.owner.environment, 1, () => true);
    await reached;
    const logout = store.latch!.lock();
    await expect(store.saveDraft('retained:input', 'stale', 2)).rejects.toThrow('authorization is locked');
    release();
    await expect(delayed).rejects.toThrow();
    expect(await logout).toBe(true);
    await store.close(); h.setFault(() => undefined);
    const restarted = await h.open();
    expect(await restarted.latch!.inspect()).toMatchObject({ state: 'locked' });
    expect(await h.verified(restarted, uuid(number + 8))).toMatchObject({ state: 'authorized' });
    expect(await restarted.profile()).toEqual(profile);
    expect(await restarted.draft('retained:input')).toBe('{"reps":"kept"}');
    expect((await restarted.pendingCommands()).map(value => value.operationId)).toEqual([uuid(number + 3)]);
    await restarted.close();
  });

  it('a newer epoch rolls back a delayed SQLite authorized transaction and rejects old facts', async () => {
    const h = accountHarness(testOwner(1480)), store = await h.open();
    await h.verified(store, uuid(1486)); await store.saveProfile(profile, uuid(1483));
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.setFault(async (at, write) => { if (at === 'after_latch_write' && write === 'sqlite_authorized') { entered(); await gate; } });
    const delayed = store.latch!.authorize({ accountId: h.owner.accountId, sessionId: uuid(1487), credentialGeneration: 2 }, h.owner.environment, 1, () => true);
    await reached;
    h.setEpoch(2);
    release();
    await expect(delayed).rejects.toThrow('Stale local transition');
    await expect(store.saveProfile({ ...profile, displayName: 'stale' }, uuid(1484))).rejects.toThrow('authorization is locked');
    await store.close(); h.setFault(() => undefined);
    const newer = await h.open({ ...h.owner, localEpoch: 2 });
    expect(await newer.latch!.inspect()).toMatchObject({ state: 'locked' });
    expect(await newer.latch!.authorize({ accountId: h.owner.accountId, sessionId: uuid(1488), credentialGeneration: 1 }, h.owner.environment, 2, () => true)).toMatchObject({ state: 'authorized' });
    expect(await newer.profile()).toEqual(profile);
    expect((await newer.pendingCommands()).map(value => value.operationId)).toEqual([uuid(1483)]);
    await newer.close();
  });

  it('invalidates live work before logout, retains data, and reports incomplete logout if both writes fail', async () => {
    const h = accountHarness(testOwner(810)), store = await h.open();
    await h.verified(store); await store.saveProfile(profile, uuid(813));
    h.setFault(phase => { if (phase === 'before_latch_write') throw new Error('Latch unavailable'); });
    h.failProtected(true);
    let stops = 0, switches = 0;
    const transition = new DurableAccountSwitch(() => { stops++; store.latch!.invalidate(); }, () => store.latch!.lock());
    const result = transition.switchTo(async () => { switches++; });
    expect(stops).toBe(1);
    expect(await result).toBe('logout_incomplete');
    expect(switches).toBe(0);
    await expect(store.profile()).rejects.toThrow('authorization is locked');
    // Neither durable side acknowledged the first lock; retry the same transition.
    h.failProtected(false); h.setFault(() => undefined);
    expect(await transition.switchTo(async () => { switches++; })).toBe('complete');
    expect(stops).toBe(1); expect(switches).toBe(1);
    expect(await transition.switchTo(async () => { switches++; })).toBe('complete');
    expect(switches).toBe(1);
    await store.close();
    const restarted = await h.open();
    await expect(restarted.profile()).rejects.toThrow('authorization is locked');
    await restarted.close();
    const locked = await h.open();
    await expect(locked.profile()).rejects.toThrow('authorization is locked');
    expect(await h.verified(locked, uuid(814))).toMatchObject({ state: 'authorized' });
    expect(await locked.profile()).toEqual(profile);
    await locked.close();
  });

  it('retries a thrown lock and coalesces concurrent destinations through the same live latch', async () => {
    const h = accountHarness(testOwner(815)), store = await h.open();
    await h.verified(store); await store.saveProfile(profile, uuid(818));
    let calls = 0, stops = 0, destination = '';
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const transition = new DurableAccountSwitch(() => { stops++; store.latch!.invalidate(); }, async () => {
      calls++;
      if (calls === 1) throw new Error('Protected storage temporarily unavailable');
      await gate;
      return store.latch!.lock();
    });
    expect(await transition.switchTo(async () => { destination = 'stale'; })).toBe('logout_incomplete');
    await expect(store.profile()).rejects.toThrow('authorization is locked');
    const first = transition.switchTo(async () => { destination = 'first'; });
    const second = transition.switchTo(async () => { destination = 'latest'; });
    expect(stops).toBe(1);
    release();
    expect(await first).toBe('complete'); expect(await second).toBe('complete');
    expect(calls).toBe(2); expect(destination).toBe('latest');
    await store.close();
    const reopened = await h.open(); await expect(reopened.profile()).rejects.toThrow('authorization is locked'); await reopened.close();
  });

  it('does not replay a destination callback that failed after durable old-account lock', async () => {
    const h = accountHarness(testOwner(825)), store = await h.open();
    await h.verified(store); await store.saveProfile(profile, uuid(828));
    let callbacks = 0, locks = 0;
    const transition = new DurableAccountSwitch(() => store.latch!.invalidate(), async () => { locks++; return store.latch!.lock(); });
    expect(await transition.switchTo(async () => { callbacks++; throw new Error('Destination initialization failed after a partial effect'); })).toBe('destination_failed');
    expect(await transition.switchTo(async () => { callbacks++; })).toBe('destination_failed');
    expect(callbacks).toBe(1); expect(locks).toBe(1);
    await expect(store.profile()).rejects.toThrow('authorization is locked');
    await store.close();
    const reopened = await h.open(); await expect(reopened.profile()).rejects.toThrow('authorization is locked'); await reopened.close();
  });

  it('rejects foreign store metadata and a newer epoch while retaining old account work', async () => {
    const h = accountHarness(testOwner(830)), store = await h.open();
    await h.verified(store); await store.saveProfile(profile, uuid(833)); await store.close();
    const namespace = syntheticAccountNamespace(h.owner), key = h.keys.get(namespace.key)!;
    const db = await h.resources.openDatabase(namespace.database); await db.execAsync(`PRAGMA key = '${key}'`);
    await db.runAsync('UPDATE store_metadata SET store_id=?', uuid(999));
    await expect(h.open()).rejects.toThrow('ownership mismatch');
    await db.runAsync('UPDATE store_metadata SET store_id=?', h.owner.storeId);
    h.setEpoch(2);
    await expect(h.open()).rejects.toThrow('Trusted account context changed');
    const newer = await h.open({ ...h.owner, localEpoch: 2 });
    await expect(newer.profile()).rejects.toThrow('authorization is locked');
    expect(await newer.latch!.authorize({ accountId: h.owner.accountId, sessionId: uuid(834), credentialGeneration: 1 }, h.owner.environment, 2, () => true)).toMatchObject({ state: 'authorized' });
    expect(await newer.profile()).toEqual(profile);
    await newer.close();
  });
  it('rejects changed environment, account, and installation metadata in the encrypted store', async () => {
    for (const [number, column] of [[890, 'environment'], [900, 'account_id'], [910, 'install_instance_id']] as const) {
      const h = accountHarness(testOwner(number)), store = await h.open();
      await h.verified(store); await store.saveProfile(profile, uuid(number + 3)); await store.close();
      const namespace = syntheticAccountNamespace(h.owner), key = h.keys.get(namespace.key)!;
      const db = await h.resources.openDatabase(namespace.database); await db.execAsync(`PRAGMA key = '${key}'`);
      await db.runAsync(`UPDATE store_metadata SET ${column}=?`, column === 'environment' ? 'test_foreign' : uuid(999));
      await expect(h.open()).rejects.toThrow('ownership mismatch');
      await db.runAsync(`UPDATE store_metadata SET ${column}=?`, column === 'environment' ? h.owner.environment : column === 'account_id' ? h.owner.accountId : h.owner.installInstanceId);
      const intact = await h.open(); expect(await intact.profile()).toEqual(profile); await intact.close();
    }
  });
  it('keeps restart access locked when either durable lock side writes successfully', async () => {
    for (const [number, failure] of [[930, 'latch'], [940, 'protected']] as const) {
      const h = accountHarness(testOwner(number)), store = await h.open();
      await h.verified(store); await store.saveProfile(profile, uuid(number + 3));
      if (failure === 'latch') h.setFault(phase => { if (phase === 'before_latch_write') throw new Error('Latch fault'); });
      else h.failProtected(true);
      expect(await store.latch!.lock()).toBe(true);
      await store.close(); h.setFault(() => undefined); h.failProtected(false);
      const restarted = await h.open();
      await expect(restarted.profile()).rejects.toThrow('authorization is locked');
      expect(await h.verified(restarted, uuid(number + 4))).toMatchObject({ state: 'authorized' });
      expect(await restarted.profile()).toEqual(profile);
      await restarted.close();
    }
  });
  it('does not let an older verification callback authorize a newer epoch', async () => {
    const h = accountHarness(testOwner(950)), store = await h.open();
    let release!: (value: boolean) => void;
    h.authority.verify = async () => new Promise(resolve => { release = resolve; });
    const pending = store.latch!.authorize({ accountId: h.owner.accountId, sessionId: uuid(953), credentialGeneration: 1 }, h.owner.environment, 1, () => true);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    h.setEpoch(2); release(true);
    expect(await pending).toMatchObject({ state: 'locked' });
    await store.close();
    const newer = await h.open({ ...h.owner, localEpoch: 2 });
    expect(await newer.latch!.inspect()).toMatchObject({ state: 'locked' });
    await newer.close();
  });
});
