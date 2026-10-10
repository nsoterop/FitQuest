import type { secureSessionStorage } from '../account/secureSessionStorage';
import type { LibraryCommand, LibraryDocument } from '../../../../backend/src/shared/foodContract';
export type LibraryDraft = {
  document: LibraryDocument | null;
  editingId: string | null;
  revision: number | null;
  pending: LibraryCommand | null;
  fields: Record<string, string>;
  savedAt: number;
};
export const emptyLibraryDraft = (): LibraryDraft => ({
  document: null,
  editingId: null,
  revision: null,
  pending: null,
  fields: {},
  savedAt: Date.now(),
});
export function libraryDrafts(storage: ReturnType<typeof secureSessionStorage>) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>) => {
    const p = queue.then(fn);
    queue = p.catch(() => {});
    return p;
  };
  const key = (id: string) => `library.${id}`;
  return {
    read: (id: string) =>
      run(async () => {
        const raw = await storage.getItem(key(id));
        if (!raw) return null;
        try {
          const v = JSON.parse(raw);
          if (
            raw.length <= 45000 &&
            Number.isFinite(v.savedAt) &&
            v.savedAt <= Date.now() &&
            Date.now() - v.savedAt < 86400000 &&
            v.fields &&
            typeof v.fields === 'object' &&
            Object.values(v.fields).every((x) => typeof x === 'string') &&
            (v.document === null || (v.document && Array.isArray(v.document.ingredients)))
          )
            return v as LibraryDraft;
        } catch {}
        await storage.removeItem(key(id));
        return null;
      }),
    write: (id: string, d: LibraryDraft) =>
      run(async () => {
        const raw = JSON.stringify(d);
        if (raw.length > 45000) throw Error();
        await storage.setItem(key(id), raw);
      }),
    clear: (id: string) => run(() => storage.removeItem(key(id))),
  };
}
