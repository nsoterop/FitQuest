import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { CommandSchema, ProfileSchema, ResultSchema, SessionSchema, validateSessionTransition, type Command, type Profile, type Session } from '@fitquest-rebuild/contracts';
import { fixtureAccessBoundary, type AccountAccessBoundary, type FixtureId } from './access';

const schema = `CREATE TABLE owner (environment TEXT NOT NULL, account_id TEXT NOT NULL);
CREATE TABLE migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);
CREATE TABLE projections (kind TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY(kind,id));
CREATE TABLE revisions (kind TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT NOT NULL, operation_id TEXT NOT NULL UNIQUE, captured_at TEXT NOT NULL, PRIMARY KEY(kind,id,revision));
CREATE TABLE commands (operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, aggregate_id TEXT NOT NULL, ordinal INTEGER NOT NULL, depends_on TEXT, content TEXT NOT NULL, state TEXT NOT NULL CHECK(state='queued'));
CREATE TABLE drafts (id TEXT PRIMARY KEY, raw TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TRIGGER revisions_immutable_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'immutable revision'); END;
CREATE TRIGGER revisions_immutable_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'immutable revision'); END;
CREATE TRIGGER commands_immutable_update BEFORE UPDATE ON commands BEGIN SELECT RAISE(ABORT,'immutable command'); END;
CREATE TRIGGER commands_immutable_delete BEFORE DELETE ON commands BEGIN SELECT RAISE(ABORT,'immutable command'); END;`;
export const localMigrationV1Sql = schema;
const draftMigration = 'ALTER TABLE drafts ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;';
const environment = 'm1a.synthetic.v1';
const keyOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const nameFor = (id: FixtureId) => `fitquest-m1a-synthetic-${id}.db`;
const keyFor = (id: FixtureId) => `fitquest.m1a.fixture.${id}.dbkey`;
type ProjectionRow = { revision: number; document: string };
type CommandRow = { operation_id: string; content: string };
export type DraftRecord = { raw: string; sequence: number };
export type FailurePhase = 'after_projection' | 'after_revision' | 'after_command';

async function verifyMetadata(db: SQLite.SQLiteDatabase, account: FixtureId, checksums: readonly string[]) {
  const rows = await db.getAllAsync<{ version: number; checksum: string }>('SELECT version,checksum FROM migrations ORDER BY version');
  if (rows.length < 1 || rows.length > checksums.length || rows.some((row, i) => row.version !== i + 1 || row.checksum !== checksums[i])) throw new Error('Unknown or changed local migration');
  const owner = await db.getFirstAsync<{ environment: string; account_id: string }>('SELECT environment,account_id FROM owner');
  const owners = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM owner');
  if (owners?.n !== 1 || owner?.environment !== environment || owner.account_id !== account) throw new Error('Local store ownership mismatch');
}

export class LocalStore {
  private pending: Promise<unknown> = Promise.resolve();
  private closed = false;
  private failOnce: FailurePhase | null = null;
  private constructor(private db: SQLite.SQLiteDatabase, private key: string, readonly account: FixtureId, readonly generation: number, private access: AccountAccessBoundary<FixtureId>) {}

