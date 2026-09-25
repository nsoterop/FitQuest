import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { CommandSchema, OperationOutcomeSchema, ProfileSchema, ProfileSnapshotSchema, ResultSchema, SessionSchema, SessionSnapshotSchema, canonicalCommand, commandTarget, validateSessionTransition, type Command, type OperationOutcome, type Profile, type Session } from '@fitquest-rebuild/contracts';
import { fixtureAccessBoundary, type AccountAccessBoundary, type FixtureId } from './access';
import { fixtureStoreIdentity, SyntheticAccountStoreSchema, syntheticAccountNamespace, type SyntheticAccountStore } from './ownership';
import { SyntheticLocalLatch, type ProtectedRecordPort, type SyntheticIdentityAuthority, type LatchFault } from './auth/localLatch';

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
const syncMigration = `CREATE TABLE sync_delivery (operation_id TEXT PRIMARY KEY REFERENCES commands(operation_id), state TEXT NOT NULL CHECK(state IN ('queued','sending','outcome_unknown','acknowledged','blocked','superseded')), attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, outcome TEXT, replacement_of TEXT, replaced_by TEXT, resolution TEXT);
CREATE TABLE sync_bases (kind TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL, document TEXT, operation_id TEXT, PRIMARY KEY(kind,id));
CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO sync_meta(key,value) VALUES('edit_sequence',0);
INSERT INTO sync_delivery(operation_id,state) SELECT operation_id,'queued' FROM commands;`;
const accountMigration = `CREATE TABLE store_metadata (id INTEGER PRIMARY KEY CHECK(id=1), environment TEXT NOT NULL, account_id TEXT NOT NULL, store_id TEXT NOT NULL, install_instance_id TEXT NOT NULL);
CREATE TABLE local_auth_latch (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);`;
const keyOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const nameFor = (id: FixtureId) => fixtureStoreIdentity(id).database;
const keyFor = (id: FixtureId) => fixtureStoreIdentity(id).key;
type ProjectionRow = { revision: number; document: string };
type CommandRow = { operation_id: string; content: string };
type DeliveryRow = { operation_id: string; content: string; depends_on: string | null; state: DeliveryState; attempts: number; next_attempt_at: string | null };
export type DeliveryState = 'queued' | 'sending' | 'outcome_unknown' | 'acknowledged' | 'blocked' | 'superseded';
export type SyncWork = { command: Command; state: DeliveryState; attempts: number };
export type SyncSummary = { pending: number; sending: number; unknown: number; blocked: number; acknowledged: number };
export type RecoveryReview<Account extends string = FixtureId> = { account: Account; generation: number; editSequence: number; kind: 'profile' | 'session'; id: string; local: Profile | Session | null; base: { revision: number; document: Profile | Session | null } | null; server: { revision: number; document: Profile | Session | null }; blockedIds: string[] };
export type DraftRecord = { raw: string; sequence: number };
export type FailurePhase = 'after_projection' | 'after_revision' | 'after_command';

async function verifyMetadata(db: SQLite.SQLiteDatabase, environment: string, account: string, checksums: readonly string[]) {
  const rows = await db.getAllAsync<{ version: number; checksum: string }>('SELECT version,checksum FROM migrations ORDER BY version');
  if (rows.length < 1 || rows.length > checksums.length || rows.some((row, i) => row.version !== i + 1 || row.checksum !== checksums[i])) throw new Error('Unknown or changed local migration');
  const owner = await db.getFirstAsync<{ environment: string; account_id: string }>('SELECT environment,account_id FROM owner');
  const owners = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM owner');
  if (owners?.n !== 1 || owner?.environment !== environment || owner.account_id !== account) throw new Error('Local store ownership mismatch');
}

async function verifyAccountMetadata(db: SQLite.SQLiteDatabase, owner: SyntheticAccountStore) {
  const row = await db.getFirstAsync<{ environment: string; account_id: string; store_id: string; install_instance_id: string }>('SELECT environment,account_id,store_id,install_instance_id FROM store_metadata WHERE id=1');
  const count = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM store_metadata');
  if (count?.n !== 1 || row?.environment !== owner.environment || row.account_id !== owner.accountId || row.store_id !== owner.storeId || row.install_instance_id !== owner.installInstanceId) throw new Error('Local store ownership mismatch');
}

