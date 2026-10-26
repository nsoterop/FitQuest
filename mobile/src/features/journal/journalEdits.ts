import {
  validJournalDocument,
  journalHasWork,
  type Journal,
  type JournalSource,
} from '../../../../backend/src/shared/journalContract';
import type { JournalDraft } from './journalDraft';

// JSONB may reorder keys. Identity is values, never serialization order or session title.
export const journalSourceKey = (s: JournalSource | null | undefined) =>
  s ? `${s.planId}:${s.revision}:${s.date}:${s.sessionIndex}` : '';
export function journalProjection(d: JournalDraft) {
  const incomplete: Record<string, string> = {};
  const activeIncomplete: Record<string, string> = {};
  if (!d.document) return { document: null, incomplete, activeIncomplete };
  const doc = structuredClone(d.document);
  const recognized = new Set<string>();
  for (const r of doc.results)
    for (const g of r.groups)
      for (const f of ['weight', 'sets', 'reps'] as const) {
        const key = `${r.id}:${g.id}:${f}`,
          raw = d.fields[key];
        recognized.add(key);
        if (raw === undefined) continue;
        if (doc.version === 2 && f === 'sets') {
          incomplete[key] = raw;
          if (!r.removed && !g.removed) activeIncomplete[key] = raw;
          continue;
        }
        if (!raw.trim()) g[f] = null;
        else {
          if (
            !(f === 'weight' ? /^\d+(\.\d+)?$/ : /^\d+$/).test(raw.trim()) ||
            Number(raw) > 1000000
          ) {
            incomplete[key] = raw;
            if (!r.removed && !g.removed) activeIncomplete[key] = raw;
            g[f] = null;
            if (doc.version === 2) g.confirmed = false;
            continue;
          }
          g[f] = Number(raw);
        }
      }
  for (const [key, raw] of Object.entries(d.fields))
    if (!recognized.has(key)) {
      incomplete[key] = raw;
      activeIncomplete[key] = raw;
    }
  return { document: validJournalDocument(doc) ? doc : null, incomplete, activeIncomplete };
}
export function editedDocument(d: JournalDraft) {
  const result = journalProjection(d);
  return Object.keys(result.incomplete).length ? null : result.document;
}
export function acknowledgeJournal(
  sent: JournalDraft,
  current: JournalDraft,
  journal: Journal,
): JournalDraft {
  const newer = current !== sent;
  const projection = journalProjection(current),
    incomplete = projection.incomplete;
  const waiting = Object.keys(projection.activeIncomplete).length > 0;
  const document = newer ? current.document : structuredClone(journal.document);
  if (document && current.finishRequested && waiting) document.outcome = 'finished';
  return {
    ...current,
    journal,
    source: journal.snapshot.source,
    document,
    baseline: structuredClone(journal.document),
    fields: newer ? current.fields : incomplete,
    pending: null,
    dirty: newer || waiting,
    finishRequested: newer || waiting ? current.finishRequested : false,
    savedAt: Date.now(),
  };
}
export const hasJournalWork = (d: JournalDraft) =>
  !!d.document &&
  (!!d.document.notes.trim() ||
    Object.values(d.fields).some((v) => !!v.trim()) ||
    journalHasWork(d.document));
