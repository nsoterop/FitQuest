import {
  ActiveIdentitySchema, AppleExchangeSchema, LocalAuthorizationBindingSchema, PendingCredentialsSchema, PersistedCredentialsSchema,
  type ActiveIdentity, type AppleExchange, type LocalAuthorizationBinding, type LocalAuthorizationResult, type PendingCredentials, type PersistedCredentials,
} from '@fitquest-rebuild/contracts';

/** Server deadlines are authoritative. These are configurable client retry limits only. */
export const authRecoveryDefaults = { maxMemoryPersistenceAttempts: 2, maxCleanupAttempts: 1, maxPostDeadlineActivationChecks: 1 } as const;
export type AuthRecoveryLimits = { maxMemoryPersistenceAttempts: number; maxCleanupAttempts: number; maxPostDeadlineActivationChecks: number };
/** Proposal defaults for later adapters; this model never extends server deadlines. */
export const proposedAuthTimingDefaults = {
  challengeMs: 5 * 60_000, mobileExchangeTimeoutMs: 20_000, otherMobileApiTimeoutMs: 8_000,
  pendingActivationMs: 5 * 60_000, accessMs: 15 * 60_000,
  refreshInactivityMs: 30 * 24 * 60 * 60_000, absoluteSessionMs: 90 * 24 * 60 * 60_000,
} as const;
export type AuthPhase = 'locked' | 'local_only' | 'ready' | 'refresh_prepared' | 'activation_pending' | 'persistence_retry' | 'reauth_required' | 'recovery_required' | 'unavailable' | 'logout_incomplete' | 'logged_out';
export type AuthSnapshot = { phase: AuthPhase; localAccess: 'authorized' | 'locked'; syncReady: boolean; serverLogoutPending: boolean; code: 'ACCESS_EXPIRED' | 'AUTH_REAUTH_REQUIRED' | 'AUTH_RECOVERY_REQUIRED' | 'AUTH_UNAVAILABLE' | 'AUTH_INVALID' | 'SESSION_REVOKED' | 'LOCAL_LOCK_FAILED' | null };
export type AuthFence = { environment: string; localEpoch: number; accountId: string | null; sessionId: string | null; credentialGeneration: number | null };
export type ExpectedLocalOwner = { accountId: string | null; storeId: string | null; installInstanceId: string | null; sessionId: string | null };
export type StoredCredentials = { revision: number; value: unknown };

/** compareAndSwap must check expected revision and guard atomically at commit. */
export interface CredentialStoragePort {
  read(): Promise<StoredCredentials | null>;
  compareAndSwap(expectedRevision: number | null, next: PersistedCredentials, guard: () => boolean): Promise<number>;
}
export interface LocalAuthorizationPort {
  inspect(): Promise<LocalAuthorizationResult>;
  /** Durable protected/store acknowledgement; check guard at the final write boundary. */
  authorize(identity: ActiveIdentity, environment: string, localEpoch: number, guard: () => boolean): Promise<LocalAuthorizationResult>;
  /** Durable lock acknowledgement. A failed write must return false or reject. */
  lock(): Promise<boolean>;
}
export type RefreshOutcome =
  | { kind: 'credentials'; bundle: PendingCredentials }
  | { kind: 'reauth_required' } | { kind: 'invalid' } | { kind: 'unavailable' }
  | { kind: 'revoked'; sessionId: string };
export type ActivationOutcome =
  | { kind: 'active'; identity: ActiveIdentity; alreadyActive: boolean }
  | { kind: 'expired' } | { kind: 'invalid' } | { kind: 'unavailable' }
  | { kind: 'revoked'; sessionId: string };
