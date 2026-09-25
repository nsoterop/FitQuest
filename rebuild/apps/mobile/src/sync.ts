import type { Command, OperationOutcome, ProfileSnapshot, SessionSnapshot } from '@fitquest-rebuild/contracts';
import { z } from 'zod';
import type { RecoveryReview, SyncSummary, SyncWork } from './store';

export type SyncConnection = 'disabled' | 'no_records' | 'pending' | 'sending' | 'confirmed' | 'blocked' | 'unknown' | 'unavailable' | 'sign_in_needed';
export type SyncView = { connection: SyncConnection; summary: SyncSummary; message: string | null };
export class TransportError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }

export interface SyncTransport {
  identity(): Promise<string>;
  command(command: Command): Promise<OperationOutcome>;
  profile(): Promise<ProfileSnapshot>;
  session(id: string): Promise<SessionSnapshot>;
  close(): void;
}

export interface SyncStore<Account extends string = string> {
  readonly serverAccountId: string;
  readonly generation: number;
  recoverInterruptedSends(): Promise<void>;
  takeNextSyncWork(force?: boolean): Promise<SyncWork | null>;
  markOutcomeUnknown(operationId: string): Promise<void>;
  applySyncOutcome(operationId: string, outcome: OperationOutcome): Promise<void>;
  blockProtocolFailure(operationId: string, code: string): Promise<void>;
  syncSummary(): Promise<SyncSummary>;
  prepareRecovery(kind: 'profile' | 'session', id: string, server: ProfileSnapshot | SessionSnapshot): Promise<RecoveryReview<Account>>;
  resolveRecovery(review: RecoveryReview<Account>, choice: 'apply_local' | 'adopt_server', replacementId: string): Promise<void>;
}

export class SyncSender<Account extends string = string> {
  private stopped = false;
  private initialized = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private override: SyncConnection | null = null;
  constructor(private readonly store: SyncStore<Account>, private readonly transport: SyncTransport, private readonly eligible: () => Promise<boolean>, private readonly onView: (view: SyncView) => void) {
    z.uuid().parse(store.serverAccountId);
  }

  start() { if (this.stopped || this.timer) return; void this.runOnce(); this.timer = setInterval(() => { void this.runOnce(); }, 5000); }
  stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); this.timer = null; this.transport.close(); }
  async runOnce(force = false): Promise<void> {
    if (this.stopped) return;
    if (this.running) return this.running;
    this.running = this.perform(force).finally(() => { this.running = null; });
    return this.running;
  }
  private async emit() {
    if (this.stopped) return;
    try {
      const summary = await this.store.syncSummary();
      const connection = this.override ?? (summary.blocked ? 'blocked' : summary.unknown ? 'unknown' : summary.sending ? 'sending' : summary.pending ? 'pending' : summary.acknowledged ? 'confirmed' : 'no_records');
      if (!this.stopped) this.onView({ connection, summary, message: null });
    } catch { /* Closed or changed account; its view must not install. */ }
  }
  private async ensureOwner(): Promise<void> {
    if (this.stopped) throw new TransportError(0, 'TRANSPORT_CLOSED');
    const eligible = await this.eligible();
    if (this.stopped) throw new TransportError(0, 'TRANSPORT_CLOSED');
    if (!eligible) throw new TransportError(401, 'SIGN_IN_NEEDED');
    const verified = await this.transport.identity();
    if (this.stopped) throw new TransportError(0, 'TRANSPORT_CLOSED');
    if (verified !== this.store.serverAccountId) throw new TransportError(401, 'WRONG_ACCOUNT');
  }
  private async perform(force: boolean) {
    try {
      if (!this.initialized) { await this.store.recoverInterruptedSends(); if (this.stopped) return; this.initialized = true; }
      await this.ensureOwner();
      if (this.stopped) return;
      this.override = null;
      for (let n = 0; n < 25 && !this.stopped; n++) {
        const work = await this.store.takeNextSyncWork(force);
        if (this.stopped) return;
        if (!work) break;
        await this.emit();
        if (this.stopped) return;
        try {
          const eligible = await this.eligible();
          if (this.stopped) return;
          if (!eligible) {
            await this.store.markOutcomeUnknown(work.command.operationId);
            if (this.stopped) return;
            this.override = 'sign_in_needed'; break;
          }
          const outcome = await this.transport.command(work.command);
          if (this.stopped) return;
          await this.store.applySyncOutcome(work.command.operationId, outcome);
        } catch (error) {
          if (this.stopped) return;
          if (error instanceof TransportError && (error.code === 'OPERATION_ID_REUSED' || error.status === 400)) {
            await this.store.blockProtocolFailure(work.command.operationId, error.code);
            this.override = 'blocked';
          } else {
            await this.store.markOutcomeUnknown(work.command.operationId);
            this.override = error instanceof TransportError && error.status === 401 ? 'sign_in_needed' : 'unknown';
          }
          break;
        }
      }
    } catch (error) {
      if (!this.stopped) this.override = error instanceof TransportError && error.status === 401 ? 'sign_in_needed' : 'unavailable';
    } finally { await this.emit(); }
  }

  async review(kind: 'profile' | 'session', id: string): Promise<RecoveryReview<Account>> {
    if (this.stopped) throw new Error('Account sync stopped');
    await this.ensureOwner();
    let snapshot: ProfileSnapshot | SessionSnapshot;
    if (kind === 'profile') snapshot = await this.transport.profile();
    else {
      try { snapshot = await this.transport.session(id); }
      catch (error) { if (error instanceof TransportError && error.status === 404) snapshot = { revision: 0, document: null }; else throw error; }
    }
    if (this.stopped) throw new Error('Account sync stopped');
    return this.store.prepareRecovery(kind, id, snapshot);
  }
  async resolve(review: RecoveryReview<Account>, choice: 'apply_local' | 'adopt_server', replacementId: string) {
    if (this.stopped) throw new Error('Account sync stopped');
    await this.ensureOwner();
    if (this.stopped) throw new Error('Account sync stopped');
    await this.store.resolveRecovery(review, choice, replacementId);
    await this.runOnce(true);
  }
}
