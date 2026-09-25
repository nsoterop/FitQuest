import type * as SQLite from 'expo-sqlite';
import { ActiveIdentitySchema, LocalAuthorizationBindingSchema, type ActiveIdentity, type LocalAuthorizationBinding, type LocalAuthorizationResult } from '@fitquest-rebuild/contracts';
import { SyntheticAccountStoreSchema, syntheticAccountNamespace, type SyntheticAccountStore } from '../ownership';
import type { LocalAuthorizationPort, ExpectedLocalOwner, AuthFence } from './coordinator';

type ProtectedValue = { version: 1; state: 'locked'; binding: null } | { version: 1; state: 'authorized'; binding: LocalAuthorizationBinding };
export type ProtectedRow = { revision: number; value: unknown };
/** CAS and readback are required; an adapter must reject a stale revision at commit. */
export interface ProtectedRecordPort {
  read(key: string): Promise<ProtectedRow | null>;
  compareAndSwap(key: string, revision: number | null, value: ProtectedValue, guard: () => boolean): Promise<number>;
}
/** Explicit invented test authority. No screen label or descriptor grants authorization. */
export interface SyntheticIdentityAuthority {
  current(owner: SyntheticAccountStore): boolean;
  verify(owner: SyntheticAccountStore, identity: ActiveIdentity): Promise<boolean>;
}
export type LatchWrite = 'protected_locked' | 'sqlite_locked' | 'protected_authorized' | 'sqlite_authorized' | 'logout_sqlite_locked' | 'logout_protected_locked';
export type LatchPhase = 'before_latch_write' | 'after_latch_write' | 'after_latch_commit' | 'after_latch_readback'
  | 'before_protected_write' | 'after_protected_write' | 'after_protected_readback';
export type LatchFault = (phase: LatchPhase, write: LatchWrite) => void | Promise<void>;

const parseProtected = (row: ProtectedRow | null): ProtectedValue | null => {
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1) return null;
  const value = row.value;
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || (item.state !== 'locked' && item.state !== 'authorized')) return null;
  if (item.state === 'locked') return item.binding === null ? { version: 1, state: 'locked', binding: null } : null;
  const binding = LocalAuthorizationBindingSchema.safeParse(item.binding);
  return binding.success ? { version: 1, state: 'authorized', binding: binding.data } : null;
};
const same = (a: LocalAuthorizationBinding, b: LocalAuthorizationBinding) =>
  a.environment === b.environment && a.localEpoch === b.localEpoch && a.accountId === b.accountId && a.sessionId === b.sessionId && a.storeId === b.storeId && a.installInstanceId === b.installInstanceId;
const sameValue = (a: ProtectedValue | null, b: ProtectedValue) => a?.state === b.state && (a.state === 'locked' || b.state === 'authorized' && same(a.binding, b.binding));