export interface SyntheticStoreResources {
  exists(name: string): boolean;
  readKey(key: string): Promise<string | null>;
  writeKey(key: string, value: string): Promise<void>;
  openDatabase(name: string): Promise<SQLite.SQLiteDatabase>;
  randomKey(): Promise<string>;
}

export class LocalStore<Account extends string = FixtureId> {
  private pending: Promise<unknown> = Promise.resolve();
  private closed = false;
  private failOnce: FailurePhase | null = null;
  private failSyncAckOnce = false;
  private constructor(private db: SQLite.SQLiteDatabase, private key: string, readonly account: Account, readonly generation: number, readonly serverAccountId: string, private readonly assertAccess: (db?: SQLite.SQLiteDatabase) => Promise<void>, readonly latch: SyntheticLocalLatch | null = null, private readonly fixtureAccess?: AccountAccessBoundary<FixtureId>) {}

  static async open(account: FixtureId, generation: number, access: AccountAccessBoundary<FixtureId> = fixtureAccessBoundary): Promise<LocalStore<FixtureId>> {
    if (!__DEV__) throw new Error('Synthetic stores are unavailable in this build');
    fixtureStoreIdentity(account);
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
      const checksums = await Promise.all([schema, draftMigration, syncMigration].map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
      await db.withExclusiveTransactionAsync(async tx => {
        // Expo's exclusive transaction opens a second native connection. It needs its own key.
        await tx.execAsync(`PRAGMA key = '${key}'`);
        const table = await tx.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'");
        if (!table) {
          if (existed) throw new Error('Existing database has no migration ledger');
          await tx.execAsync(schema);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 1, checksums[0]);
          await tx.runAsync('INSERT INTO owner(environment,account_id) VALUES(?,?)', 'm1a.synthetic.v1', account);
        }
        await verifyMetadata(tx, 'm1a.synthetic.v1', account, checksums);
        const version = await tx.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM migrations');
        if (version?.version === 1) {
          await tx.execAsync(draftMigration);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 2, checksums[1]);
        }
        const afterDraft = await tx.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM migrations');
        if (afterDraft?.version === 2) {
          await tx.execAsync(syncMigration);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 3, checksums[2]);
        }
        await verifyMetadata(tx, 'm1a.synthetic.v1', account, checksums);
      });
      await access.assertLocalAccess(account, generation);
      return new LocalStore(db, key, account, generation, fixtureStoreIdentity(account).serverAccountId, () => access.assertLocalAccess(account, generation), null, access);
    } catch (error) { await db.closeAsync(); throw error; }
  }

  /** Invented UUID-owned stores only. No runtime UI or real-account adapter calls this entrypoint. */
  static async openSyntheticAccountTest(rawOwner: SyntheticAccountStore, resources: SyntheticStoreResources, protectedPort: ProtectedRecordPort, authority: SyntheticIdentityAuthority, fault?: LatchFault): Promise<LocalStore<string>> {
    if (!__DEV__) throw new Error('Synthetic account test stores are unavailable in this build');
    const owner = SyntheticAccountStoreSchema.parse(rawOwner);
    if (!authority.current(owner)) throw new Error('Trusted account context changed');
    const namespace = syntheticAccountNamespace(owner), existed = resources.exists(namespace.database);
    let key = await resources.readKey(namespace.key);
    if (!key && existed) throw new Error('Encryption key missing; existing records have not been removed');
    if (!key) { key = await resources.randomKey(); if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid encryption key'); await resources.writeKey(namespace.key, key); }
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid encryption key');
    const db = await resources.openDatabase(namespace.database);
    try {
      await db.execAsync(`PRAGMA key = '${key}'`);
      const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
      if (!cipher?.cipher_version) throw new Error('SQLCipher is unavailable in this native build');
      await db.getFirstAsync('SELECT count(*) AS n FROM sqlite_master');
      await db.execAsync('PRAGMA foreign_keys = ON');
      await db.execAsync('PRAGMA journal_mode = WAL');
      await db.execAsync('PRAGMA synchronous = FULL');
      const checksums = await Promise.all([schema, draftMigration, syncMigration, accountMigration].map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
      await db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${key}'`);
        const table = await tx.getFirstAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'");
        if (!table) {
          if (existed) throw new Error('Existing database has no migration ledger');
          await tx.execAsync(schema);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 1, checksums[0]);
          await tx.runAsync('INSERT INTO owner(environment,account_id) VALUES(?,?)', owner.environment, owner.accountId);
          await tx.execAsync(draftMigration);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 2, checksums[1]);
          await tx.execAsync(syncMigration);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 3, checksums[2]);
          await tx.execAsync(accountMigration);
          await tx.runAsync('INSERT INTO migrations(version,checksum) VALUES(?,?)', 4, checksums[3]);
          await tx.runAsync('INSERT INTO store_metadata(id,environment,account_id,store_id,install_instance_id) VALUES(1,?,?,?,?)', owner.environment, owner.accountId, owner.storeId, owner.installInstanceId);
        }
        await verifyMetadata(tx, owner.environment, owner.accountId, checksums);
        const version = await tx.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM migrations');
        if (version?.version !== 4) throw new Error('Incomplete account-store migration');
        await verifyAccountMetadata(tx, owner);
      });
      if (!authority.current(owner)) throw new Error('Trusted account context changed');
      const latch = new SyntheticLocalLatch(owner, db, key, protectedPort, authority, fault);
      return new LocalStore(db, key, owner.accountId, owner.localEpoch, owner.accountId, database => latch.assertAuthorized(database), latch);
    } catch (error) { await db.closeAsync(); throw error; }
  }

  private async guard(database?: SQLite.SQLiteDatabase) {
    if (this.closed) throw new Error('Store closed');
    await this.assertAccess(database);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.pending.then(fn, fn);
    this.pending = next.then(() => undefined, () => undefined);
    return next;
  }
  injectFailureOnce(phase: FailurePhase) { if (!__DEV__) throw new Error('Unavailable'); this.failOnce = phase; }
  injectSyncAcknowledgementFailureOnce() { if (!__DEV__) throw new Error('Unavailable'); this.failSyncAckOnce = true; }
  private fail(phase: FailurePhase) { if (this.failOnce === phase) { this.failOnce = null; throw new Error(`Injected local write failure: ${phase}`); } }
  async close() { await this.pending; this.closed = true; await this.db.closeAsync(); }

  async profile(): Promise<Profile | null> {
    await this.guard();
    const row = await this.db.getFirstAsync<ProjectionRow>("SELECT revision,document FROM projections WHERE kind='profile' AND id='profile'");
    await this.guard();
    return row ? ProfileSchema.parse(JSON.parse(row.document)) : null;
  }
  async sessions(): Promise<Session[]> {
    await this.guard();
    const rows = await this.db.getAllAsync<{ document: string }>("SELECT document FROM projections WHERE kind='session' ORDER BY json_extract(document,'$.startedAt') DESC");
    await this.guard();
    return rows.map(row => SessionSchema.parse(JSON.parse(row.document)));
  }
  async draft(id: string): Promise<string | null> {
    return (await this.draftRecord(id))?.raw ?? null;
  }
  async draftRecord(id: string): Promise<DraftRecord | null> {
    await this.guard();
    const row = await this.db.getFirstAsync<DraftRecord>('SELECT raw,sequence FROM drafts WHERE id=?', id);
    await this.guard();
    return row;
  }
  async saveDraft(id: string, raw: string, sequence?: number): Promise<number> {
    return this.serial(async () => {
      await this.guard();
      const previous = await this.draftRecord(id);
      const next = sequence ?? (previous?.sequence ?? 0) + 1;
      if (!Number.isSafeInteger(next) || next < 0) throw new Error('Invalid draft sequence');
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard(tx);
        const written = await tx.runAsync('INSERT INTO drafts(id,raw,updated_at,sequence) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET raw=excluded.raw,updated_at=excluded.updated_at,sequence=excluded.sequence WHERE excluded.sequence > drafts.sequence', id, raw, new Date().toISOString(), next);
        if (written.changes > 0) await tx.runAsync("UPDATE sync_meta SET value=value+1 WHERE key='edit_sequence'");
        await this.guard(tx);
      });
      await this.guard();
      const saved = await this.draftRecord(id);
      return saved?.sequence ?? -1;
    });
  }
  async pendingCommands(): Promise<Command[]> {
    await this.guard();
    const rows = await this.db.getAllAsync<{ content: string }>("SELECT c.content FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id WHERE d.state NOT IN ('acknowledged','superseded') ORDER BY c.rowid");
    await this.guard();
    return rows.map(row => CommandSchema.parse(JSON.parse(row.content)));
  }

  async syncSummary(): Promise<SyncSummary> {
    await this.guard();
    const rows = await this.db.getAllAsync<{ state: DeliveryState; n: number }>('SELECT state,count(*) AS n FROM sync_delivery GROUP BY state');
    await this.guard();
    const count = (state: DeliveryState) => rows.find(row => row.state === state)?.n ?? 0;
    return { pending: count('queued') + count('sending') + count('outcome_unknown') + count('blocked'), sending: count('sending'), unknown: count('outcome_unknown'), blocked: count('blocked'), acknowledged: count('acknowledged') };
  }

  /** A process death cannot establish whether a sent request committed. */
  async recoverInterruptedSends(): Promise<void> {
    return this.serial(async () => {
      await this.guard();
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard(tx);
        await tx.runAsync("UPDATE sync_delivery SET state='outcome_unknown',next_attempt_at=NULL WHERE state='sending'");
        await this.guard(tx);
      });
      await this.guard();
    });
  }

  async takeNextSyncWork(force = false): Promise<SyncWork | null> {
    return this.serial(async () => {
      await this.guard();
      let selected: SyncWork | null = null;
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard(tx);
        const rows = await tx.getAllAsync<DeliveryRow>(`SELECT c.operation_id,c.content,c.depends_on,d.state,d.attempts,d.next_attempt_at
          FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id
          WHERE d.state IN ('queued','outcome_unknown') ORDER BY c.rowid`);
        for (const row of rows) {
          if (!force && row.next_attempt_at && row.next_attempt_at > new Date().toISOString()) continue;
          if (row.depends_on) {
            const dependency = await tx.getFirstAsync<{ state: DeliveryState }>('SELECT state FROM sync_delivery WHERE operation_id=?', row.depends_on);
            if (dependency?.state !== 'acknowledged') continue;
          }
          const updated = await tx.runAsync("UPDATE sync_delivery SET state='sending',attempts=attempts+1,next_attempt_at=NULL WHERE operation_id=? AND state IN ('queued','outcome_unknown')", row.operation_id);
          if (updated.changes === 1) selected = { command: CommandSchema.parse(JSON.parse(row.content)), state: row.state, attempts: row.attempts + 1 };
          break;
        }
        await this.guard(tx);
      });
      return selected;
    });
  }

  async markOutcomeUnknown(operationId: string): Promise<void> {
    return this.serial(async () => {
      await this.guard();
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard(tx);
        const row = await tx.getFirstAsync<{ attempts: number }>("SELECT attempts FROM sync_delivery WHERE operation_id=? AND state='sending'", operationId);
        if (!row) return;
        const delay = Math.min(60_000, 2_000 * 2 ** Math.min(row.attempts - 1, 5));
        await tx.runAsync("UPDATE sync_delivery SET state='outcome_unknown',next_attempt_at=? WHERE operation_id=? AND state='sending'", new Date(Date.now() + delay).toISOString(), operationId);
        await this.guard(tx);
      });
      await this.guard();
    });
  }

  async blockProtocolFailure(operationId: string, code: string): Promise<void> {
    return this.serial(async () => {
      await this.guard();
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard(tx);
        await tx.runAsync("UPDATE sync_delivery SET state='blocked',resolution=? WHERE operation_id=? AND state='sending'", code, operationId);
        await tx.runAsync(`WITH RECURSIVE children(operation_id) AS (
          SELECT operation_id FROM commands WHERE depends_on=?
          UNION ALL SELECT c.operation_id FROM commands c JOIN children p ON c.depends_on=p.operation_id
        ) UPDATE sync_delivery SET state='blocked' WHERE operation_id IN (SELECT operation_id FROM children) AND state NOT IN ('acknowledged','superseded')`, operationId);
        await this.guard(tx);
      });
    });
  }

  async applySyncOutcome(operationId: string, raw: OperationOutcome): Promise<void> {
    const outcome = OperationOutcomeSchema.parse(raw);
    return this.serial(async () => {
      await this.guard();
      const row = await this.db.getFirstAsync<{ content: string }>('SELECT content FROM commands WHERE operation_id=?', operationId);
      if (!row) throw new Error('Unknown local operation');
      const command = CommandSchema.parse(JSON.parse(row.content));
      const target = commandTarget(command);
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalCommand(command));
      if (outcome.accountId !== this.serverAccountId || outcome.operationId !== operationId || outcome.kind !== command.kind || outcome.aggregateId !== target.id || outcome.requestHash !== hash) throw new Error('Mismatched sync outcome');
      if (outcome.state === 'committed' && (outcome.receipt.accountId !== this.serverAccountId || outcome.receipt.operationId !== operationId || outcome.receipt.kind !== command.kind || outcome.receipt.aggregateId !== target.id || outcome.receipt.requestHash !== hash || outcome.receipt.revision !== command.expectedRevision + 1)) throw new Error('Mismatched sync receipt');
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard(tx);
        const delivery = await tx.getFirstAsync<{ state: DeliveryState; outcome: string | null }>('SELECT state,outcome FROM sync_delivery WHERE operation_id=?', operationId);
        if (!delivery || delivery.state === 'superseded') throw new Error('Sync operation superseded');
        if (delivery.state === 'acknowledged' || delivery.state === 'blocked') {
          if (delivery.outcome !== JSON.stringify(outcome)) throw new Error('Terminal local outcome mismatch');
          return;
        }
        if (delivery.state !== 'sending' && delivery.state !== 'outcome_unknown') throw new Error('Sync outcome arrived without a send');
        if (outcome.state === 'committed') {
          const base = await tx.getFirstAsync<{ revision: number }>('SELECT revision FROM sync_bases WHERE kind=? AND id=?', target.kind, target.id);
          if (base && base.revision !== command.expectedRevision) throw new Error('Receipt does not follow acknowledged base');
          if (!base && command.expectedRevision !== 0) throw new Error('Missing acknowledged predecessor');
          await tx.runAsync('INSERT INTO sync_bases(kind,id,revision,document,operation_id) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,document=excluded.document,operation_id=excluded.operation_id', target.kind, target.id, outcome.receipt.revision, JSON.stringify(command.payload), operationId);
          if (this.failSyncAckOnce) { this.failSyncAckOnce = false; throw new Error('Injected local acknowledgement failure'); }
          await tx.runAsync("UPDATE sync_delivery SET state='acknowledged',outcome=?,next_attempt_at=NULL WHERE operation_id=?", JSON.stringify(outcome), operationId);
        } else {
          await tx.runAsync("UPDATE sync_delivery SET state='blocked',outcome=?,next_attempt_at=NULL WHERE operation_id=?", JSON.stringify(outcome), operationId);
          await tx.runAsync(`WITH RECURSIVE children(operation_id) AS (
            SELECT operation_id FROM commands WHERE depends_on=?
            UNION ALL SELECT c.operation_id FROM commands c JOIN children p ON c.depends_on=p.operation_id
          ) UPDATE sync_delivery SET state='blocked',next_attempt_at=NULL
          WHERE operation_id IN (SELECT operation_id FROM children) AND state NOT IN ('acknowledged','superseded')`, operationId);
        }
        await this.guard(tx);
      });
    });
  }

  async recoveryTargets(): Promise<Array<{ kind: 'profile' | 'session'; id: string }>> {
    await this.guard();
    const rows = await this.db.getAllAsync<{ kind: 'profile' | 'session'; id: string }>("SELECT DISTINCT c.kind,c.aggregate_id AS id FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id WHERE d.state='blocked' ORDER BY c.kind,c.aggregate_id");
    await this.guard();
    return rows;
  }

  async prepareRecovery(kind: 'profile' | 'session', id: string, rawServer: { revision: number; document: Profile | Session | null }): Promise<RecoveryReview<Account>> {
    await this.guard();
    const server = kind === 'profile' ? ProfileSnapshotSchema.parse(rawServer) : SessionSnapshotSchema.parse(rawServer);
    const localRow = await this.db.getFirstAsync<ProjectionRow>('SELECT revision,document FROM projections WHERE kind=? AND id=?', kind, id);
    const baseRow = await this.db.getFirstAsync<{ revision: number; document: string | null }>('SELECT revision,document FROM sync_bases WHERE kind=? AND id=?', kind, id);
    const meta = await this.db.getFirstAsync<{ value: number }>("SELECT value FROM sync_meta WHERE key='edit_sequence'");
    const blocked = await this.db.getAllAsync<{ operation_id: string }>("SELECT c.operation_id FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id WHERE c.kind=? AND c.aggregate_id=? AND d.state='blocked' ORDER BY c.rowid", kind, id);
    await this.guard();
    if (!meta || !blocked.length) throw new Error('No blocked local work to review');
    const parse = (document: string | null) => document === null ? null : kind === 'profile' ? ProfileSchema.parse(JSON.parse(document)) : SessionSchema.parse(JSON.parse(document));
    return { account: this.account, generation: this.generation, editSequence: meta.value, kind, id, local: parse(localRow?.document ?? null), base: baseRow ? { revision: baseRow.revision, document: parse(baseRow.document) } : null, server, blockedIds: blocked.map(row => row.operation_id) };
  }

  async resolveRecovery(review: RecoveryReview<Account>, choice: 'apply_local' | 'adopt_server', replacementId: string): Promise<void> {
    return this.serial(async () => {
      await this.guard();
      if (review.account !== this.account || review.generation !== this.generation) throw new Error('LOCAL_RESOLUTION_STALE');
      await this.db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync(`PRAGMA key = '${this.key}'`);
        await this.guard(tx);
        const meta = await tx.getFirstAsync<{ value: number }>("SELECT value FROM sync_meta WHERE key='edit_sequence'");
        const blocked = await tx.getAllAsync<{ operation_id: string }>("SELECT c.operation_id FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id WHERE c.kind=? AND c.aggregate_id=? AND d.state='blocked' ORDER BY c.rowid", review.kind, review.id);
        if (meta?.value !== review.editSequence || JSON.stringify(blocked.map(row => row.operation_id)) !== JSON.stringify(review.blockedIds)) throw new Error('LOCAL_RESOLUTION_STALE');
        const unknown = await tx.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id WHERE c.kind=? AND c.aggregate_id=? AND d.state IN ('sending','outcome_unknown')", review.kind, review.id);
        if ((unknown?.n ?? 0) > 0) throw new Error('Resolve unknown operation outcome first');
        const current = await tx.getFirstAsync<ProjectionRow>('SELECT revision,document FROM projections WHERE kind=? AND id=?', review.kind, review.id);
        if (JSON.stringify(current?.document ? JSON.parse(current.document) : null) !== JSON.stringify(review.local)) throw new Error('LOCAL_RESOLUTION_STALE');
        if (choice === 'apply_local') {
          if (!review.local) throw new Error('No local record to apply');
          if (review.kind === 'session') validateSessionTransition(review.server.document as Session | null, review.local as Session);
        }
        await tx.runAsync("UPDATE sync_delivery SET state='superseded',replaced_by=?,resolution=? WHERE operation_id IN (SELECT c.operation_id FROM commands c WHERE c.kind=? AND c.aggregate_id=?) AND state='blocked'", choice === 'apply_local' ? replacementId : null, choice, review.kind, review.id);
        await tx.runAsync('INSERT INTO sync_bases(kind,id,revision,document,operation_id) VALUES(?,?,?,?,NULL) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,document=excluded.document,operation_id=NULL', review.kind, review.id, review.server.revision, review.server.document ? JSON.stringify(review.server.document) : null);
        if (choice === 'apply_local') {
          await this.write(tx, review.kind, review.id, review.local!, replacementId, current);
          await tx.runAsync('UPDATE sync_delivery SET replacement_of=? WHERE operation_id=?', review.blockedIds[0], replacementId);
        } else {
          if (review.server.document) {
            const history = await tx.getFirstAsync<{ revision: number | null }>('SELECT MAX(revision) AS revision FROM revisions WHERE kind=? AND id=?', review.kind, review.id);
            const revision = Math.max(current?.revision ?? 0, history?.revision ?? 0) + 1;
            await tx.runAsync('INSERT INTO projections(kind,id,revision,document) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,document=excluded.document', review.kind, review.id, revision, JSON.stringify(review.server.document));
            await tx.runAsync('INSERT INTO revisions(kind,id,revision,document,operation_id,captured_at) VALUES(?,?,?,?,?,?)', review.kind, review.id, revision, JSON.stringify(review.server.document), replacementId, new Date().toISOString());
          } else await tx.runAsync('DELETE FROM projections WHERE kind=? AND id=?', review.kind, review.id);
          await tx.runAsync("UPDATE sync_meta SET value=value+1 WHERE key='edit_sequence'");
        }
        await this.guard(tx);
      });
    });
  }

  /** Developer-only, synthetic-store native checks. Adds one no-op profile revision. */
  async runNativeChecks(): Promise<string[]> {
    if (!__DEV__) throw new Error('Unavailable');
    if ((this.account !== 'A' && this.account !== 'B') || !this.fixtureAccess) throw new Error('Fixture diagnostics only');
    const fixture = this.account as FixtureId;
    await this.guard();
    const findings: string[] = [];
    const cipher = await this.db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
    if (!cipher?.cipher_version) throw new Error('SQLCipher absent');
    findings.push(`SQLCipher ${cipher.cipher_version}`);
    const checksums = await Promise.all([schema, draftMigration, syncMigration].map(value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value)));
    await verifyMetadata(this.db, 'm1a.synthetic.v1', fixture, checksums);
    findings.push('Owner and migration ledger verified');
    for (const failure of ['owner', 'migration'] as const) {
      try {
        await this.db.withExclusiveTransactionAsync(async tx => {
          await tx.execAsync(`PRAGMA key = '${this.key}'`);
          if (failure === 'owner') await tx.runAsync("UPDATE owner SET account_id='wrong-synthetic-owner'");
          else await tx.runAsync("UPDATE migrations SET checksum='wrong-synthetic-checksum'");
          await verifyMetadata(tx, 'm1a.synthetic.v1', fixture, checksums);
          throw new Error(`Metadata check did not reject ${failure}`);
        });
      } catch (error) {
        if (!String(error).includes(failure === 'owner' ? 'ownership mismatch' : 'local migration')) throw error;
      }
      await verifyMetadata(this.db, 'm1a.synthetic.v1', fixture, checksums);
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
    const reopened = await LocalStore.open(fixture, this.generation, this.fixtureAccess);
    try {
      const savedCommand = await reopened.db.getFirstAsync<{ operation_id: string }>('SELECT operation_id FROM commands WHERE operation_id=?', [operation]);
      if (await reopened.draft(draftId) !== raw || savedCommand?.operation_id !== operation) throw new Error('Reopen durability failed');
    } finally { await reopened.close(); }
    findings.push('Reopen recovered draft and immutable command');
    for (const mode of ['missing', 'wrong'] as const) {
      const wrong = await SQLite.openDatabaseAsync(nameFor(fixture), { useNewConnection: true });
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
        await this.guard(tx);
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
        await this.guard(tx);
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
        await this.guard(tx);
        const existing = await tx.getFirstAsync<CommandRow>('SELECT operation_id,content FROM commands WHERE operation_id=?', operationId);
        if (existing) {
          const prior = CommandSchema.parse(JSON.parse(existing.content));
          if (prior.kind !== `${kind}.put` || JSON.stringify(prior.payload) !== JSON.stringify(document)) throw new Error('Operation ID reused with different content');
          if (draft) await this.finalizeDraft(tx, draft);
          await this.guard(tx);
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
        await this.guard(tx);
      });
      await this.guard();
    });
  }
  private async write(tx: SQLite.SQLiteDatabase, kind: 'profile' | 'session', id: string, document: Profile | Session, operationId: string, current: ProjectionRow | null): Promise<void> {
        if (kind === 'session') validateSessionTransition(current ? SessionSchema.parse(JSON.parse(current.document)) : null, document as Session);
        const history = await tx.getFirstAsync<{ revision: number | null }>('SELECT MAX(revision) AS revision FROM revisions WHERE kind=? AND id=?', kind, id);
        const revision = Math.max(current?.revision ?? 0, history?.revision ?? 0) + 1;
        const base = await tx.getFirstAsync<{ revision: number }>('SELECT revision FROM sync_bases WHERE kind=? AND id=?', kind, id);
        const outstanding = await tx.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id WHERE c.kind=? AND c.aggregate_id=? AND d.state NOT IN ('acknowledged','superseded')", kind, id);
        const command = CommandSchema.parse({ contractVersion: 1, operationId, kind: `${kind}.put`, expectedRevision: (base?.revision ?? 0) + (outstanding?.n ?? 0), payload: document });
        const priorCommand = await tx.getFirstAsync<{ operation_id: string; state: DeliveryState }>("SELECT c.operation_id,d.state FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id WHERE c.kind=? AND c.aggregate_id=? AND d.state NOT IN ('acknowledged','superseded') ORDER BY c.rowid DESC LIMIT 1", kind, id);
        const profileCommand = kind === 'session' && !await tx.getFirstAsync('SELECT 1 FROM sync_bases WHERE kind=? AND id=? AND revision>0 AND document IS NOT NULL', 'profile', 'profile') ? await tx.getFirstAsync<{ operation_id: string; state: DeliveryState }>("SELECT c.operation_id,d.state FROM commands c JOIN sync_delivery d ON d.operation_id=c.operation_id WHERE c.kind='profile' AND d.state NOT IN ('acknowledged','superseded') ORDER BY c.rowid DESC LIMIT 1") : null;
        const dependency = priorCommand?.operation_id ?? profileCommand?.operation_id ?? null;
        const capturedAt = new Date().toISOString();
        await tx.runAsync('INSERT INTO projections(kind,id,revision,document) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,document=excluded.document', kind, id, revision, JSON.stringify(document));
        this.fail('after_projection');
        await tx.runAsync('INSERT INTO revisions(kind,id,revision,document,operation_id,captured_at) VALUES(?,?,?,?,?,?)', kind, id, revision, JSON.stringify(document), operationId, capturedAt);
        this.fail('after_revision');
        await tx.runAsync('INSERT INTO commands(operation_id,kind,aggregate_id,ordinal,depends_on,content,state) VALUES(?,?,?,?,?,?,?)', operationId, kind, id, revision, dependency, JSON.stringify(command), 'queued');
        await tx.runAsync('INSERT INTO sync_delivery(operation_id,state) VALUES(?,?)', operationId, (priorCommand?.state === 'blocked' || profileCommand?.state === 'blocked') ? 'blocked' : 'queued');
        await tx.runAsync("UPDATE sync_meta SET value=value+1 WHERE key='edit_sequence'");
        this.fail('after_command');
        await this.guard(tx);
  }
}
