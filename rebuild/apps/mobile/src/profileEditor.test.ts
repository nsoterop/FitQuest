import { describe, expect, it } from 'vitest';
import type { Profile } from '@fitquest-rebuild/contracts';
import { EditorCoordinator } from './editor';
import { restoreProfileEditor, type ProfileEditorFields, type ProfileEditorSource } from './profileEditor';
import type { LocalStatus } from './status';

const adopted: Profile = { displayName: 'Adopted server', timeZone: 'America/New_York', units: { load: 'kg', distance: 'km' } };
const old: ProfileEditorFields = { nick: 'Old local', zone: 'UTC', loadUnit: 'lb', distanceUnit: 'mi' };
const summary = { pending: 0, sending: 0, unknown: 0, blocked: 0, acknowledged: 3 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('screen-used profile editor restoration', () => {
  it('shows adopted server values after an empty save tombstone, including repeated Details/Back', async () => {
    const editor = new EditorCoordinator(); let fields = old, status: LocalStatus = 'Saved on this device';
    const source: ProfileEditorSource = { profile: async () => adopted, draftRecord: async () => ({ raw: '', sequence: 8 }), syncSummary: async () => summary };
    const restore = () => restoreProfileEditor(source, editor, () => true, next => { fields = next; }, next => { status = next; }, 'UTC');
    await restore();
    expect(fields).toEqual({ nick: 'Adopted server', zone: 'America/New_York', loadUnit: 'kg', distanceUnit: 'km' });
    expect(status).toBe('Saved on this device');
    fields = old; await restore();
    expect(fields.nick).toBe('Adopted server');
  });
  it('keeps a genuine newer raw draft distinct from the adopted record', async () => {
    const editor = new EditorCoordinator(); let fields = old, status: LocalStatus = 'Unsaved changes';
    const draft = { nick: 'Newer local draft', zone: 'UTC', loadUnit: 'lb' as const, distanceUnit: 'mi' as const };
    const source: ProfileEditorSource = { profile: async () => adopted, draftRecord: async () => ({ raw: JSON.stringify(draft), sequence: 9 }), syncSummary: async () => summary };
    await restoreProfileEditor(source, editor, () => true, next => { fields = next; }, next => { status = next; }, 'UTC');
    expect(fields).toEqual(draft);
    expect(status).toBe('Draft saved on this device');
  });
  it('does not overwrite subsequent typing or a switched account after a late read', async () => {
    const editor = new EditorCoordinator(), reading = deferred<Profile | null>();
    let fields = old, status: LocalStatus = 'Unsaved changes', active = true;
    const source: ProfileEditorSource = { profile: () => reading.promise, draftRecord: async () => ({ raw: '', sequence: 8 }), syncSummary: async () => summary };
    const pending = restoreProfileEditor(source, editor, () => active, next => { fields = next; }, next => { status = next; }, 'UTC');
    editor.edit(JSON.stringify(old), async (_key, _raw, sequence) => sequence, () => undefined);
    reading.resolve(adopted); await pending;
    expect(fields).toEqual(old); expect(status).toBe('Unsaved changes');
    editor.resetScope(); active = false;
    await restoreProfileEditor(source, editor, () => active, next => { fields = next; }, next => { status = next; }, 'UTC');
    expect(fields).toEqual(old);
  });
});
