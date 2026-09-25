import { describe, expect, it } from 'vitest';
import type { ActiveIdentity, AppleExchange, LocalAuthorizationResult, PendingCredentials, PersistedCredentials } from '@fitquest-rebuild/contracts';
import { CredentialRecoveryCoordinator, type ActivationOutcome, type AuthFence, type AuthTransportPort, type CredentialStoragePort, type ExchangeOutcome, type ExpectedLocalOwner, type IdentityOutcome, type LocalAuthorizationPort, type RefreshOutcome } from './coordinator';

const accountId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const exchangeInput: AppleExchange = { challengeId: otherId, state: 'state', identityToken: 'fake-identity', authorizationCode: 'one-use-code' };
const bundle: PendingCredentials = { accountId, sessionId, credentialGeneration: 1, accessToken: 'access-secret', accessExpiresAt: '2026-09-25T10:15:00.000Z', refreshToken: 'refresh-secret', refreshExpiresAt: '2026-10-25T10:00:00.000Z', sessionExpiresAt: '2026-12-24T10:00:00.000Z', revocationToken: 'revoke-secret', activationExpiresAt: '2026-09-25T10:05:00.000Z' };
const nextBundle: PendingCredentials = { ...bundle, credentialGeneration: 2, accessToken: 'next-access-secret', refreshToken: 'next-refresh-secret', revocationToken: 'next-revoke-secret' };
const identity = (value: PendingCredentials): ActiveIdentity => ({ accountId: value.accountId, sessionId: value.sessionId, credentialGeneration: value.credentialGeneration });
const pending = (value = bundle, origin: 'exchange' | 'refresh' = 'exchange'): PersistedCredentials => ({ version: 1, environment: 'development', localEpoch: 1, phase: 'activation_pending', origin, bundle: value });
const stable = (value = bundle): PersistedCredentials => ({ version: 1, environment: 'development', localEpoch: 1, phase: 'stable', bundle: value });
const prepared = (value = bundle): PersistedCredentials => ({ version: 1, environment: 'development', localEpoch: 1, phase: 'refresh_prepared', operationId, bundle: value });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};

class FakeStorage implements CredentialStoragePort {
  row: { revision: number; value: PersistedCredentials } | null = null;
  writes = 0;
  reads = 0;
  failWrite = false;
  failRead = false;
  failReadAt: number | null = null;
  nextWriteGate: ReturnType<typeof deferred<void>> | null = null;
  enteredWrite: ReturnType<typeof deferred<void>> | null = null;
  constructor(private log: string[]) {}
  async read() {
    this.reads++; this.log.push('storage.read');
    if (this.failRead || this.reads === this.failReadAt) throw new Error('fake secret in raw storage error');
    return this.row ? structuredClone(this.row) : null;
  }
  async compareAndSwap(expected: number | null, value: PersistedCredentials, guard: () => boolean) {
    this.log.push(`storage.write.${value.phase}`);
    this.enteredWrite?.resolve();
    if (this.nextWriteGate) { const gate = this.nextWriteGate; this.nextWriteGate = null; await gate.promise; }
    if (this.failWrite) throw new Error('fake secret in raw storage error');
    if (!guard() || (this.row?.revision ?? null) !== expected) throw new Error('STALE_WRITE');
    this.row = { revision: (this.row?.revision ?? 0) + 1, value: structuredClone(value) };
    this.writes++;
    return this.row.revision;
  }
}
class FakeLocal implements LocalAuthorizationPort {
  result: LocalAuthorizationResult = { state: 'uninitialized' };
  failLock = false;
  failAuthorize = false;
  authorizeGate: ReturnType<typeof deferred<void>> | null = null;
  authorizeEntered: ReturnType<typeof deferred<void>> | null = null;
  locks = 0;
  constructor(private log: string[]) {}
  async inspect(): Promise<LocalAuthorizationResult> { this.log.push('local.inspect'); return structuredClone(this.result); }
  async authorize(value: ActiveIdentity, environment: string, localEpoch: number, guard: () => boolean): Promise<LocalAuthorizationResult> {
    this.log.push('local.authorize'); this.authorizeEntered?.resolve();
    if (this.authorizeGate) { const gate = this.authorizeGate; this.authorizeGate = null; await gate.promise; }
    if (this.failAuthorize || !guard()) throw new Error('fake secret in raw local error');
    this.result = { state: 'authorized', binding: { environment, localEpoch, accountId: value.accountId, sessionId: value.sessionId, storeId: otherId, installInstanceId: operationId } };
    return structuredClone(this.result);
  }
  async lock() { this.log.push('local.lock'); this.locks++; if (this.failLock) return false; this.result = { state: 'locked' }; return true; }
}
class FakeTransport implements AuthTransportPort {
  exchangeResult: ExchangeOutcome = { kind: 'credentials', bundle };
  refreshResult: RefreshOutcome = { kind: 'credentials', bundle: nextBundle };
  activationResult: ActivationOutcome | null = null;
  identityResult: IdentityOutcome | null = null;
  revokeResult: 'revoked' | 'unavailable' = 'revoked';
  exchangeGate: ReturnType<typeof deferred<ExchangeOutcome>> | null = null;
  refreshGate: ReturnType<typeof deferred<RefreshOutcome>> | null = null;
  activationGate: ReturnType<typeof deferred<ActivationOutcome>> | null = null;
  identityGate: ReturnType<typeof deferred<IdentityOutcome>> | null = null;
  exchangeEntered: ReturnType<typeof deferred<void>> | null = null;
  refreshEntered: ReturnType<typeof deferred<void>> | null = null;
  activationEntered: ReturnType<typeof deferred<void>> | null = null;
  identityEntered: ReturnType<typeof deferred<void>> | null = null;
  constructor(private log: string[]) {}
  async exchange(input: AppleExchange): Promise<ExchangeOutcome> { void input; this.log.push('transport.exchange'); this.exchangeEntered?.resolve(); return this.exchangeGate ? this.exchangeGate.promise : this.exchangeResult; }
  async refresh(op: string, token: string): Promise<RefreshOutcome> { this.log.push(`transport.refresh.${op}.${token}`); this.refreshEntered?.resolve(); return this.refreshGate ? this.refreshGate.promise : this.refreshResult; }
  async activate(value: PendingCredentials): Promise<ActivationOutcome> { this.log.push(`transport.activate.${value.credentialGeneration}`); this.activationEntered?.resolve(); return this.activationGate ? this.activationGate.promise : this.activationResult ?? { kind: 'active', identity: identity(value), alreadyActive: false }; }
  async identity(value: PendingCredentials): Promise<IdentityOutcome> { this.log.push(`transport.identity.${value.credentialGeneration}`); this.identityEntered?.resolve(); return this.identityGate ? this.identityGate.promise : this.identityResult ?? { kind: 'active', identity: identity(value) }; }
  async revoke(token: string): Promise<'revoked' | 'unavailable'> { this.log.push(`transport.revoke.${token}`); return this.revokeResult; }
}
function harness() {
  const log: string[] = [];
  const storage = new FakeStorage(log), local = new FakeLocal(log), transport = new FakeTransport(log);
  let time = Date.parse('2026-09-25T10:00:00.000Z'), epoch = 1, operationCalls = 0;
  let expectedLocalOwner: ExpectedLocalOwner = { accountId: null, storeId: null, installInstanceId: null, sessionId: null };
  const make = (localEpoch = 1) => new CredentialRecoveryCoordinator('development', localEpoch, { now: () => time, operationId: () => { operationCalls++; return operationId; }, current: (fence: AuthFence) => fence.environment === 'development' && fence.localEpoch === epoch, expectedLocalOwner, credentials: storage, local, transport });
  return { log, storage, local, transport, make, setTime: (value: string) => { time = Date.parse(value); }, switchEpoch: () => { epoch++; }, setExpectedLocalOwner: (value: ExpectedLocalOwner) => { expectedLocalOwner = value; }, operationCalls: () => operationCalls };
}
async function ready(h: ReturnType<typeof harness>) { const c = h.make(); expect((await c.exchange(exchangeInput)).phase).toBe('ready'); return c; }

