import type { EditorState } from './editor';

export type LocalStatus = EditorState | 'Saved on this device' | 'Saved on this device · Waiting to sync' | 'No saved records on this device';
export type DetailsOrigin = 'home' | 'profile' | 'session';
export type DetailsRoute = { returnPage: DetailsOrigin; fromInput: boolean };

/** Re-entering Details leaves its original editor focus and Back destination intact. */
export function enterDetails(page: DetailsOrigin | 'status', editing: boolean, prior: DetailsRoute): DetailsRoute {
  return page === 'status' ? prior : { returnPage: page, fromInput: editing };
}

export function resultInputActive(form: {
  resultId: string | null; reps: string; duration: string; loadKind: string; mass: string;
  method: string; count: string; side: string; repBasis: string; rpe: string; rir: string; notes: string;
}, draftStatus: LocalStatus): boolean {
  return form.resultId !== null || form.reps !== '' || form.duration !== '' || form.loadKind !== 'none' ||
    form.mass !== '' || form.method !== '' || form.count !== '' || form.side !== 'bilateral' ||
    form.repBasis !== 'movement_cycles' || form.rpe !== '' || form.rir !== '' || form.notes !== '' ||
    draftStatus === 'Draft saved on this device' || draftStatus === 'Saving on this device…' || draftStatus === 'Couldn’t save latest changes';
}

export function recordStatus(hasSavedRecords: boolean, pendingCount: number): LocalStatus {
  if (!hasSavedRecords) return 'No saved records on this device';
  return pendingCount > 0 ? 'Saved on this device · Waiting to sync' : 'Saved on this device';
}

/** The same presentation drives the header and Details. The input focus survives navigation. */
export function presentLocalStatus(input: {
  inputFocused: boolean;
  inputStatus: LocalStatus;
  saveStatus: LocalStatus;
  saveAttemptCurrent: boolean;
  hasSavedRecords: boolean;
  pendingCount: number;
}) {
  const records = recordStatus(input.hasSavedRecords, input.pendingCount);
  const savingOrFailed = input.saveAttemptCurrent &&
    (input.saveStatus === 'Saving on this device…' || input.saveStatus === 'Couldn’t save latest changes')
    ? input.saveStatus : null;
  return {
    headline: savingOrFailed ?? (input.inputFocused ? input.inputStatus : records),
    currentInput: input.inputFocused ? input.inputStatus : null,
    factSave: savingOrFailed,
    records,
  };
}