  static async open(account: FixtureId, generation: number, access: AccountAccessBoundary<FixtureId> = fixtureAccessBoundary): Promise<LocalStore> {
    if (!__DEV__) throw new Error('Synthetic stores are unavailable in this build');
    await access.assertLocalAccess(account, generation);
    const name = nameFor(account);
    const file = new File(SQLite.defaultDatabaseDirectory, name);
    const existed = file.exists;
    let key = await SecureStore.getItemAsync(keyFor(account));
    if (!key && existed) throw new Error('Encryption key missing; existing records have not been removed');
    if (!key) {
      const bytes = await Crypto.getRandomBytesAsync(32);
      key = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
      await SecureStore.setItemAsync(keyFor(account), key, keyOptions);
    }
    const db = await SQLite.openDatabaseAsync(name, { useNewConnection: true });
    try {
      // The key is generated hex only; no user text is interpolated into PRAGMA.
      await db.execAsync(`PRAGMA key = '${key}'`);
      const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
      if (!cipher?.cipher_version) throw new Error('SQLCipher is unavailable in this native build');
      await db.getFirstAsync('SELECT count(*) AS n FROM sqlite_master'); // Forces wrong-key detection.
      await db.execAsync('PRAGMA foreign_keys = ON');
      await db.execAsync('PRAGMA journal_mode = WAL');
      await db.execAsync('PRAGMA synchronous = FULL');
      const checksums = await Promise.all([schema, draftMigration].map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
      await db.withExclusiveTransactionAsync(async tx => {
        // Expo's exclusive transaction opens a second native connection. It needs its own key.
        await tx.execAsync(`PRAGMA key = '${key}'`);
        const table = await tx.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'");
        if (!table) {
          if (existed) throw new Error('Existing database has no migration ledger');
          await tx.execAsync(schema);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 1, checksums[0]);
          await tx.runAsync('INSERT INTO owner(environment,account_id) VALUES(?,?)', environment, account);
        }
        await verifyMetadata(tx, account, checksums);
        const version = await tx.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM migrations');
        if (version?.version === 1) {
          await tx.execAsync(draftMigration);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 2, checksums[1]);
        }
        await verifyMetadata(tx, account, checksums);
      });
      await access.assertLocalAccess(account, generation);
      return new LocalStore(db, key, account, generation, access);
    } catch (error) { await db.closeAsync(); throw error; }
  }

  private async guard() {
    if (this.closed) throw new Error('Store closed');
    await this.access.assertLocalAccess(this.account, this.generation);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.pending.then(fn, fn);
    this.pending = next.then(() => undefined, () => undefined);
    return next;
  }
  injectFailureOnce(phase: FailurePhase) { if (!__DEV__) throw new Error('Unavailable'); this.failOnce = phase; }
  private fail(phase: FailurePhase) { if (this.failOnce === phase) { this.failOnce = null; throw new Error(`Injected local write failure: ${phase}`); } }
  async close() { await this.pending; this.closed = true; await this.db.closeAsync(); }

  async profile(): Promise<Profile | null> {
    await this.guard();
    const row = await this.db.getFirstAsync<ProjectionRow>("SELECT revision,document FROM projections WHERE kind='profile' AND id='profile'");
    return row ? ProfileSchema.parse(JSON.parse(row.document)) : null;
  }
  async sessions(): Promise<Session[]> {
    await this.guard();
    const rows = await this.db.getAllAsync<{ document: string }>("SELECT document FROM projections WHERE kind='session' ORDER BY json_extract(document,'$.startedAt') DESC");
    return rows.map(row => SessionSchema.parse(JSON.parse(row.document)));
  }
  async draft(id: string): Promise<string | null> {
    return (await this.draftRecord(id))?.raw ?? null;
  }
  async draftRecord(id: string): Promise<DraftRecord | null> {
    await this.guard();
    return this.db.getFirstAsync<DraftRecord>('SELECT raw,sequence FROM drafts WHERE id=?', id);
  }
  async saveDraft(id: string, raw: string, sequence?: number): Promise<number> {
    return this.serial(async () => {
      await this.guard();
      const previous = await this.draftRecord(id);
      const next = sequence ?? (previous?.sequence ?? 0) + 1;
      if (!Number.isSafeInteger(next) || next < 0) throw new Error('Invalid draft sequence');
      await this.db.runAsync('INSERT INTO drafts(id,raw,updated_at,sequence) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET raw=excluded.raw,updated_at=excluded.updated_at,sequence=excluded.sequence WHERE excluded.sequence > drafts.sequence', id, raw, new Date().toISOString(), next);
      await this.guard();
      const saved = await this.draftRecord(id);
      return saved?.sequence ?? -1;
    });
  }
  async pendingCommands(): Promise<Command[]> {
    await this.guard();
    const rows = await this.db.getAllAsync<{ content: string }>("SELECT content FROM commands WHERE state='queued' ORDER BY ordinal");
    return rows.map(row => CommandSchema.parse(JSON.parse(row.content)));
  }

  /** Developer-only, synthetic-store native checks. Adds one no-op profile revision. */
  async runNativeChecks(): Promise<string[]> {
    if (!__DEV__) throw new Error('Unavailable');
    await this.guard();
    const findings: string[] = [];
    const cipher = await this.db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (!cipher?.cipher_version) throw new Error('SQLCipher absent');
    findings.push(`SQLCipher ${cipher.cipher_version}`);
    const checksums = await Promise.all([schema, draftMigration].map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
    await verifyMetadata(this.db, this.account, checksums);
    findings.push('Owner and migration ledger verified');
    for (const failure of ['owner', 'migration'] as const) {
      try {
        await this.db.withExclusiveTransactionAsync(async tx => {
          await tx.execAsync(`PRAGMA key = '${this.key}'`);
          if (failure === 'owner') await tx.runAsync("UPDATE owner SET account_id='wrong-synthetic-owner'");
          else await tx.runAsync("UPDATE migrations SET checksum='wrong-synthetic-checksum'");
          await verifyMetadata(tx, this.account, checksums);
          throw new Error(`Metadata check did not reject ${failure}`);
        });
      } catch (error) {
        if (!String(error).includes(failure === 'owner' ? 'ownership mismatch' : 'local migration')) throw error;
      }
      await verifyMetadata(this.db, this.account, checksums);
      findings.push(`${failure} mismatch rejected; original metadata retained`);
    }
    const profile = await this.profile();
    if (!profile) throw new Error('Save a synthetic profile before native checks');
    const count = async () => {
      const projection = await this.db.getFirstAsync<{ revision: number }>("SELECT revision FROM projections WHERE kind='profile' AND id='profile'");
      const history = await this.db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM revisions WHERE kind='profile'");
      const commands = await this.db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM commands WHERE kind='profile'");
      return [projection?.revision, history?.n, commands?.n].join('/');
    };
    for (const phase of ['after_projection', 'after_revision', 'after_command'] as const) {
      const before = await count();
      this.injectFailureOnce(phase);
      try { await this.saveProfile(profile, Crypto.randomUUID()); throw new Error(`Failure injection did not fail at ${phase}`); }
      catch (error) { if (!String(error).includes('Injected local write failure')) throw error; }
      if (await count() !== before) throw new Error(`Partial commit after ${phase}`);
      findings.push(`Rollback ${phase}: no partial revision or command`);
    }
    const before = await count(), operation = Crypto.randomUUID();
    await this.saveProfile(profile, operation);
    const after = await count();
    await this.saveProfile(profile, operation);
    if (await count() !== after || before === after) throw new Error('Retry idempotence failed');
    findings.push('Repeated operation ID added one revision and command');
    const draftId = `diagnostic:${Crypto.randomUUID()}`, raw = '{"repetitions":"invalid raw text"}';
    const commandsBeforeDraft = (await this.pendingCommands()).length;
    await this.saveDraft(draftId, raw);
    if (await this.draft(draftId) !== raw || (await this.pendingCommands()).length !== commandsBeforeDraft) throw new Error('Draft separation failed');
    findings.push('Invalid raw draft persisted without a command');
    const reopened = await LocalStore.open(this.account, this.generation, this.access);
    try {
      if (await reopened.draft(draftId) !== raw || !(await reopened.pendingCommands()).some(c => c.operationId === operation)) throw new Error('Reopen durability failed');
    } finally { await reopened.close(); }
    findings.push('Reopen recovered draft and pending command');
    for (const mode of ['missing', 'wrong'] as const) {
      const wrong = await SQLite.openDatabaseAsync(nameFor(this.account), { useNewConnection: true });
      try {
        if (mode === 'wrong') await wrong.execAsync("PRAGMA key = 'definitely-wrong-synthetic-key'");
        let rejected = false;
        try { await wrong.getFirstAsync('SELECT count(*) AS n FROM owner'); } catch { rejected = true; }
        if (!rejected) throw new Error(`${mode} key unexpectedly opened records`);
      } finally { await wrong.closeAsync(); }
      findings.push(`${mode} key rejected without modifying original records`);
    }
    if (!(await this.profile())) throw new Error('Original store unavailable after wrong-key checks');
    return findings;
  }

  async saveProfile(profile: Profile, operationId: string): Promise<void> {
    return this.save('profile', 'profile', ProfileSchema.parse(profile), operationId);
  }
  async saveProfileFromDraft(profile: Profile, operationId: string, draftId: string, sequence: number): Promise<void> {
    return this.save('profile', 'profile', ProfileSchema.parse(profile), operationId, { id: draftId, sequence });
  }
  async saveSession(session: Session, operationId: string): Promise<void> {
    return this.save('session', session.id, SessionSchema.parse(session), operationId);
  }
  async saveSessionFromDraft(session: Session, operationId: string, draftId: string, sequence: number): Promise<void> {
    return this.save('session', session.id, SessionSchema.parse(session), operationId, { id: draftId, sequence });
  }
  /** Complete a persisted editor intent in the same transaction as its fact and command. */
  async saveResultFromDraft(sessionId: string, activityId: string, result: Session['activities'][number]['results'][number], operationId: string, draftId: string, sequence: number): Promise<void> {
    return this.serial(async () => {
      await this.guard();
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard();
        const row = await tx.getFirstAsync<ProjectionRow>("SELECT revision,document FROM projections WHERE kind='session' AND id=?", sessionId);
        if (!row) throw new Error('Session not found');
        const previous = SessionSchema.parse(JSON.parse(row.document));
        const activity = previous.activities.find(a => a.id === activityId);
        if (!activity) throw new Error('Activity not found');
        const old = activity.results.find(r => r.id === result.id);
        if (old && old.kind !== result.kind) throw new Error('Saved result kind cannot change');
        if (!old && (previous.status !== 'started' || activity.outcome !== 'started')) throw new Error('Finished activity only permits corrections');
        const next = SessionSchema.parse({ ...previous, activities: previous.activities.map(a => a.id !== activityId ? a : { ...a, results: old ? a.results.map(r => r.id === result.id ? result : r) : [...a.results, result] }) });
        const existing = await tx.getFirstAsync<CommandRow>('SELECT operation_id,content FROM commands WHERE operation_id=?', operationId);
        if (existing) {
          const command = CommandSchema.parse(JSON.parse(existing.content));
          const saved = command.kind === 'session.put' && command.payload.activities.find(a => a.id === activityId)?.results.find(r => r.id === result.id);
          if (command.kind !== 'session.put' || command.payload.id !== sessionId || JSON.stringify(saved) !== JSON.stringify(ResultSchema.parse(result))) throw new Error('Operation ID reused with different content');
        } else {
          const draft = await tx.getFirstAsync<DraftRecord>('SELECT raw,sequence FROM drafts WHERE id=?', draftId);
          if (!draft || draft.sequence < sequence) throw new Error('Durable result intent is missing');
          if (draft.sequence === sequence) {
            let intent: { operationId?: string; sessionId?: string; activityId?: string; result?: unknown };
            try { intent = JSON.parse(draft.raw) as typeof intent; } catch { throw new Error('Durable result intent is invalid'); }
            if (intent.operationId !== operationId || intent.sessionId !== sessionId || intent.activityId !== activityId || JSON.stringify(ResultSchema.parse(intent.result)) !== JSON.stringify(ResultSchema.parse(result))) throw new Error('Durable result intent does not match save');
          }
          await this.write(tx, 'session', sessionId, next, operationId, row);
        }
        // A newer edit survives this commit. Retain the sequence as a tombstone so a late older write cannot recreate the draft.
        await tx.runAsync("UPDATE drafts SET raw='',updated_at=? WHERE id=? AND sequence=?", new Date().toISOString(), draftId, sequence);
        await this.guard();
      });
      await this.guard();
    });
  }
  private async finalizeDraft(tx: SQLite.SQLiteDatabase, draft: { id: string; sequence: number }) {
    await tx.runAsync("UPDATE drafts SET raw='',updated_at=? WHERE id=? AND sequence=?", new Date().toISOString(), draft.id, draft.sequence);
  }
  private async save(kind: 'profile' | 'session', id: string, document: Profile | Session, operationId: string, draft?: { id: string; sequence: number }): Promise<void> {
    return this.serial(async () => {
      await this.guard();
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard();
        const existing = await tx.getFirstAsync<CommandRow>('SELECT operation_id,content FROM commands WHERE operation_id=?', operationId);
        if (existing) {
          const prior = CommandSchema.parse(JSON.parse(existing.content));
          if (prior.kind !== `${kind}.put` || JSON.stringify(prior.payload) !== JSON.stringify(document)) throw new Error('Operation ID reused with different content');
          if (draft) await this.finalizeDraft(tx, draft);
          return;
        }
        const current = await tx.getFirstAsync<ProjectionRow>('SELECT revision,document FROM projections WHERE kind=? AND id=?', kind, id);
        if (kind === 'session') {
          const profile = await tx.getFirstAsync('SELECT 1 FROM projections WHERE kind=? AND id=?', 'profile', 'profile');
          if (!profile) throw new Error('Profile must be saved before sessions');
          validateSessionTransition(current ? SessionSchema.parse(JSON.parse(current.document)) : null, document as Session);
        }
        await this.write(tx, kind, id, document, operationId, current);
        if (draft) await this.finalizeDraft(tx, draft);
        await this.guard();
      });
      await this.guard();
    });
  }
  private async write(tx: SQLite.SQLiteDatabase, kind: 'profile' | 'session', id: string, document: Profile | Session, operationId: string, current: ProjectionRow | null): Promise<void> {
        if (kind === 'session') validateSessionTransition(current ? SessionSchema.parse(JSON.parse(current.document)) : null, document as Session);
        const revision = (current?.revision ?? 0) + 1;
        const command = CommandSchema.parse({ contractVersion: 1, operationId, kind: `${kind}.put`, expectedRevision: revision - 1, payload: document });
        const priorCommand = await tx.getFirstAsync<{ operation_id: string }>('SELECT operation_id FROM commands WHERE kind=? AND aggregate_id=? ORDER BY ordinal DESC LIMIT 1', kind, id);
        const profileCommand = kind === 'session' ? await tx.getFirstAsync<{ operation_id: string }>("SELECT operation_id FROM commands WHERE kind='profile' ORDER BY ordinal LIMIT 1") : null;
        const dependency = priorCommand?.operation_id ?? profileCommand?.operation_id ?? null;
        const capturedAt = new Date().toISOString();
        await tx.runAsync('INSERT INTO projections(kind,id,revision,document) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,document=excluded.document', kind, id, revision, JSON.stringify(document));
        this.fail('after_projection');
        await tx.runAsync('INSERT INTO revisions(kind,id,revision,document,operation_id,captured_at) VALUES(?,?,?,?,?,?)', kind, id, revision, JSON.stringify(document), operationId, capturedAt);
        this.fail('after_revision');
        await tx.runAsync('INSERT INTO commands(operation_id,kind,aggregate_id,ordinal,depends_on,content,state) VALUES(?,?,?,?,?,?,?)', operationId, kind, id, revision, dependency, JSON.stringify(command), 'queued');
        this.fail('after_command');
        await this.guard();
  }
}
