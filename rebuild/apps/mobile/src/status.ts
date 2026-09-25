import type { EditorState } from './editor';
import type { SyncConnection, SyncView } from './sync';

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

export function recordStatus(hasSavedRecords: boolean, pendingCount: number, syncConnection?: SyncConnection): LocalStatus {
  if (!hasSavedRecords) return 'No saved records on this device';
  if (syncConnection && ['blocked', 'unknown', 'unavailable', 'sign_in_needed'].includes(syncConnection)) return 'Saved on this device';
  return pendingCount > 0 ? 'Saved on this device · Waiting to sync' : 'Saved on this device';
}

export function syncStatusLabel(view: SyncView): string {
  switch (view.connection) {
    case 'disabled': return 'Not enabled for this local test';
    case 'no_records': return 'No server-confirmed records yet';
    case 'pending': return `${view.summary.pending} pending`;
    case 'sending': return `${view.summary.pending} pending · Sending`;
    case 'confirmed': return 'Confirmed on local API';
    case 'blocked': return `${view.summary.blocked} blocked · Review required`;
    case 'unknown': return 'Outcome unknown · Retry same operation';
    case 'unavailable': return 'Local API unavailable · Will retry';
    case 'sign_in_needed': return 'Fixture authority needed · Sending paused';
  }
}

/** The same presentation drives the header and Details. The input focus survives navigation. */
export function presentLocalStatus(input: {
  inputFocused: boolean;
  inputStatus: LocalStatus;
  saveStatus: LocalStatus;
  saveAttemptCurrent: boolean;
  hasSavedRecords: boolean;
  pendingCount: number;
  syncConnection?: SyncConnection;
}) {
  const records = recordStatus(input.hasSavedRecords, input.pendingCount, input.syncConnection);
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