describe('pure credential recovery coordinator', () => {
  it('persists and reads back pending, activates, confirms identity, persists stable, and acknowledges local authority before ready', async () => {
    const h = harness(), c = h.make();
    expect((await c.exchange(exchangeInput)).syncReady).toBe(true);
    expect(h.log).toEqual(['local.inspect', 'storage.read', 'transport.exchange', 'storage.write.activation_pending', 'storage.read', 'transport.activate.1', 'transport.identity.1', 'local.inspect', 'local.authorize', 'storage.write.stable', 'storage.read']);
    expect(h.storage.row?.value.phase).toBe('stable');
    expect(h.local.result.state).toBe('authorized');
  });
  it('keeps pending credentials unready through an activation wait and retries a lost activation response from the same stored bundle', async () => {
    const h = harness(), c = h.make(); h.transport.activationGate = deferred(); h.transport.activationEntered = deferred();
    const work = c.exchange(exchangeInput); await h.transport.activationEntered.promise;
    expect(c.snapshot()).toMatchObject({ phase: 'activation_pending', syncReady: false, localAccess: 'locked' });
    c.stop(); h.transport.activationGate.resolve({ kind: 'active', identity: identity(bundle), alreadyActive: false }); await work;
    expect(h.storage.row?.value.phase).toBe('activation_pending'); expect(h.local.result.state).toBe('uninitialized');
    h.transport.activationGate = null; h.transport.activationResult = { kind: 'active', identity: identity(bundle), alreadyActive: true };
    const restarted = h.make(); expect((await restarted.recover()).syncReady).toBe(true);
    expect(h.log.filter(x => x === 'transport.exchange')).toHaveLength(1);
    expect(h.log.filter(x => x === 'transport.activate.1')).toHaveLength(2);
  });
  it('never repeats an uncertain one-use exchange; memory-only persistence retry uses the same complete bundle', async () => {
    const h = harness(), c = h.make(); h.transport.exchangeResult = { kind: 'unknown' };
    expect((await c.exchange(exchangeInput)).phase).toBe('reauth_required');
    expect(h.log.filter(x => x === 'transport.exchange')).toHaveLength(1);
    expect(h.storage.writes).toBe(0);
    const h2 = harness(), c2 = h2.make(); h2.storage.failWrite = true;
    expect((await c2.exchange(exchangeInput)).phase).toBe('persistence_retry');
    expect(h2.log).not.toContain('transport.activate.1');
    const crash = h2.make(); expect((await crash.recover()).phase).toBe('locked');
    h2.storage.failWrite = false;
    expect((await c2.retryPendingPersistence()).phase).toBe('ready');
    expect(h2.log.filter(x => x === 'transport.exchange')).toHaveLength(1);
  });
  it('does not consume a new one-use code before inspecting pre-existing or corrupt local state', async () => {
    const h = harness(); h.storage.row = { revision: 1, value: pending() };
    expect((await h.make().exchange(exchangeInput)).phase).toBe('unavailable');
    expect(h.log).not.toContain('transport.exchange');
    const h2 = harness(); h2.local.result = { state: 'corrupt' };
    expect(await h2.make().exchange(exchangeInput)).toMatchObject({ phase: 'locked', code: 'AUTH_INVALID' });
    expect(h2.log).not.toContain('transport.exchange');
  });
  it('blocks activation after failed readback, and recovers the exact committed pending record', async () => {
    const h = harness(), c = h.make(); h.storage.failReadAt = 2;
    expect((await c.exchange(exchangeInput)).phase).toBe('persistence_retry');
    expect(h.storage.row?.value.phase).toBe('activation_pending');
    expect(h.log).not.toContain('transport.activate.1');
    h.storage.failReadAt = null;
    expect((await c.retryPendingPersistence()).syncReady).toBe(true);
    expect(h.storage.writes).toBe(2); // pending and stable; no duplicate pending write
  });
  it('recovers after identity or stable-install interruption without treating a pending session as ready', async () => {
    const h = harness(), c = h.make(); h.transport.identityGate = deferred(); h.transport.identityEntered = deferred();
    const work = c.exchange(exchangeInput); await h.transport.identityEntered.promise;
    expect(c.snapshot().syncReady).toBe(false); c.stop();
    h.transport.identityGate.resolve({ kind: 'active', identity: identity(bundle) }); await work;
    expect(h.storage.row?.value.phase).toBe('activation_pending');
    h.transport.identityGate = null; h.transport.activationResult = { kind: 'active', identity: identity(bundle), alreadyActive: true };
    expect((await h.make().recover()).syncReady).toBe(true);
    const h2 = harness(); h2.storage.failWrite = false;
    const original = h2.storage.compareAndSwap.bind(h2.storage);
    h2.storage.compareAndSwap = async (expected, value, guard) => { if (value.phase === 'stable') throw new Error('injected stable write failure'); return original(expected, value, guard); };
    expect((await h2.make().exchange(exchangeInput)).phase).toBe('unavailable');
    expect(h2.storage.row?.value.phase).toBe('activation_pending'); expect(h2.local.result.state).toBe('authorized');
    h2.storage.compareAndSwap = original;
    h2.transport.activationResult = { kind: 'active', identity: identity(bundle), alreadyActive: true };
    expect((await h2.make().recover()).syncReady).toBe(true);
  });
  it('distinguishes a server-expired pending bundle from an already-active retry', async () => {
    const h = harness(); h.storage.row = { revision: 1, value: pending() }; h.setTime('2026-09-25T10:06:00.000Z'); h.transport.activationResult = { kind: 'expired' };
    expect((await h.make().recover()).phase).toBe('reauth_required'); expect(h.log).toContain('transport.activate.1'); expect(h.log).not.toContain('transport.identity.1');
    const h2 = harness(); h2.storage.row = { revision: 1, value: pending() }; h2.transport.activationResult = { kind: 'active', identity: identity(bundle), alreadyActive: true };
    expect((await h2.make().recover()).phase).toBe('ready');
  });
  it('recovers an already-active generation after pending deadline but never extends pending or access expiry', async () => {
    const h = harness(); h.storage.row = { revision: 1, value: pending() }; h.setTime('2026-09-25T10:06:00.000Z');
    h.transport.activationResult = { kind: 'active', identity: identity(bundle), alreadyActive: true };
    expect((await h.make().recover()).syncReady).toBe(true);
    expect(h.log).toContain('transport.identity.1');
    const h2 = harness(); h2.storage.row = { revision: 1, value: pending() }; h2.setTime('2026-09-25T10:06:00.000Z');
    h2.transport.activationResult = { kind: 'active', identity: identity(bundle), alreadyActive: false };
    expect(await h2.make().recover()).toMatchObject({ phase: 'reauth_required', syncReady: false, code: 'AUTH_INVALID' });
    expect(h2.log).not.toContain('transport.identity.1');
    const h3 = harness(); h3.storage.row = { revision: 1, value: pending() }; h3.setTime(bundle.accessExpiresAt);
    h3.transport.activationResult = { kind: 'active', identity: identity(bundle), alreadyActive: true };
    expect((await h3.make().recover()).syncReady).toBe(false); expect(h3.log).not.toContain('transport.activate.1');
    const h4 = harness(); h4.storage.row = { revision: 1, value: pending() }; h4.setTime('2026-09-25T10:06:00.000Z'); h4.transport.activationResult = { kind: 'unavailable' };
    const coordinator = h4.make(); expect((await coordinator.recover()).phase).toBe('unavailable');
    expect((await coordinator.activatePending()).phase).toBe('unavailable');
    expect(h4.log.filter(x => x === 'transport.activate.1')).toHaveLength(1);
  });
  it('cannot extend a server activation deadline during a bounded in-memory persistence retry', async () => {
    const h = harness(), c = h.make(); h.storage.failWrite = true;
    expect((await c.exchange(exchangeInput)).phase).toBe('persistence_retry');
    h.setTime(bundle.activationExpiresAt); h.storage.failWrite = false;
    expect((await c.retryPendingPersistence()).phase).toBe('reauth_required');
    expect(h.storage.writes).toBe(0); expect(h.log).not.toContain('transport.activate.1');
    expect(h.log).toContain(`transport.revoke.${bundle.revocationToken}`);
  });
  it('refuses sync-ready on activation or identity mismatch, retaining local work without deleting anything', async () => {
    const h = harness(); h.transport.activationResult = { kind: 'active', identity: { ...identity(bundle), accountId: otherId }, alreadyActive: false };
    expect(await h.make().exchange(exchangeInput)).toMatchObject({ syncReady: false, code: 'AUTH_INVALID' });
    expect(h.local.locks).toBe(1); expect(h.storage.row?.value.phase).toBe('activation_pending');
    const h2 = harness(); h2.transport.identityResult = { kind: 'active', identity: { ...identity(bundle), sessionId: otherId } };
    expect(await h2.make().exchange(exchangeInput)).toMatchObject({ syncReady: false, code: 'AUTH_INVALID' });
    expect(h2.local.locks).toBe(1); expect(h2.storage.row?.value.phase).toBe('activation_pending');
  });
  it('keeps local authorization through ordinary expiry and missing rotating credentials; contradictory owner locks', async () => {
    const h = harness(); await ready(h); h.setTime('2026-09-25T10:16:00.000Z');
    expect(await h.make().recover()).toMatchObject({ phase: 'local_only', localAccess: 'authorized', syncReady: false, code: 'ACCESS_EXPIRED' });
    h.storage.row = null; expect(await h.make().recover()).toMatchObject({ phase: 'local_only', localAccess: 'authorized', code: 'AUTH_REAUTH_REQUIRED' });
    const h2 = harness(); await ready(h2); h2.storage.row = { revision: 4, value: stable({ ...bundle, accountId: otherId }) };
    expect((await h2.make().recover()).phase).toBe('locked'); expect(h2.local.locks).toBe(1);
    const h3 = harness(); await ready(h3); h3.local.result = { state: 'corrupt' };
    expect((await h3.make().recover()).phase).toBe('locked'); expect(h3.local.locks).toBe(1);
    const h4 = harness(); h4.storage.row = { revision: 1, value: stable() };
    expect((await h4.make().recover()).phase).toBe('locked');
    expect(h4.log).not.toContain('transport.identity.1');
  });
  it('refreshes an expired access bearer while its refresh family remains valid, then blocks expired families', async () => {
    const h = harness(); await ready(h); h.setTime('2026-09-25T10:16:00.000Z');
    h.transport.refreshResult = { kind: 'credentials', bundle: { ...nextBundle, activationExpiresAt: '2026-09-25T10:21:00.000Z', accessExpiresAt: '2026-09-25T10:35:00.000Z' } };
    const restarted = h.make(); expect(await restarted.recover()).toMatchObject({ phase: 'local_only', code: 'ACCESS_EXPIRED', localAccess: 'authorized', syncReady: false });
    expect((await restarted.refresh()).syncReady).toBe(true);
    expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(1);
    const h2 = harness(); await ready(h2); h2.setTime('2026-10-26T10:00:00.000Z');
    const expiredRefresh = h2.make(); expect((await expiredRefresh.recover()).phase).toBe('reauth_required');
    expect((await expiredRefresh.refresh()).phase).toBe('reauth_required');
    expect(h2.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(0);
    const h3 = harness(); await ready(h3); h3.setTime('2026-12-25T10:00:00.000Z');
    const expiredSession = h3.make(); expect((await expiredSession.recover()).phase).toBe('reauth_required');
    expect((await expiredSession.refresh()).phase).toBe('reauth_required');
    expect(h3.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(0);
  });
  it('prepares refresh durably before dispatch, single-flights it and persists next complete bundle before activation', async () => {
    const h = harness(), c = await ready(h); h.transport.refreshGate = deferred(); h.transport.refreshEntered = deferred();
    const first = c.refresh(), second = c.refresh(); await h.transport.refreshEntered.promise;
    expect(c.snapshot()).toMatchObject({ phase: 'refresh_prepared', syncReady: false, localAccess: 'authorized' });
    expect(h.storage.row?.value).toEqual(prepared()); expect(h.operationCalls()).toBe(1);
    expect(h.log.indexOf('storage.write.refresh_prepared')).toBeLessThan(h.log.indexOf(`transport.refresh.${operationId}.${bundle.refreshToken}`));
    h.transport.refreshGate.resolve({ kind: 'credentials', bundle: nextBundle });
    expect((await first).phase).toBe('ready'); expect((await second).phase).toBe('ready');
    expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(1);
    expect(h.log.indexOf('storage.write.activation_pending')).toBeLessThan(h.log.indexOf('transport.activate.2'));
    expect(h.storage.row?.value).toEqual(stable(nextBundle));
  });
  it('recovers prepared refresh with the same operation ID; lost committed response becomes reauthentication without secret replay', async () => {
    const h = harness(); h.storage.row = { revision: 1, value: prepared() }; h.local.result = { state: 'authorized', binding: { environment: 'development', localEpoch: 1, accountId, sessionId, storeId: otherId, installInstanceId: operationId } };
    h.transport.refreshResult = { kind: 'reauth_required' };
    expect((await h.make().recover()).phase).toBe('reauth_required');
    expect(h.log).toContain(`transport.refresh.${operationId}.${bundle.refreshToken}`);
    expect(h.operationCalls()).toBe(0); expect(h.storage.row?.value).toEqual({ ...prepared(), phase: 'reauth_required' });
    const attempts = h.log.filter(x => x.startsWith('transport.refresh.')).length;
    expect((await h.make().recover()).phase).toBe('reauth_required');
    expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(attempts);
  });
  it('does not dispatch refresh when prepared write or readback fails, then retries only its recorded operation', async () => {
    const h = harness(), c = await ready(h); h.storage.failWrite = true;
    expect((await c.refresh()).phase).toBe('unavailable');
    expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(0);
    expect(h.storage.row?.value).toEqual(stable());
    h.storage.failWrite = false; h.storage.failRead = true;
    expect((await c.refresh()).phase).toBe('unavailable');
    expect(h.storage.row?.value).toEqual(prepared());
    expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(0);
    h.storage.failRead = false; h.transport.refreshResult = { kind: 'reauth_required' };
    expect((await h.make().recover()).phase).toBe('reauth_required');
    expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toEqual([`transport.refresh.${operationId}.${bundle.refreshToken}`]);
    expect(h.operationCalls()).toBe(2); // second preparation used the only persisted ID; restart generated none
  });
  it('distinguishes bound different-operation revocation, unknown token and provider outage', async () => {
    const h = harness(); h.storage.row = { revision: 1, value: prepared() }; h.local.result = { state: 'authorized', binding: { environment: 'development', localEpoch: 1, accountId, sessionId, storeId: otherId, installInstanceId: operationId } };
    h.transport.refreshResult = { kind: 'revoked', sessionId };
    expect(await h.make().recover()).toMatchObject({ phase: 'locked', code: 'SESSION_REVOKED' }); expect(h.local.locks).toBe(1);
    const h2 = harness(); await ready(h2); h2.transport.refreshResult = { kind: 'invalid' };
    expect(await h2.make().recover()).toMatchObject({ phase: 'ready' });
    const c2 = h2.make(); await c2.recover(); expect((await c2.refresh()).phase).toBe('reauth_required'); expect(h2.local.locks).toBe(0);
    const h3 = harness(), c3 = await ready(h3); h3.transport.refreshResult = { kind: 'unavailable' };
    expect(await c3.refresh()).toMatchObject({ phase: 'unavailable', localAccess: 'authorized' }); expect(h3.local.locks).toBe(0);
  });
  it('rejects late refresh credentials and bounds cleanup to the abandoned family after a switch', async () => {
    const h = harness(), c = await ready(h); h.transport.refreshGate = deferred(); h.transport.refreshEntered = deferred();
    const work = c.refresh(); await h.transport.refreshEntered.promise;
    h.switchEpoch(); c.stop(); h.transport.refreshGate.resolve({ kind: 'credentials', bundle: nextBundle }); await work;
    expect(h.storage.row?.value.phase).toBe('refresh_prepared');
    expect(h.log).toContain(`transport.revoke.${nextBundle.revocationToken}`);
    expect(h.log).not.toContain('transport.activate.2');
  });
  it('does not install a late initial exchange response after cancellation and revokes only its received family', async () => {
    const h = harness(), c = h.make(); h.transport.exchangeGate = deferred(); h.transport.exchangeEntered = deferred();
    const work = c.exchange(exchangeInput); await h.transport.exchangeEntered.promise;
    h.switchEpoch(); c.stop(); h.transport.exchangeGate.resolve({ kind: 'credentials', bundle }); await work;
    expect(h.storage.writes).toBe(0); expect(h.log).toContain(`transport.revoke.${bundle.revocationToken}`);
    expect(h.log).not.toContain('transport.activate.1');
  });
  it('fences delayed credential writes and local authorization writes after stop or account switch', async () => {
    const h = harness(), c = await ready(h); const writeGate = deferred<void>(); h.storage.nextWriteGate = writeGate; h.storage.enteredWrite = deferred();
    const work = c.refresh(); await h.storage.enteredWrite.promise;
    h.switchEpoch(); c.stop(); writeGate.resolve(); await work;
    expect(h.storage.row?.value).toEqual(stable()); expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(0);
    const h2 = harness(); const authorizationGate = deferred<void>(); h2.local.authorizeGate = authorizationGate; h2.local.authorizeEntered = deferred();
    const exchange = h2.make(), active = exchange.exchange(exchangeInput); await h2.local.authorizeEntered.promise;
    h2.switchEpoch(); exchange.stop(); authorizationGate.resolve(); await active;
    expect(h2.local.result.state).toBe('uninitialized'); expect(exchange.snapshot().syncReady).toBe(false);
  });
  it('rejects an older delayed write after a newer credential generation has committed', async () => {
    const h = harness(), c = await ready(h); const gate = deferred<void>(); h.storage.nextWriteGate = gate; h.storage.enteredWrite = deferred();
    const work = c.refresh(); await h.storage.enteredWrite.promise;
    h.storage.row = { revision: 3, value: stable(nextBundle) }; // another fenced generation won the CAS
    gate.resolve(); await work;
    expect(h.storage.row.value).toEqual(stable(nextBundle));
    expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(0);
  });
  it('locks locally before successful offline logout/switch and never reports completion when all durable locks fail', async () => {
    const h = harness(), c = await ready(h); h.transport.revokeResult = 'unavailable';
    expect(await c.logoutOrSwitch()).toMatchObject({ phase: 'logged_out', localAccess: 'locked', serverLogoutPending: true, syncReady: false });
    expect(h.log.indexOf('local.lock')).toBeLessThan(h.log.indexOf(`transport.revoke.${bundle.revocationToken}`));
    const h2 = harness(), c2 = await ready(h2); h2.local.failLock = true;
    expect(await c2.logoutOrSwitch()).toMatchObject({ phase: 'logout_incomplete', serverLogoutPending: false, syncReady: false, code: 'LOCAL_LOCK_FAILED' });
    expect(h2.log).not.toContain(`transport.revoke.${bundle.revocationToken}`);
  });
  it('does not reopen an explicitly locked store from a retained stable bearer', async () => {
    const h = harness(), c = await ready(h); h.transport.revokeResult = 'unavailable'; await c.logoutOrSwitch();
    expect((await h.make().recover()).phase).toBe('locked');
    expect(h.log.filter(x => x === 'transport.identity.1')).toHaveLength(1); // original exchange only
    expect(h.local.result.state).toBe('locked');
  });
  it('replaces retained credentials only after a fresh verified same-account exchange and fenced CAS', async () => {
    const h = harness(), c = await ready(h); h.transport.revokeResult = 'unavailable'; await c.logoutOrSwitch();
    const retainedRevision = h.storage.row!.revision;
    const fresh = { ...bundle, sessionId: otherId, accessToken: 'fresh-access', refreshToken: 'fresh-refresh', revocationToken: 'fresh-revoke' };
    h.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    const restarted = h.make(); expect((await restarted.recover()).phase).toBe('locked');
    expect((await restarted.exchange(exchangeInput)).syncReady).toBe(true);
    expect(h.storage.row!.revision).toBe(retainedRevision + 2);
    expect(h.storage.row?.value.bundle.sessionId).toBe(otherId);
    expect(h.log.filter(x => x === 'transport.exchange')).toHaveLength(2);
    const h2 = harness(), c2 = await ready(h2); await c2.logoutOrSwitch();
    h2.transport.exchangeResult = { kind: 'credentials', bundle: { ...fresh, accountId: otherId } };
    const other = h2.make(); await other.recover();
    expect(await other.exchange(exchangeInput)).toMatchObject({ phase: 'locked', syncReady: false, code: 'AUTH_INVALID' });
    expect(h2.storage.row?.value.bundle.accountId).toBe(accountId);
    expect(h2.log).toContain(`transport.revoke.${fresh.revocationToken}`);
    const h3 = harness(), c3 = await ready(h3); await c3.logoutOrSwitch();
    h3.setExpectedLocalOwner({ accountId: otherId, storeId: null, installInstanceId: null, sessionId: null });
    const wrongSlot = h3.make(); expect(await wrongSlot.recover()).toMatchObject({ phase: 'locked', code: 'AUTH_INVALID' });
    expect(h3.log.filter(x => x === 'transport.exchange')).toHaveLength(1); // old sign-in only
  });
  it('reconciles retained credentials under a newer local epoch without reviving the locked family', async () => {
    const h = harness(), c = await ready(h); await c.logoutOrSwitch(); h.switchEpoch();
    const fresh = { ...bundle, sessionId: otherId, accessToken: 'new-epoch-access', refreshToken: 'new-epoch-refresh', revocationToken: 'new-epoch-revoke' };
    h.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    const restarted = h.make(2); expect((await restarted.recover()).phase).toBe('locked');
    expect((await restarted.exchange(exchangeInput)).syncReady).toBe(true);
    expect(h.storage.row?.value.localEpoch).toBe(2);
    expect(h.local.result.state === 'authorized' && h.local.result.binding.localEpoch).toBe(2);
  });
  it('keeps retained credentials and the local lock when fresh-sign-in storage loses a CAS race', async () => {
    const h = harness(), c = await ready(h); await c.logoutOrSwitch();
    const old = structuredClone(h.storage.row!);
    const fresh = { ...bundle, sessionId: otherId, accessToken: 'fresh-access', refreshToken: 'fresh-refresh', revocationToken: 'fresh-revoke' };
    h.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    const restarted = h.make(); await restarted.recover();
    const gate = deferred<void>(); h.storage.nextWriteGate = gate; h.storage.enteredWrite = deferred();
    const work = restarted.exchange(exchangeInput); await h.storage.enteredWrite.promise;
    h.storage.row = { revision: old.revision + 1, value: stable({ ...bundle, credentialGeneration: 2 }) };
    gate.resolve(); expect((await work).syncReady).toBe(false);
    expect(h.storage.row.revision).toBe(old.revision + 1);
    expect(h.local.result.state).toBe('locked');
    expect(h.log.filter(x => x === 'transport.activate.1')).toHaveLength(1); // initial sign-in only
    const h2 = harness(), c2 = await ready(h2); h2.local.failLock = true;
    expect((await c2.logoutOrSwitch()).phase).toBe('logout_incomplete');
    expect((await c2.exchange(exchangeInput)).syncReady).toBe(false);
  });
  it('validates independent local binding before local-only recovery with missing credentials', async () => {
    const valid = harness(); await ready(valid); valid.storage.row = null;
    expect(await valid.make().recover()).toMatchObject({ localAccess: 'authorized', phase: 'local_only' });
    const malformed = harness(); await ready(malformed);
    malformed.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, refreshToken: null } } as unknown as PersistedCredentials };
    expect(await malformed.make().recover()).toMatchObject({ localAccess: 'locked', phase: 'recovery_required', code: 'AUTH_RECOVERY_REQUIRED' });
    for (const mutate of [
      (h: ReturnType<typeof harness>) => { if (h.local.result.state === 'authorized') h.local.result.binding.environment = 'production'; },
      (h: ReturnType<typeof harness>) => { if (h.local.result.state === 'authorized') h.local.result.binding.localEpoch = 2; },
      (h: ReturnType<typeof harness>) => h.setExpectedLocalOwner({ accountId: otherId, storeId: null, installInstanceId: null, sessionId: null }),
      (h: ReturnType<typeof harness>) => h.setExpectedLocalOwner({ accountId: null, storeId: accountId, installInstanceId: null, sessionId: null }),
      (h: ReturnType<typeof harness>) => h.setExpectedLocalOwner({ accountId: null, storeId: null, installInstanceId: otherId, sessionId: null }),
      (h: ReturnType<typeof harness>) => { h.local.result = { state: 'authorized', binding: { environment: 'development', localEpoch: 1, accountId, sessionId, storeId: 'bad', installInstanceId: operationId } }; },
    ]) {
      const h = harness(); await ready(h); h.storage.row = null; mutate(h);
      expect(await h.make().recover()).toMatchObject({ phase: 'locked', localAccess: 'locked', code: 'AUTH_INVALID' });
      expect(h.local.locks).toBe(1);
    }
    const unreadable = harness(); await ready(unreadable); unreadable.storage.failRead = true;
    unreadable.setExpectedLocalOwner({ accountId: otherId, storeId: null, installInstanceId: null, sessionId: null });
    expect(await unreadable.make().recover()).toMatchObject({ phase: 'locked', localAccess: 'locked', code: 'AUTH_INVALID' });
    expect(unreadable.local.locks).toBe(1);
  });
  it('repairs only a damaged rotating bundle after fresh same-account verification with complete independent owner context', async () => {
    const h = harness(); await ready(h);
    h.setExpectedLocalOwner({ accountId, storeId: otherId, installInstanceId: operationId, sessionId: null });
    h.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, accountId: otherId, sessionId: otherId, refreshToken: null } } as unknown as PersistedCredentials };
    const fresh = { ...bundle, sessionId: otherId, accessToken: 'verified-fresh-access', refreshToken: 'verified-fresh-refresh', revocationToken: 'verified-fresh-revoke' };
    h.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    const restarted = h.make(); expect(await restarted.recover()).toMatchObject({ phase: 'local_only', localAccess: 'authorized', code: 'AUTH_REAUTH_REQUIRED' });
    expect((await restarted.exchange(exchangeInput)).syncReady).toBe(true);
    expect(h.storage.row?.revision).toBe(5);
    expect(h.storage.row?.value).toEqual(stable(fresh));
    expect(h.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(0);
    expect(h.log.filter(x => x === 'transport.exchange')).toHaveLength(2);
  });
  it('rejects a different verified account without replacing damaged credentials or revoking valid local access', async () => {
    const h = harness(); await ready(h);
    h.setExpectedLocalOwner({ accountId, storeId: otherId, installInstanceId: operationId, sessionId: null });
    h.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, accessToken: null } } as unknown as PersistedCredentials };
    const before = structuredClone(h.storage.row);
    const foreign = { ...bundle, accountId: otherId, sessionId: otherId, accessToken: 'foreign-access', refreshToken: 'foreign-refresh', revocationToken: 'foreign-revoke' };
    h.transport.exchangeResult = { kind: 'credentials', bundle: foreign };
    const restarted = h.make(); await restarted.recover();
    expect(await restarted.exchange(exchangeInput)).toMatchObject({ phase: 'local_only', localAccess: 'authorized', syncReady: false, code: 'AUTH_INVALID' });
    expect(h.storage.row).toEqual(before);
    expect(h.local.result.state).toBe('authorized');
    expect(h.log).toContain(`transport.revoke.${foreign.revocationToken}`);
    expect(h.log).not.toContain('transport.activate.2');
  });
  it('requires complete independent owner evidence for damaged credentials and locks mismatched local ownership', async () => {
    const h = harness(); await ready(h);
    h.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, refreshToken: null } } as unknown as PersistedCredentials };
    const noOwner = h.make(); expect(await noOwner.recover()).toMatchObject({ phase: 'recovery_required', localAccess: 'locked', syncReady: false });
    expect(await noOwner.exchange(exchangeInput)).toMatchObject({ phase: 'recovery_required', localAccess: 'locked' });
    expect(h.log.filter(x => x === 'transport.exchange')).toHaveLength(1);
    const h2 = harness(); await ready(h2);
    h2.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, refreshToken: null } } as unknown as PersistedCredentials };
    h2.setExpectedLocalOwner({ accountId, storeId: otherId, installInstanceId: otherId, sessionId: null });
    expect(await h2.make().recover()).toMatchObject({ phase: 'locked', localAccess: 'locked', code: 'AUTH_INVALID' });
    expect(h2.local.locks).toBe(1);
  });
  it('recovers a failed damaged-bundle write or readback using the same verified complete replacement', async () => {
    const create = () => {
      const h = harness();
      h.setExpectedLocalOwner({ accountId, storeId: otherId, installInstanceId: operationId, sessionId: null });
      return h;
    };
    const h = create(); await ready(h);
    h.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, refreshToken: null } } as unknown as PersistedCredentials };
    const fresh = { ...bundle, sessionId: otherId, accessToken: 'fresh-access', refreshToken: 'fresh-refresh', revocationToken: 'fresh-revoke' };
    h.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    const c = h.make(); await c.recover(); h.storage.failWrite = true;
    expect((await c.exchange(exchangeInput)).phase).toBe('persistence_retry');
    expect(h.storage.row?.revision).toBe(3); expect(h.log.filter(x => x === 'transport.activate.1')).toHaveLength(1);
    h.storage.failWrite = false;
    expect((await c.retryPendingPersistence()).syncReady).toBe(true);
    expect(h.log.filter(x => x === 'transport.exchange')).toHaveLength(2);
    const h2 = create(); await ready(h2);
    h2.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, refreshToken: null } } as unknown as PersistedCredentials };
    h2.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    const c2 = h2.make(); await c2.recover(); h2.storage.failReadAt = h2.storage.reads + 1;
    expect((await c2.exchange(exchangeInput)).phase).toBe('persistence_retry');
    expect(h2.storage.row?.value.phase).toBe('activation_pending');
    expect(h2.log.filter(x => x === 'transport.activate.1')).toHaveLength(1);
    h2.storage.failReadAt = null;
    expect((await c2.retryPendingPersistence()).syncReady).toBe(true);
    expect(h2.storage.writes).toBe(4); // original two, pending replacement, stable replacement
  });
  it('lets a newer storage revision or transition epoch win while damaged-bundle reauthentication waits', async () => {
    const h = harness(); await ready(h);
    h.setExpectedLocalOwner({ accountId, storeId: otherId, installInstanceId: operationId, sessionId: null });
    h.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, refreshToken: null } } as unknown as PersistedCredentials };
    const fresh = { ...bundle, sessionId: otherId, accessToken: 'fresh-access', refreshToken: 'fresh-refresh', revocationToken: 'fresh-revoke' };
    h.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    const c = h.make(); await c.recover();
    const gate = deferred<void>(); h.storage.nextWriteGate = gate; h.storage.enteredWrite = deferred();
    const work = c.exchange(exchangeInput); await h.storage.enteredWrite.promise;
    h.storage.row = { revision: 4, value: stable(nextBundle) }; gate.resolve();
    expect((await work).syncReady).toBe(false);
    expect(h.storage.row?.revision).toBe(4); expect(h.log.filter(x => x === 'transport.activate.2')).toHaveLength(0);
    const h2 = harness(); await ready(h2);
    h2.setExpectedLocalOwner({ accountId, storeId: otherId, installInstanceId: operationId, sessionId: null });
    h2.storage.row = { revision: 3, value: { ...stable(), bundle: { ...bundle, refreshToken: null } } as unknown as PersistedCredentials };
    h2.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    const c2 = h2.make(); await c2.recover(); h2.transport.exchangeGate = deferred(); h2.transport.exchangeEntered = deferred();
    const late = c2.exchange(exchangeInput); await h2.transport.exchangeEntered.promise;
    h2.switchEpoch(); h2.transport.exchangeGate.resolve({ kind: 'credentials', bundle: fresh }); await late;
    expect(h2.storage.row?.revision).toBe(3);
    expect(h2.log).toContain(`transport.revoke.${fresh.revocationToken}`);
    expect(c2.snapshot()).toMatchObject({ phase: 'recovery_required', localAccess: 'locked', syncReady: false, code: 'AUTH_RECOVERY_REQUIRED' });
  });
  it('does not turn temporary protected-storage unavailability into local or sync authorization', async () => {
    const h = harness(); h.local.result = { state: 'unavailable' };
    expect(await h.make().recover()).toMatchObject({ phase: 'unavailable', localAccess: 'locked', syncReady: false });
    const h2 = harness(); h2.local.result = { state: 'unavailable' };
    expect(await h2.make().exchange(exchangeInput)).toMatchObject({ phase: 'unavailable', localAccess: 'locked', syncReady: false });
    expect(h2.log).not.toContain('local.authorize');
    const h3 = harness(), c3 = await ready(h3); h3.local.result = { state: 'unavailable' };
    expect(await c3.refresh()).toMatchObject({ phase: 'unavailable', localAccess: 'locked', syncReady: false });
    expect(h3.log.filter(x => x.startsWith('transport.refresh.'))).toHaveLength(0);
    const h4 = harness(), c4 = await ready(h4); h4.local.result = { state: 'unavailable' };
    expect(await c4.recover()).toMatchObject({ phase: 'unavailable', localAccess: 'locked', syncReady: false });
  });
  it('permits a verified fresh session for the same account and rebinds durable local authorization', async () => {
    const h = harness(), c = await ready(h);
    const fresh = { ...bundle, sessionId: otherId, accessToken: 'fresh-access', refreshToken: 'fresh-refresh', revocationToken: 'fresh-revoke' };
    h.transport.exchangeResult = { kind: 'credentials', bundle: fresh };
    expect((await c.exchange(exchangeInput)).syncReady).toBe(true);
    expect(h.local.result.state === 'authorized' && h.local.result.binding.sessionId).toBe(otherId);
    expect(h.storage.row?.value.bundle.sessionId).toBe(otherId);
    expect(h.log.filter(x => x === 'local.authorize')).toHaveLength(2);
  });
  it('keeps snapshots and diagnostics free of fake secrets and raw exceptions', async () => {
    const h = harness(), c = h.make(); h.storage.failWrite = true;
    await c.exchange(exchangeInput);
    const publicText = JSON.stringify(c.snapshot());
    for (const secret of [bundle.accessToken, bundle.refreshToken, bundle.revocationToken, exchangeInput.authorizationCode, 'fake secret in raw storage error']) expect(publicText).not.toContain(secret);
  });
});
