import { describe, expect, it, vi } from 'vitest';
import { CommandSchema, type Command, type OperationOutcome } from '@fitquest-rebuild/contracts';
import { LocalHttpTransport, SyncSender, type SyncStore, type SyncTransport, type SyncView } from './sync';

vi.stubGlobal('__DEV__', true);
const command = (id: string, expectedRevision: number): Command => CommandSchema.parse({
  contractVersion: 1, operationId: id, kind: 'profile.put', expectedRevision,
  payload: { displayName: `Synthetic ${expectedRevision}`, timeZone: 'UTC', units: { load: 'lb', distance: 'mi' } },
});
const a = command('11111111-1111-4111-8111-111111111111', 0);
const b = command('22222222-2222-4222-8222-222222222222', 1);
const receipt = (item: Command): OperationOutcome => ({
  accountId: '11111111-1111-4111-8111-111111111111', operationId: item.operationId, kind: item.kind, aggregateId: 'profile', requestHash: 'a'.repeat(64), state: 'committed',
  receipt: { accountId: '11111111-1111-4111-8111-111111111111', operationId: item.operationId, kind: item.kind, aggregateId: 'profile', requestHash: 'a'.repeat(64), revision: item.expectedRevision + 1 },
});

function harness() {
  const states = new Map([[a.operationId, 'queued'], [b.operationId, 'queued']]);
  const sent: string[] = [], applied: string[] = [], views: SyncView[] = [];
  let eligible = true, identity = '11111111-1111-4111-8111-111111111111';
  let deliver: (outcome: OperationOutcome) => void = () => undefined;
  let commandMode: 'direct' | 'deferred' | 'malformed' = 'direct';
  const store: SyncStore = {
    account: 'A', generation: 1,
    recoverInterruptedSends: async () => { for (const [id, state] of states) if (state === 'sending') states.set(id, 'outcome_unknown'); },
    takeNextSyncWork: async () => {
      const item = states.get(a.operationId) === 'queued' || states.get(a.operationId) === 'outcome_unknown' ? a : states.get(a.operationId) === 'acknowledged' && (states.get(b.operationId) === 'queued' || states.get(b.operationId) === 'outcome_unknown') ? b : null;
      if (item) states.set(item.operationId, 'sending');
      return item ? { command: item, state: 'queued', attempts: 1 } : null;
    },
    markOutcomeUnknown: async id => { states.set(id, 'outcome_unknown'); },
    applySyncOutcome: async (id) => { states.set(id, 'acknowledged'); applied.push(id); },
    blockProtocolFailure: async id => { states.set(id, 'blocked'); },
    syncSummary: async () => ({ pending: [...states.values()].filter(value => value !== 'acknowledged').length, sending: [...states.values()].filter(value => value === 'sending').length, unknown: [...states.values()].filter(value => value === 'outcome_unknown').length, blocked: [...states.values()].filter(value => value === 'blocked').length, acknowledged: [...states.values()].filter(value => value === 'acknowledged').length }),
    prepareRecovery: async () => { throw new Error('No review in this test'); },
    resolveRecovery: async () => { throw new Error('No resolution in this test'); },
  };
  const transport: SyncTransport = {
    identity: async () => identity,
    command: async item => { sent.push(item.operationId); if (commandMode === 'malformed') throw new Error('Malformed success'); if (commandMode === 'deferred') return new Promise(resolve => { deliver = resolve; }); return receipt(item); },
    profile: async () => ({ revision: 0, document: null }),
    session: async () => ({ revision: 0, document: null }),
    close: () => undefined,
  };
  const sender = new SyncSender(store, transport, async () => eligible, view => views.push(view));
  return { sender, store, transport, sent, applied, states, views, setEligible: (value: boolean) => { eligible = value; }, setIdentity: (value: string) => { identity = value; }, setMode: (value: typeof commandMode) => { commandMode = value; }, deliver: (outcome: OperationOutcome) => deliver(outcome) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('actual app sender control flow', () => {
  it('holds successors during an unknown predecessor, then sends them after acknowledgement', async () => {
    const h = harness(); h.setMode('malformed');
    await h.sender.runOnce();
    expect(h.sent).toEqual([a.operationId]);
    expect(h.states.get(a.operationId)).toBe('outcome_unknown');
    expect(h.sent).not.toContain(b.operationId);
    h.setMode('direct'); await h.sender.runOnce(true);
    expect(h.sent).toEqual([a.operationId, a.operationId, b.operationId]);
    expect(h.applied).toEqual([a.operationId, b.operationId]);
    expect(h.views.at(-1)?.connection).toBe('confirmed');
  });
  it('checks account authority before any command and pauses when the fixture is expired', async () => {
    const h = harness(); h.setIdentity('22222222-2222-4222-8222-222222222222');
    await h.sender.runOnce(); expect(h.sent).toEqual([]); expect(h.views.at(-1)?.connection).toBe('sign_in_needed');
    h.setIdentity('11111111-1111-4111-8111-111111111111'); h.setEligible(false);
    await h.sender.runOnce(); expect(h.sent).toEqual([]); expect(h.views.at(-1)?.connection).toBe('sign_in_needed');
  });
  it('does not install a delayed acknowledgement after account stop', async () => {
    const h = harness(); h.setMode('deferred');
    const running = h.sender.runOnce();
    await vi.waitFor(() => expect(h.sent).toEqual([a.operationId]));
    h.sender.stop(); h.deliver(receipt(a)); await running;
    expect(h.applied).toEqual([]);
    expect(h.states.get(a.operationId)).toBe('sending');
  });
  it('never dispatches work claimed before pause, and a new sender can recover it', async () => {
    const h = harness(), taken = deferred<Awaited<ReturnType<SyncStore['takeNextSyncWork']>>>();
    let waiting = false;
    h.store.takeNextSyncWork = async () => { waiting = true; return taken.promise; };
    const running = h.sender.runOnce();
    await vi.waitFor(() => expect(waiting).toBe(true));
    h.states.set(a.operationId, 'sending');
    h.sender.stop(); taken.resolve({ command: a, state: 'queued', attempts: 1 }); await running;
    expect(h.sent).toEqual([]);
    expect(h.states.get(a.operationId)).toBe('sending');
    const next = harness(); next.states.set(a.operationId, 'sending');
    await next.sender.runOnce();
    expect(next.sent).toEqual([a.operationId, b.operationId]);
  });
  it('does not dispatch after stop while summary emission is awaited', async () => {
    const h = harness(), summary = deferred<Awaited<ReturnType<SyncStore['syncSummary']>>>();
    const original = h.store.syncSummary;
    let waiting = false;
    h.store.syncSummary = async () => { waiting = true; return summary.promise; };
    const running = h.sender.runOnce(); await vi.waitFor(() => expect(waiting).toBe(true));
    h.sender.stop(); summary.resolve(await original()); await running;
    expect(h.sent).toEqual([]);
    expect(h.views).toEqual([]);
  });
  it('rechecks eligibility immediately before each command and stops mid-batch on expiry', async () => {
    const h = harness(); let checks = 0;
    const sender = new SyncSender(h.store, h.transport, async () => { checks++; return checks <= 2; }, view => h.views.push(view));
    await sender.runOnce();
    expect(h.sent).toEqual([a.operationId]);
    expect(h.states.get(b.operationId)).toBe('outcome_unknown');
    expect(h.views.at(-1)?.connection).toBe('sign_in_needed');
    sender.stop(); sender.start(); await sender.runOnce();
    expect(h.sent).toEqual([a.operationId]);
    const restored = new SyncSender(h.store, h.transport, async () => true, view => h.views.push(view));
    await restored.runOnce(true);
    expect(h.sent).toEqual([a.operationId, b.operationId]);
    expect(h.states.get(b.operationId)).toBe('acknowledged');
  });
  it('does not dispatch after stop during the final eligibility wait', async () => {
    const h = harness(), gate = deferred<boolean>(); let calls = 0, waiting = false;
    const sender = new SyncSender(h.store, h.transport, async () => { calls++; if (calls === 2) { waiting = true; return gate.promise; } return true; }, view => h.views.push(view));
    const running = sender.runOnce(); await vi.waitFor(() => expect(waiting).toBe(true));
    sender.stop(); gate.resolve(true); await running;
    expect(h.sent).toEqual([]);
  });
  it('does not start identity or command after stop during initial eligibility lookup', async () => {
    const h = harness(), gate = deferred<boolean>(); let waiting = false, identityCalls = 0;
    h.transport.identity = async () => { identityCalls++; return '11111111-1111-4111-8111-111111111111'; };
    const sender = new SyncSender(h.store, h.transport, async () => { waiting = true; return gate.promise; }, view => h.views.push(view));
    const running = sender.runOnce(); await vi.waitFor(() => expect(waiting).toBe(true));
    sender.stop(); gate.resolve(true); await running;
    expect(identityCalls).toBe(0); expect(h.sent).toEqual([]);
  });
  it.each(['identity', 'command'] as const)('transport close during %s token lookup prevents fetch', async method => {
    const token = deferred<string | null>();
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ accountId: '11111111-1111-4111-8111-111111111111' }) })) as unknown as typeof fetch;
    const transport = new LocalHttpTransport(() => token.promise, fetcher);
    const request = method === 'identity' ? transport.identity() : transport.command(a);
    transport.close(); token.resolve('a'.repeat(64));
    await expect(request).rejects.toThrow('TRANSPORT_CLOSED');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(transport.identity()).rejects.toThrow('TRANSPORT_CLOSED');
  });
});