export type ExchangeOutcome = { kind: 'credentials'; bundle: PendingCredentials } | { kind: 'unknown' } | { kind: 'unavailable' } | { kind: 'invalid' };
export type IdentityOutcome = { kind: 'active'; identity: ActiveIdentity } | { kind: 'invalid' } | { kind: 'unavailable' } | { kind: 'revoked'; sessionId: string };
export interface AuthTransportPort {
  exchange(input: AppleExchange): Promise<ExchangeOutcome>;
  refresh(operationId: string, refreshToken: string): Promise<RefreshOutcome>;
  activate(bundle: PendingCredentials): Promise<ActivationOutcome>;
  identity(bundle: PendingCredentials): Promise<IdentityOutcome>;
  revoke(revocationToken: string): Promise<'revoked' | 'unavailable'>;
}
export interface RecoveryPorts {
  now(): number;
  operationId(): string;
  /** Synchronous fence for environment, account, session, epoch and generation. */
  current(fence: AuthFence): boolean;
  /** Independently trusted store/install context; null only when that owner is not yet known. */
  expectedLocalOwner: ExpectedLocalOwner;
  credentials: CredentialStoragePort;
  local: LocalAuthorizationPort;
  transport: AuthTransportPort;
}

const safeIdentity = (value: unknown): ActiveIdentity | null => ActiveIdentitySchema.safeParse(value).data ?? null;
const sameIdentity = (identity: ActiveIdentity, bundle: PendingCredentials) => identity.accountId === bundle.accountId && identity.sessionId === bundle.sessionId && identity.credentialGeneration === bundle.credentialGeneration;
const matchesAuthorization = (result: LocalAuthorizationResult, environment: string, epoch: number, bundle: PendingCredentials): boolean => result.state === 'authorized' && result.binding.environment === environment && result.binding.localEpoch === epoch && result.binding.accountId === bundle.accountId && result.binding.sessionId === bundle.sessionId;
const clone = (value: PersistedCredentials): PersistedCredentials => PersistedCredentialsSchema.parse(value);

/** Pure protocol model. It has no native, fetch, file, or database implementation. */
export class CredentialRecoveryCoordinator {
  private record: PersistedCredentials | null = null;
  private revision: number | null = null;
  private stopped = false;
  private phase: AuthPhase = 'locked';
  private localAccess: 'authorized' | 'locked' = 'locked';
  private code: AuthSnapshot['code'] = null;
  private serverLogoutPending = false;
  private refreshFlight: Promise<AuthSnapshot> | null = null;
  private exchangeFlight: Promise<AuthSnapshot> | null = null;
  private memoryPending: { value: PersistedCredentials & { phase: 'activation_pending' }; attempts: number } | null = null;
  private cleanupCount = 0;
  private postDeadlineActivationChecks = 0;
  private retainedCorrupt = false;
  private retainedOwner: LocalAuthorizationBinding | null = null;
  constructor(private readonly environment: string, private readonly localEpoch: number, private readonly ports: RecoveryPorts, private readonly limits: AuthRecoveryLimits = authRecoveryDefaults) {}

