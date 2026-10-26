import {
  validJournalDocument,
  type Journal,
  type JournalSource,
} from '../../../../backend/src/shared/journalContract';
import type { JournalDraft } from './journalDraft';

// JSONB may reorder keys. Identity is values, never serialization order or session title.
export const journalSourceKey = (s: JournalSource | null | undefined) =>
  s ? `${s.planId}:${s.revision}:${s.date}:${s.sessionIndex}` : '';
export function editedDocument(d: JournalDraft) {
  if (!d.document) return null;
  const doc = structuredClone(d.document);
  for (const r of doc.results)
    for (const g of r.groups)
      for (const f of ['weight', 'sets', 'reps'] as const) {
        const raw = d.fields[`${r.id}:${g.id}:${f}`];
        if (raw === undefined) continue;
        if (!raw.trim()) g[f] = null;
        else {
          if (!(f === 'weight' ? /^\d+(\.\d+)?$/ : /^\d+$/).test(raw.trim())) return null;
          g[f] = Number(raw);
        }
      }
  return validJournalDocument(doc) ? doc : null;
}
export function acknowledgeJournal(
  sent: JournalDraft,
  current: JournalDraft,
  journal: Journal,
): JournalDraft {
  const newer = current !== sent;
  return {
    ...current,
    journal,
    source: journal.snapshot.source,
    document: newer ? current.document : structuredClone(journal.document),
    fields: newer ? current.fields : {},
    pending: null,
    dirty: newer,
    savedAt: Date.now(),
  };
}
export const hasJournalWork = (d: JournalDraft) =>
  !!d.document &&
  (!!d.document.notes.trim() ||
    Object.values(d.fields).some((v) => !!v.trim()) ||
    d.document.results.some(
      (r) =>
        !r.removed &&
        (r.completed !== null ||
          r.groups.some(
            (g) => !g.removed && (g.weight !== null || g.reps !== null || g.sets !== null),
          )),
    ));