/** Test-only protected record plus encrypted SQLite latch. Neither write is claimed atomic with the other. */
export class SyntheticLocalLatch implements LocalAuthorizationPort {
  private live = true;
  private transition: Promise<void> = Promise.resolve();
  readonly expectedOwner: ExpectedLocalOwner;
  constructor(
    private readonly owner: SyntheticAccountStore,
    private readonly db: SQLite.SQLiteDatabase,
    private readonly key: string,
    private readonly protectedPort: ProtectedRecordPort,
    private readonly authority: SyntheticIdentityAuthority,
    private readonly fault: LatchFault = () => undefined,
  ) {
    SyntheticAccountStoreSchema.parse(owner);
    this.expectedOwner = { accountId: owner.accountId, storeId: owner.storeId, installInstanceId: owner.installInstanceId, sessionId: null };
  }
  private get protectedKey() { return syntheticAccountNamespace(this.owner).protected; }
  private valid() { return this.live && this.authority.current(this.owner); }
  invalidate() { this.live = false; }
  current(fence: AuthFence) {
    return this.valid() && fence.environment === this.owner.environment && fence.localEpoch === this.owner.localEpoch
      && (fence.accountId === null || fence.accountId === this.owner.accountId);
  }
  private async serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.transition.then(work, work);
    this.transition = run.then(() => undefined, () => undefined);
    return run;
  }
  private async latch(database: SQLite.SQLiteDatabase = this.db): Promise<ProtectedValue | null> {
    const row = await database.getFirstAsync<{ value: string }>("SELECT value FROM local_auth_latch WHERE id=1");
    if (!row) return null;
    try { return parseProtected({ revision: 1, value: JSON.parse(row.value) }); } catch { return null; }
  }
  async inspect(database: SQLite.SQLiteDatabase = this.db): Promise<LocalAuthorizationResult> {
    if (!this.valid()) return { state: 'locked' };
    try {
      const [protectedRow, latch] = await Promise.all([this.protectedPort.read(this.protectedKey), this.latch(database)]);
      if (!this.valid()) return { state: 'locked' };
      const record = parseProtected(protectedRow);
      if (!record || !latch) return { state: 'locked' };
      if (record.state !== 'authorized' || latch.state !== 'authorized' || !same(record.binding, latch.binding)) return { state: 'locked' };
      const binding = record.binding;
      if (binding.environment !== this.owner.environment || binding.accountId !== this.owner.accountId || binding.storeId !== this.owner.storeId || binding.installInstanceId !== this.owner.installInstanceId || binding.localEpoch !== this.owner.localEpoch) return { state: 'locked' };
      return { state: 'authorized', binding };
    } catch { return { state: 'unavailable' }; }
  }
  async assertAuthorized(database: SQLite.SQLiteDatabase = this.db) {
    if ((await this.inspect(database)).state !== 'authorized') throw new Error('Local authorization is locked');
  }
  private async writeProtected(next: ProtectedValue, guard: () => boolean, write: LatchWrite) {
    if (!guard()) throw new Error('Stale local transition');
    const previous = await this.protectedPort.read(this.protectedKey);
    await this.fault('before_protected_write', write);
    const revision = await this.protectedPort.compareAndSwap(this.protectedKey, previous?.revision ?? null, next, guard);
    await this.fault('after_protected_write', write);
    const readback = await this.protectedPort.read(this.protectedKey);
    if (!guard() || readback?.revision !== revision || !sameValue(parseProtected(readback), next)) throw new Error('Protected authorization readback failed');
    await this.fault('after_protected_readback', write);
  }
  private async writeLatch(next: ProtectedValue, guard: () => boolean, write: LatchWrite) {
    await this.db.withExclusiveTransactionAsync(async tx => {
      await tx.execAsync(`PRAGMA key = '${this.key}'`);
      if (!guard()) throw new Error('Stale local transition');
      await this.fault('before_latch_write', write);
      await tx.runAsync('INSERT INTO local_auth_latch(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value', JSON.stringify(next));
      await this.fault('after_latch_write', write);
      if (!guard()) throw new Error('Stale local transition');
    });
    await this.fault('after_latch_commit', write);
    if (!guard() || !sameValue(await this.latch(), next)) throw new Error('SQLite authorization readback failed');
    await this.fault('after_latch_readback', write);
  }
  async authorize(identity: ActiveIdentity, environment: string, localEpoch: number, guard: () => boolean): Promise<LocalAuthorizationResult> {
    return this.serialized(async () => {
      const verified = ActiveIdentitySchema.parse(identity);
      const stillCurrent = () => guard() && this.valid();
      if (!stillCurrent() || environment !== this.owner.environment || localEpoch !== this.owner.localEpoch || verified.accountId !== this.owner.accountId || !await this.authority.verify(this.owner, verified) || !stillCurrent()) return { state: 'locked' };
      const binding: LocalAuthorizationBinding = { environment, localEpoch, accountId: verified.accountId, sessionId: verified.sessionId, storeId: this.owner.storeId, installInstanceId: this.owner.installInstanceId };
      const locked: ProtectedValue = { version: 1, state: 'locked', binding: null };
      await this.writeProtected(locked, stillCurrent, 'protected_locked');
      await this.writeLatch(locked, stillCurrent, 'sqlite_locked');
      const next: ProtectedValue = { version: 1, state: 'authorized', binding };
      await this.writeProtected(next, stillCurrent, 'protected_authorized');
      await this.writeLatch(next, stillCurrent, 'sqlite_authorized');
      return this.inspect();
    });
  }
  async lock(): Promise<boolean> {
    this.live = false; // Invalidate old callbacks and sender work before either durable write.
    return this.serialized(async () => {
      const locked: ProtectedValue = { version: 1, state: 'locked', binding: null };
      let latch = false, protectedWritten = false;
      try { await this.writeLatch(locked, () => true, 'logout_sqlite_locked'); latch = true; } catch { /* Try the independent protected record. */ }
      try { await this.writeProtected(locked, () => true, 'logout_protected_locked'); protectedWritten = true; } catch { /* Retained records and keys are never erased. */ }
      return latch || protectedWritten;
    });
  }
}