  snapshot(): AuthSnapshot {
    const inScope = !this.stopped && this.ports.current(this.fence()) && this.trustedRepairOwnerCurrent();
    const phase = !inScope && !this.stopped ? this.retainedCorrupt ? 'recovery_required' : 'locked' : this.phase;
    const localAccess = inScope ? this.localAccess : 'locked';
    return { phase, localAccess, syncReady: inScope && phase === 'ready' && localAccess === 'authorized' && !!this.record && this.ports.now() < Date.parse(this.record.bundle.accessExpiresAt), serverLogoutPending: this.serverLogoutPending, code: phase === 'recovery_required' && !inScope ? 'AUTH_RECOVERY_REQUIRED' : this.code };
  }
  stop(): void { this.stopped = true; this.refreshFlight = null; this.exchangeFlight = null; this.memoryPending = null; }
  private fence(record = this.record): AuthFence {
    const owner = !record && this.retainedCorrupt ? this.retainedOwner : null;
    return { environment: this.environment, localEpoch: this.localEpoch, accountId: record?.bundle.accountId ?? owner?.accountId ?? null, sessionId: record?.bundle.sessionId ?? owner?.sessionId ?? null, credentialGeneration: record?.bundle.credentialGeneration ?? null };
  }
  private valid(captured: AuthFence): boolean {
    const current = this.fence();
    return !this.stopped && current.environment === captured.environment && current.localEpoch === captured.localEpoch && current.accountId === captured.accountId && current.sessionId === captured.sessionId && current.credentialGeneration === captured.credentialGeneration && this.trustedRepairOwnerCurrent() && this.ports.current(captured);
  }
  private set(phase: AuthPhase, code: AuthSnapshot['code'] = null) { if (!this.stopped) { this.phase = phase; this.code = code; } return this.snapshot(); }
  private guard(captured: AuthFence) { return () => this.valid(captured); }
  private validLocalBinding(local: LocalAuthorizationResult): boolean {
    if (local.state !== 'authorized') return true;
    const parsed = LocalAuthorizationBindingSchema.safeParse(local.binding);
    if (!parsed.success) return false;
    const binding = parsed.data, expected = this.ports.expectedLocalOwner;
    return binding.environment === this.environment && binding.localEpoch === this.localEpoch
      && (expected.accountId === null || binding.accountId === expected.accountId)
      && (expected.storeId === null || binding.storeId === expected.storeId)
      && (expected.installInstanceId === null || binding.installInstanceId === expected.installInstanceId)
      && (expected.sessionId === null || binding.sessionId === expected.sessionId);
  }
  private expectedAccountMatches(bundle: PendingCredentials): boolean { return this.ports.expectedLocalOwner.accountId === null || this.ports.expectedLocalOwner.accountId === bundle.accountId; }
  private completeIndependentOwner(local: LocalAuthorizationResult): local is { state: 'authorized'; binding: LocalAuthorizationBinding } {
    const expected = this.ports.expectedLocalOwner;
    return local.state === 'authorized' && this.validLocalBinding(local)
      && expected.accountId !== null && expected.storeId !== null && expected.installInstanceId !== null
      && local.binding.accountId === expected.accountId && local.binding.storeId === expected.storeId && local.binding.installInstanceId === expected.installInstanceId;
  }
  private trustedRepairOwnerCurrent(): boolean {
    if (!this.retainedCorrupt || this.record) return true;
    if (!this.retainedOwner) return false;
    return this.completeIndependentOwner({ state: 'authorized', binding: this.retainedOwner });
  }
  private sameTrustedRepairOwner(local: LocalAuthorizationResult): boolean {
    return this.completeIndependentOwner(local) && this.retainedOwner !== null
      && JSON.stringify(LocalAuthorizationBindingSchema.parse(local.binding)) === JSON.stringify(this.retainedOwner);
  }
  private async persist(next: PersistedCredentials, captured: AuthFence): Promise<boolean> {
    if (!this.valid(captured)) return false;
    try {
      const revision = await this.ports.credentials.compareAndSwap(this.revision, clone(next), this.guard(captured));
      if (!this.valid(captured)) return false;
      const readback = await this.ports.credentials.read();
      if (!this.valid(captured) || readback?.revision !== revision) return false;
      const parsed = PersistedCredentialsSchema.safeParse(readback.value);
      if (!parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(next)) return false;
      this.record = parsed.data; this.revision = revision;
      return true;
    } catch { return false; }
  }
  private pending(bundle: PendingCredentials, origin: 'exchange' | 'refresh'): PersistedCredentials & { phase: 'activation_pending' } {
    return { version: 1, environment: this.environment, localEpoch: this.localEpoch, phase: 'activation_pending', origin, bundle };
  }
  private async abandon(bundle: PendingCredentials) {
    if (this.cleanupCount++ >= this.limits.maxCleanupAttempts) return;
    try { await this.ports.transport.revoke(bundle.revocationToken); } catch { /* No public raw error. */ }
  }
  private async lockWith(code: 'SESSION_REVOKED' | 'AUTH_INVALID'): Promise<AuthSnapshot> {
    this.stopped = true; this.localAccess = 'locked'; this.phase = 'locked'; this.code = code;
    try { if (!await this.ports.local.lock()) { this.phase = 'logout_incomplete'; this.code = 'LOCAL_LOCK_FAILED'; } }
    catch { this.phase = 'logout_incomplete'; this.code = 'LOCAL_LOCK_FAILED'; }
    return this.snapshot();
  }
  private lockForRevocation() { return this.lockWith('SESSION_REVOKED'); }
  private lockForIntegrity() { return this.lockWith('AUTH_INVALID'); }

