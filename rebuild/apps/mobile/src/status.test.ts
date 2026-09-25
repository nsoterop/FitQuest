import { describe, expect, it } from 'vitest';
import { EditorCoordinator } from './editor';
import { enterDetails, presentLocalStatus, recordStatus, resultInputActive, type LocalStatus } from './status';

const view = (overrides: Partial<Parameters<typeof presentLocalStatus>[0]> = {}) => presentLocalStatus({
  inputFocused: false,
  inputStatus: 'Unsaved changes',
  saveStatus: 'Unsaved changes',
  saveAttemptCurrent: false,
  hasSavedRecords: false,
  pendingCount: 0,
  ...overrides,
});

describe('screen local-status presentation', () => {
  it.each(['profile', 'session'] as const)('keeps %s draft provenance and Back destination after repeated Details entry', origin => {
    const first = enterDetails(origin, true, { returnPage: 'home', fromInput: false });
    const repeated = enterDetails('status', false, first);
    expect(repeated).toEqual({ returnPage: origin, fromInput: true });
    const details = view({ inputFocused: repeated.fromInput, inputStatus: 'Draft saved on this device', hasSavedRecords: true, pendingCount: 1 });
    expect(details.headline).toBe('Draft saved on this device');
    expect(details.currentInput).toBe('Draft saved on this device');
    expect(details.records).toBe('Saved on this device · Waiting to sync');
  });

  it('treats a choice-only result edit or recovered raw draft as current input', () => {
    const blank = { resultId: null, reps: '', duration: '', loadKind: 'none', mass: '', method: '', count: '', side: 'bilateral', repBasis: 'movement_cycles', rpe: '', rir: '', notes: '' };
    expect(resultInputActive(blank, 'Unsaved changes')).toBe(false);
    expect(resultInputActive({ ...blank, side: 'left' }, 'Unsaved changes')).toBe(true);
    expect(resultInputActive(blank, 'Draft saved on this device')).toBe(true);
  });
  it('keeps fresh A and pending-A → empty-B accounts empty, without a saved or synced claim', () => {
    expect(view({ inputFocused: true }).headline).toBe('Unsaved changes');
    expect(view({ inputFocused: true }).records).toBe('No saved records on this device');
    const a = view({ hasSavedRecords: true, pendingCount: 3 });
    expect(a.headline).toBe('Saved on this device · Waiting to sync');
    const b = view({ inputFocused: true, saveStatus: a.headline });
    expect(b.headline).toBe('Unsaved changes');
    expect(b.records).toBe('No saved records on this device');
    expect(recordStatus(true, 0)).toBe('Saved on this device');
  });

  it('keeps a raw draft distinct from committed facts and pending commands in Details', () => {
    const draft = view({ inputFocused: true, inputStatus: 'Draft saved on this device', hasSavedRecords: true, pendingCount: 4 });
    expect(draft.headline).toBe('Draft saved on this device');
    expect(draft.currentInput).toBe('Draft saved on this device');
    expect(draft.records).toBe('Saved on this device · Waiting to sync');
    const details = view({ inputFocused: true, inputStatus: draft.currentInput!, hasSavedRecords: true, pendingCount: 4 });
    expect(details.headline).toBe(draft.headline);
    expect(view({ inputFocused: false, hasSavedRecords: true, pendingCount: 4 }).currentInput).toBeNull();
  });

  it('preserves saving, failed fact with durable draft, and successful fact status through Details', () => {
    const base = { inputFocused: true, inputStatus: 'Draft saved on this device' as LocalStatus, hasSavedRecords: true, pendingCount: 1, saveAttemptCurrent: true };
    expect(view({ ...base, saveStatus: 'Saving on this device…' }).headline).toBe('Saving on this device…');
    const failed = view({ ...base, saveStatus: 'Couldn’t save latest changes' });
    expect(failed.headline).toBe('Couldn’t save latest changes');
    expect(failed.currentInput).toBe('Draft saved on this device');
    expect(failed.factSave).toBe('Couldn’t save latest changes');
    expect(failed.records).toBe('Saved on this device · Waiting to sync');
    const saved = view({ ...base, inputStatus: 'Saved on this device · Waiting to sync', saveStatus: 'Saved on this device · Waiting to sync', pendingCount: 2 });
    expect(saved.headline).toBe('Saved on this device · Waiting to sync');
    expect(saved.factSave).toBeNull();
  });

  it('ignores an old completion after newer input, editor navigation, or account reset', () => {
    const editor = new EditorCoordinator();
    const old = editor.select('result:A', 0);
    const saving = () => view({ inputFocused: true, inputStatus: 'Unsaved changes', saveStatus: 'Saving on this device…', saveAttemptCurrent: editor.current(old), hasSavedRecords: true, pendingCount: 1 });
    expect(saving().headline).toBe('Saving on this device…');
    editor.edit('new result', async (_key, _raw, sequence) => sequence, () => undefined);
    expect(view({ inputFocused: true, inputStatus: 'Unsaved changes', saveStatus: 'Couldn’t save latest changes', saveAttemptCurrent: editor.current(old), hasSavedRecords: true, pendingCount: 1 }).headline).toBe('Unsaved changes');
    editor.select('profile', 0);
    expect(saving().headline).toBe('Unsaved changes');
    editor.resetScope();
    expect(view({ inputFocused: true, inputStatus: 'Unsaved changes', saveStatus: 'Saved on this device · Waiting to sync', saveAttemptCurrent: editor.current(old) }).headline).toBe('Unsaved changes');
  });
});
