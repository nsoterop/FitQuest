import type { Profile } from '@fitquest-rebuild/contracts';
import { EditorCoordinator } from './editor';
import type { DraftRecord, SyncSummary } from './store';
import { recordStatus, type LocalStatus } from './status';

export type ProfileEditorFields = { nick: string; zone: string; loadUnit: 'lb' | 'kg'; distanceUnit: 'mi' | 'km' };
export interface ProfileEditorSource {
  profile(): Promise<Profile | null>;
  draftRecord(id: string): Promise<DraftRecord | null>;
  syncSummary(): Promise<SyncSummary>;
}

/** Reconciles the actual profile form after navigation or explicit server adoption. */
export async function restoreProfileEditor(
  source: ProfileEditorSource,
  editor: EditorCoordinator,
  stillCurrent: () => boolean,
  apply: (fields: ProfileEditorFields) => void,
  setStatus: (status: LocalStatus) => void,
  fallbackZone: string,
): Promise<void> {
  if (editor.stamp().key !== 'profile') editor.select('profile', 0);
  if (editor.hasActiveInput('profile')) return;
  const waiting = editor.stamp();
  const [stored, draft, summary] = await Promise.all([source.profile(), source.draftRecord('profile'), source.syncSummary()]);
  if (!stillCurrent() || !editor.current(waiting) || editor.hasActiveInput('profile')) return;
  editor.select('profile', draft?.sequence ?? 0);
  if (draft?.raw) {
    apply(JSON.parse(draft.raw) as ProfileEditorFields);
    setStatus('Draft saved on this device');
  } else {
    apply({ nick: stored?.displayName ?? '', zone: stored?.timeZone ?? fallbackZone, loadUnit: stored?.units.load ?? 'lb', distanceUnit: stored?.units.distance ?? 'mi' });
    setStatus(stored ? recordStatus(true, summary.pending) : 'Unsaved changes');
  }
}