  async recover(): Promise<AuthSnapshot> {
    if (this.stopped || !this.ports.current(this.fence())) return this.snapshot();
    let local: LocalAuthorizationResult;
    try { local = await this.ports.local.inspect(); } catch { this.localAccess = 'locked'; return this.set('unavailable', 'AUTH_UNAVAILABLE'); }
    if (this.stopped || !this.ports.current(this.fence())) return this.snapshot();
    if (local.state === 'corrupt') return this.lockForIntegrity();
    if (local.state === 'unavailable') { this.localAccess = 'locked'; return this.set('unavailable', 'AUTH_UNAVAILABLE'); }
    if (!this.validLocalBinding(local)) return this.lockForIntegrity();
    const locked = local.state === 'locked';
    this.localAccess = local.state === 'authorized' ? 'authorized' : 'locked';
    let stored: StoredCredentials | null;
    try { stored = await this.ports.credentials.read(); } catch { return this.set(this.localAccess === 'authorized' ? 'local_only' : 'locked', 'AUTH_UNAVAILABLE'); }
    if (this.stopped || !this.ports.current(this.fence())) return this.snapshot();
    this.revision = stored?.revision ?? null;
    const parsed = stored ? PersistedCredentialsSchema.safeParse(stored.value) : null;
    if (!parsed?.success) {
      this.retainedCorrupt = stored !== null;
      if (stored) {
        if (Number.isSafeInteger(stored.revision) && stored.revision > 0 && this.completeIndependentOwner(local)) {
          this.retainedOwner = LocalAuthorizationBindingSchema.parse(local.binding);
          return this.set('local_only', 'AUTH_REAUTH_REQUIRED');
        }
        this.retainedOwner = null; this.localAccess = 'locked';
        return this.set('recovery_required', 'AUTH_RECOVERY_REQUIRED');
      }
      return this.set(locked ? 'locked' : this.localAccess === 'authorized' ? 'local_only' : 'locked', 'AUTH_REAUTH_REQUIRED');
    }
    this.retainedCorrupt = false; this.retainedOwner = null;
    const next = parsed.data;
    if (!this.expectedAccountMatches(next.bundle)) return this.lockForIntegrity();
    if (locked) {
      if (next.environment !== this.environment) { this.retainedCorrupt = true; return this.set('locked', 'AUTH_INVALID'); }
      this.record = next; // Retained only as a CAS/owner candidate; it grants no access.
      return this.set('locked');
    }
    if (next.environment !== this.environment || next.localEpoch !== this.localEpoch) return this.lockForIntegrity();
    if (local.state === 'authorized' && !matchesAuthorization(local, this.environment, this.localEpoch, next.bundle)) {
      const newSessionForSameAccount = next.phase === 'activation_pending' && next.origin === 'exchange' && local.binding.environment === this.environment && local.binding.localEpoch === this.localEpoch && local.binding.accountId === next.bundle.accountId;
      if (!newSessionForSameAccount) return this.lockForIntegrity();
    }
    this.record = next;
    if (!this.ports.current(this.fence())) return this.snapshot();
    if (next.phase === 'reauth_required') return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    if (next.phase === 'refresh_prepared') return this.localAccess === 'authorized' ? this.refresh() : this.set('locked');
    if (next.phase === 'activation_pending') return next.origin === 'refresh' && this.localAccess !== 'authorized' ? this.set('locked') : this.activatePending();
    if (this.ports.now() >= Date.parse(next.bundle.accessExpiresAt)) {
      return this.ports.now() < Date.parse(next.bundle.refreshExpiresAt) && this.ports.now() < Date.parse(next.bundle.sessionExpiresAt)
        ? this.set('local_only', 'ACCESS_EXPIRED') : this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    }
    if (this.localAccess !== 'authorized') return this.set('locked');
    return this.set('ready');
  }

