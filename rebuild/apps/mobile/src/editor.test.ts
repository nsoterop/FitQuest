import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountTransitions } from './accountTransitions';
import { EditorCoordinator, type EditorState } from './editor';
import { chooseResultIntent, submitResultIntent } from './resultIntent';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
afterEach(() => vi.useRealTimers());

describe('UI editor and account coordination', () => {
  it('does not acknowledge an old autosave or erase newer input while writes are delayed', async () => {
    vi.useFakeTimers();
    const editor = new EditorCoordinator(); editor.select('result:one', 0);
    const first = deferred<number>(), second = deferred<number>();
    const calls: string[] = [], statuses: EditorState[] = [];
    const write = async (_key: string, raw: string) => { calls.push(raw); return raw === '12' ? first.promise : second.promise; };
    const feedback = (state: EditorState) => { statuses.push(state); };
    editor.edit('12', write, feedback);
    await vi.advanceTimersByTimeAsync(350);
    editor.edit('19', write, feedback);
    first.resolve(1); await Promise.resolve();
    expect(statuses.at(-1)).toBe('Unsaved changes');
    await vi.advanceTimersByTimeAsync(350);
    second.resolve(2); await Promise.resolve(); await Promise.resolve();
    expect(calls).toEqual(['12', '19']);
    expect(statuses.at(-1)).toBe('Draft saved on this device');
    expect(editor.stamp().sequence).toBe(2);
  });
  it('rebases input typed during delayed draft recovery without replacing it', async () => {
    vi.useFakeTimers();
    const editor = new EditorCoordinator(), writes: Array<[string, number]> = [];
    const waiting = editor.select('profile', 0);
    editor.edit('new nickname', async (_key, raw, sequence) => { writes.push([raw, sequence]); return sequence; }, () => undefined);
    editor.rebase(waiting, 7);
    await vi.advanceTimersByTimeAsync(350);
    expect(writes).toEqual([['new nickname', 8]]);
  });
  it('drops a late callback after account reset and keeps profile, activity, and result editors separate', async () => {
    vi.useFakeTimers();
    const editor = new EditorCoordinator(), gate = deferred<number>();
    const statuses: string[] = [];
    editor.select('profile', 0);
    editor.edit('A profile', () => gate.promise, (state) => statuses.push(`A:${state}`));
    await vi.advanceTimersByTimeAsync(350);
    editor.resetScope();
    editor.select('activity:sessionB', 0);
    editor.edit('B activity', async () => 1, state => statuses.push(`B:${state}`));
    gate.resolve(1); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(350);
    expect(statuses).toEqual(['A:Unsaved changes', 'A:Saving on this device…', 'B:Unsaved changes', 'B:Saving on this device…', 'B:Draft saved on this device']);
    editor.select('result:activityB', 0);
    expect(editor.stamp().key).toBe('result:activityB');
  });
  it('serializes rapid selections and installs only the latest account read', async () => {
    const transitions = new AccountTransitions(), gate = deferred<void>();
    const installed: string[] = [], reset: string[] = [];
    const first = transitions.run(() => reset.push('reset'), async ticket => { await gate.promise; if (transitions.current(ticket)) installed.push('A'); });
    const second = transitions.run(() => reset.push('reset'), async ticket => { if (transitions.current(ticket)) installed.push('B'); });
    gate.resolve(); await Promise.all([first, second]);
    expect(reset).toEqual(['reset', 'reset']);
    expect(installed).toEqual(['B']);
  });
  it('keeps a durable result identity on retry and changes it for new input', () => {
    const result = { id: '00000000-0000-4000-8000-000000000001', kind: 'timed' as const, observedAt: null, capturedAt: '2026-09-23T15:00:00.000Z', side: 'not_applicable' as const, notes: null, source: 'manual' as const, voided: false, duration: null, durationMethod: null };
    const first = chooseResultIntent(null, { duration: '12' }, result, 'op-one', 'session', 'activity');
    expect(chooseResultIntent(JSON.parse(JSON.stringify(first)) as typeof first, { duration: '12' }, { ...result, id: 'other' }, 'op-two', 'session', 'activity')).toEqual(first);
    expect(chooseResultIntent(first, { duration: '19' }, { ...result, id: 'other' }, 'op-two', 'session', 'activity').operationId).toBe('op-two');
  });
  it('keeps a newer result draft visible and durable while an older fact completion is delayed', async () => {
    vi.useFakeTimers();
    const editor = new EditorCoordinator(); editor.select('result:activity', 0);
    const gate = deferred<void>(), durable = new Map<string, { raw: string; sequence: number }>();
    const write = async (key: string, raw: string, sequence: number) => { const old = durable.get(key); if (!old || sequence > old.sequence) durable.set(key, { raw, sequence }); return durable.get(key)!.sequence; };
    const result = { id: '00000000-0000-4000-8000-000000000002', kind: 'timed' as const, observedAt: null, capturedAt: '2026-09-23T15:00:00.000Z', side: 'not_applicable' as const, notes: null, source: 'manual' as const, voided: false, duration: null, durationMethod: null };
    const intent = chooseResultIntent(null, { duration: '12' }, result, 'op-one', 'session', 'activity');
    const pending = submitResultIntent(editor, intent, write, () => undefined, async () => gate.promise);
    await Promise.resolve(); await Promise.resolve();
    editor.edit(JSON.stringify({ duration: '19' }), write, () => undefined);
    await vi.advanceTimersByTimeAsync(350);
    gate.resolve();
    const completed = await pending;
    expect(editor.current(completed)).toBe(false);
    expect(durable.get('result:activity')?.raw).toBe(JSON.stringify({ duration: '19' }));
  });
});