  async exchange(input: AppleExchange): Promise<AuthSnapshot> {
    if (this.exchangeFlight) return this.exchangeFlight;
    if (this.retainedCorrupt && !this.trustedRepairOwnerCurrent()) { this.localAccess = 'locked'; return this.set('recovery_required', 'AUTH_RECOVERY_REQUIRED'); }
    if (this.stopped || !this.ports.current(this.fence())) return this.snapshot();
    const parsed = AppleExchangeSchema.safeParse(input);
    if (!parsed.success) return this.set('reauth_required', 'AUTH_INVALID');
    const captured = this.fence();
    const work = (async () => {
      let local: LocalAuthorizationResult;
      try { local = await this.ports.local.inspect(); } catch { this.localAccess = 'locked'; return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot(); }
      if (!this.valid(captured)) return this.snapshot();
      if (local.state === 'corrupt') return this.lockForIntegrity();
      if (local.state === 'unavailable') { this.localAccess = 'locked'; return this.set('unavailable', 'AUTH_UNAVAILABLE'); }
      if (!this.validLocalBinding(local)) return this.lockForIntegrity();
      if (this.retainedCorrupt && !this.sameTrustedRepairOwner(local)) {
        this.localAccess = 'locked'; return this.set('recovery_required', 'AUTH_RECOVERY_REQUIRED');
      }
      if (this.record && this.record.environment !== this.environment) return this.set('locked', 'AUTH_INVALID');
      if (!this.record && this.revision === null) {
        try { if (await this.ports.credentials.read()) return this.valid(captured) ? this.set('unavailable', 'AUTH_INVALID') : this.snapshot(); }
        catch { return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot(); }
        if (!this.valid(captured)) return this.snapshot();
      }
      let outcome: ExchangeOutcome;
      try { if (!this.valid(captured)) return this.snapshot(); outcome = await this.ports.transport.exchange(parsed.data); }
      catch { return this.valid(captured) ? this.set('reauth_required', 'AUTH_REAUTH_REQUIRED') : this.snapshot(); }
      if (outcome.kind !== 'credentials') return this.valid(captured) ? this.set(outcome.kind === 'unavailable' ? 'unavailable' : 'reauth_required', outcome.kind === 'unavailable' ? 'AUTH_UNAVAILABLE' : 'AUTH_REAUTH_REQUIRED') : this.snapshot();
      const checked = PendingCredentialsSchema.safeParse(outcome.bundle);
      if (!checked.success) return this.valid(captured) ? this.set('reauth_required', 'AUTH_INVALID') : this.snapshot();
      const bundle = checked.data;
      if (!this.valid(captured)) { await this.abandon(bundle); return this.snapshot(); }
      if (this.retainedCorrupt) {
        let latest: LocalAuthorizationResult;
        try { latest = await this.ports.local.inspect(); } catch { await this.abandon(bundle); this.localAccess = 'locked'; return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot(); }
        if (!this.valid(captured)) { await this.abandon(bundle); return this.snapshot(); }
        if (!this.sameTrustedRepairOwner(latest)) {
          await this.abandon(bundle); this.localAccess = 'locked'; return this.set('recovery_required', 'AUTH_RECOVERY_REQUIRED');
        }
      }
      if (!this.expectedAccountMatches(bundle) || (local.state === 'authorized' && local.binding.accountId !== bundle.accountId)) {
        await this.abandon(bundle);
        return this.retainedCorrupt ? this.set('local_only', 'AUTH_INVALID') : this.lockForIntegrity();
      }
      if (this.record && this.record.bundle.accountId !== bundle.accountId) { await this.abandon(bundle); return this.lockForIntegrity(); }
      if (this.ports.now() >= Date.parse(bundle.activationExpiresAt)) { await this.abandon(bundle); return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED'); }
      const next = this.pending(bundle, 'exchange');
      if (!await this.persist(next, captured)) {
        if (!this.valid(captured)) { await this.abandon(bundle); return this.snapshot(); }
        this.memoryPending = { value: next, attempts: 0 }; return this.set('persistence_retry', 'AUTH_UNAVAILABLE');
      }
      this.retainedCorrupt = false; this.retainedOwner = null;
      return this.activatePending();
    })();
    this.exchangeFlight = work;
    try { return await work; } finally { if (this.exchangeFlight === work) this.exchangeFlight = null; }
  }

  async retryPendingPersistence(): Promise<AuthSnapshot> {
    const pending = this.memoryPending;
    if (!pending || this.stopped) return this.snapshot();
    if (this.ports.now() >= Date.parse(pending.value.bundle.activationExpiresAt) || pending.attempts >= this.limits.maxMemoryPersistenceAttempts) {
      this.memoryPending = null; await this.abandon(pending.value.bundle); return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    }
    pending.attempts++;
    const captured = this.fence();
    // A failed readback may have committed. Reconcile the exact complete value first.
    try {
      const found = await this.ports.credentials.read();
      if (!this.valid(captured)) return this.snapshot();
      if (found) {
        const parsed = PersistedCredentialsSchema.safeParse(found.value);
        if (parsed.success && JSON.stringify(parsed.data) === JSON.stringify(pending.value)) { this.record = parsed.data; this.revision = found.revision; this.memoryPending = null; this.retainedCorrupt = false; this.retainedOwner = null; return this.activatePending(); }
        if (found.revision !== this.revision) return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
      }
    } catch { return this.set('persistence_retry', 'AUTH_UNAVAILABLE'); }
    if (!await this.persist(pending.value, captured)) return this.valid(captured) ? this.set('persistence_retry', 'AUTH_UNAVAILABLE') : this.snapshot();
    this.memoryPending = null; this.retainedCorrupt = false; this.retainedOwner = null; return this.activatePending();
  }

  async refresh(): Promise<AuthSnapshot> {
    if (this.refreshFlight) return this.refreshFlight;
    if (this.stopped || this.phase === 'reauth_required' || !this.record || this.record.phase === 'activation_pending') return this.snapshot();
    const work = this.record.phase === 'refresh_prepared' ? this.resumeRefresh() : this.prepareRefresh();
    this.refreshFlight = work;
    try { return await work; } finally { if (this.refreshFlight === work) this.refreshFlight = null; }
  }
  private async prepareRefresh(): Promise<AuthSnapshot> {
    const old = this.record;
    if (!old || old.phase !== 'stable' || this.localAccess !== 'authorized') return this.snapshot();
    const captured = this.fence();
    if (this.ports.now() >= Date.parse(old.bundle.refreshExpiresAt) || this.ports.now() >= Date.parse(old.bundle.sessionExpiresAt)) return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    const operationId = this.ports.operationId();
    const next: PersistedCredentials = { version: 1, environment: this.environment, localEpoch: this.localEpoch, phase: 'refresh_prepared', operationId, bundle: old.bundle };
    if (!await this.persist(next, captured)) return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot();
    return this.resumeRefresh();
  }
  private async resumeRefresh(): Promise<AuthSnapshot> {
    const old = this.record;
    if (!old || old.phase !== 'refresh_prepared') return this.snapshot();
    const captured = this.fence();
    if (!this.valid(captured)) return this.snapshot();
    if (this.ports.now() >= Date.parse(old.bundle.refreshExpiresAt) || this.ports.now() >= Date.parse(old.bundle.sessionExpiresAt)) return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    let local: LocalAuthorizationResult;
    try { local = await this.ports.local.inspect(); } catch { this.localAccess = 'locked'; return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot(); }
    if (!this.valid(captured)) return this.snapshot();
    if (local.state === 'unavailable') { this.localAccess = 'locked'; return this.set('unavailable', 'AUTH_UNAVAILABLE'); }
    if (!this.validLocalBinding(local)) return this.lockForIntegrity();
    if (!matchesAuthorization(local, this.environment, this.localEpoch, old.bundle)) return this.lockForIntegrity();
    this.set('refresh_prepared');
    let outcome: RefreshOutcome;
    try { if (!this.valid(captured)) return this.snapshot(); outcome = await this.ports.transport.refresh(old.operationId, old.bundle.refreshToken); }
    catch { return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot(); }
    if (!this.valid(captured)) {
      if (outcome.kind === 'credentials') { const checked = PendingCredentialsSchema.safeParse(outcome.bundle); if (checked.success) await this.abandon(checked.data); }
      return this.snapshot();
    }
    if (outcome.kind === 'revoked') return outcome.sessionId === old.bundle.sessionId ? this.lockForRevocation() : this.set('reauth_required', 'AUTH_INVALID');
    if (outcome.kind === 'reauth_required' || outcome.kind === 'invalid') {
      const terminal: PersistedCredentials = { ...old, phase: 'reauth_required' };
      await this.persist(terminal, captured);
      return this.valid(this.fence()) ? this.set('reauth_required', 'AUTH_REAUTH_REQUIRED') : this.snapshot();
    }
    if (outcome.kind === 'unavailable') return this.set('unavailable', 'AUTH_UNAVAILABLE');
    const checked = PendingCredentialsSchema.safeParse(outcome.bundle);
    if (!checked.success) return this.set('reauth_required', 'AUTH_INVALID');
    const nextBundle = checked.data;
    if (nextBundle.accountId !== old.bundle.accountId || nextBundle.sessionId !== old.bundle.sessionId) { await this.abandon(nextBundle); return this.lockForIntegrity(); }
    if (nextBundle.credentialGeneration !== old.bundle.credentialGeneration + 1 || nextBundle.sessionExpiresAt !== old.bundle.sessionExpiresAt) { await this.abandon(nextBundle); return this.set('reauth_required', 'AUTH_INVALID'); }
    const next = this.pending(nextBundle, 'refresh');
    if (!await this.persist(next, captured)) {
      if (!this.valid(captured)) { await this.abandon(nextBundle); return this.snapshot(); }
      this.memoryPending = { value: next, attempts: 0 }; return this.set('persistence_retry', 'AUTH_UNAVAILABLE');
    }
    return this.activatePending();
  }

  async activatePending(): Promise<AuthSnapshot> {
    const pending = this.record;
    if (!pending || pending.phase !== 'activation_pending' || this.stopped) return this.snapshot();
    const captured = this.fence();
    if (!this.valid(captured)) return this.snapshot();
    if (this.ports.now() >= Date.parse(pending.bundle.accessExpiresAt) || this.ports.now() >= Date.parse(pending.bundle.sessionExpiresAt)) return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    const afterPendingDeadline = this.ports.now() >= Date.parse(pending.bundle.activationExpiresAt);
    if (afterPendingDeadline && this.postDeadlineActivationChecks++ >= this.limits.maxPostDeadlineActivationChecks) return this.set('unavailable', 'AUTH_UNAVAILABLE');
    this.set('activation_pending');
    let result: ActivationOutcome;
    try { if (!this.valid(captured)) return this.snapshot(); result = await this.ports.transport.activate(pending.bundle); }
    catch { return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot(); }
    if (!this.valid(captured)) return this.snapshot();
    if (result.kind === 'revoked') return result.sessionId === pending.bundle.sessionId ? this.lockForRevocation() : this.set('reauth_required', 'AUTH_INVALID');
    if (result.kind === 'expired' || result.kind === 'invalid') return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    if (result.kind === 'unavailable') return this.set('unavailable', 'AUTH_UNAVAILABLE');
    if (afterPendingDeadline && !result.alreadyActive) return this.set('reauth_required', 'AUTH_INVALID');
    if (this.ports.now() >= Date.parse(pending.bundle.accessExpiresAt)) return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    const identity = safeIdentity(result.identity);
    if (!identity || !sameIdentity(identity, pending.bundle)) return this.lockForIntegrity();
    return this.confirmAndAuthorize(pending.bundle, pending.origin === 'exchange');
  }
  private async confirmAndAuthorize(bundle: PendingCredentials, allowLocked: boolean): Promise<AuthSnapshot> {
    const captured = this.fence();
    if (!this.valid(captured)) return this.snapshot();
    let result: IdentityOutcome;
    try { result = await this.ports.transport.identity(bundle); }
    catch { return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot(); }
    if (!this.valid(captured)) return this.snapshot();
    if (result.kind === 'revoked') return result.sessionId === bundle.sessionId ? this.lockForRevocation() : this.set('reauth_required', 'AUTH_INVALID');
    if (result.kind !== 'active') return this.set(result.kind === 'unavailable' ? 'unavailable' : 'reauth_required', result.kind === 'unavailable' ? 'AUTH_UNAVAILABLE' : 'AUTH_INVALID');
    const identity = safeIdentity(result.identity);
    if (!identity || !sameIdentity(identity, bundle)) return this.lockForIntegrity();
    if (this.ports.now() >= Date.parse(bundle.accessExpiresAt)) return this.set('reauth_required', 'AUTH_REAUTH_REQUIRED');
    if (!this.expectedAccountMatches(bundle)) return this.lockForIntegrity();
    let local: LocalAuthorizationResult;
    try { local = await this.ports.local.inspect(); } catch { this.localAccess = 'locked'; return this.set('unavailable', 'AUTH_UNAVAILABLE'); }
    if (!this.valid(this.fence())) return this.snapshot();
    if (local.state === 'corrupt') return this.lockForIntegrity();
    if (local.state === 'unavailable') { this.localAccess = 'locked'; return this.set('unavailable', 'AUTH_UNAVAILABLE'); }
    if (!this.validLocalBinding(local)) return this.lockForIntegrity();
    if (local.state === 'locked' && !allowLocked) return this.set('locked');
    if (local.state === 'authorized' && !matchesAuthorization(local, this.environment, this.localEpoch, bundle) && (!allowLocked || local.binding.accountId !== bundle.accountId || local.binding.environment !== this.environment || local.binding.localEpoch !== this.localEpoch)) return this.lockForIntegrity();
    if (!matchesAuthorization(local, this.environment, this.localEpoch, bundle)) {
      try { local = await this.ports.local.authorize(identity, this.environment, this.localEpoch, this.guard(this.fence())); }
      catch { return this.set('locked', 'AUTH_UNAVAILABLE'); }
    }
    if (!this.valid(this.fence())) return this.snapshot();
    if (!this.validLocalBinding(local) || !matchesAuthorization(local, this.environment, this.localEpoch, bundle)) return this.lockForIntegrity();
    this.localAccess = 'authorized';
    const stable: PersistedCredentials = { version: 1, environment: this.environment, localEpoch: this.localEpoch, phase: 'stable', bundle };
    if (this.record?.phase === 'activation_pending' && !await this.persist(stable, captured)) return this.valid(captured) ? this.set('unavailable', 'AUTH_UNAVAILABLE') : this.snapshot();
    return this.set('ready');
  }

  /** Immediate in-memory invalidation; local durable lock must acknowledge before switch is permitted. */
  async logoutOrSwitch(): Promise<AuthSnapshot> {
    const old = this.record?.bundle ?? this.memoryPending?.value.bundle ?? null;
    this.stop(); this.localAccess = 'locked'; this.phase = 'logout_incomplete'; this.code = 'LOCAL_LOCK_FAILED';
    try { if (!await this.ports.local.lock()) return this.snapshot(); }
    catch { return this.snapshot(); }
    this.phase = 'logged_out'; this.code = null; this.serverLogoutPending = old !== null;
    if (old) {
      try { if (await this.ports.transport.revoke(old.revocationToken) === 'revoked') this.serverLogoutPending = false; }
      catch { /* Local lock remains successful; server sign-out is pending. */ }
    }
    return this.snapshot();
  }
}
