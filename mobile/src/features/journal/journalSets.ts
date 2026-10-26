import type {
  Journal,
  JournalDocument,
  SetGroup,
} from '../../../../backend/src/shared/journalContract';
import type { JournalDraft } from './journalDraft';
import type { ExerciseLogging } from '../../../../backend/src/shared/exerciseLogging';
import { prescriptionHints } from './prescriptionHints';
export const emptySet = (id: () => string, unit: 'lb' | 'kg' = 'lb'): SetGroup => ({
  id: id(),
  weight: null,
  sets: 1,
  reps: null,
  unit,
  removed: false,
  confirmed: false,
});
export function loggingFor(j: Journal, resultId: string): ExerciseLogging {
  const e = j.snapshot.exercises.find((e) => e.id === resultId);
  const fallback = prescriptionHints(e?.prescription ?? '', e?.mode ?? 'completion');
  if (!e?.logging) return fallback;
  return {
    ...e.logging,
    setCount: e.logging.setCount ?? fallback.setCount,
    reps: e.logging.reps ?? fallback.reps,
    load: e.logging.load ?? fallback.load,
  };
}
// Upgrade an older encrypted draft, never its durable operation command or server snapshot.
export function restoreJournalDraft(d: JournalDraft, id: () => string): JournalDraft {
  if (!d.document || !d.journal) return d;
  if (d.document.version === 2) {
    if (!d.dirty && !d.pending) return d;
    const document = editableJournal({ ...d.journal, document: d.document }, id);
    return JSON.stringify(document) === JSON.stringify(d.document) ? d : { ...d, document };
  }
  const original = structuredClone(d.document),
    fields: Record<string, string> = { ...d.fields },
    touched = new Set<string>();
  for (const r of original.results)
    for (const g of r.groups)
      for (const f of ['weight', 'sets', 'reps'] as const) {
        const key = `${r.id}:${g.id}:${f}`,
          raw = d.fields[key];
        if (raw === undefined) continue;
        touched.add(g.id);
        if (!raw.trim()) {
          g[f] = null;
          delete fields[key];
        } else if (
          (f === 'weight' ? /^\d+(\.\d+)?$/ : /^\d+$/).test(raw) &&
          Number(raw) <= 1000000
        ) {
          g[f] = Number(raw);
          delete fields[key];
        } else {
          fields[key] = raw;
          g[f] = null;
        }
      }
  const document = editableJournal({ ...d.journal, document: original }, id);
  for (const r of document.results) {
    const old = original.results.find((x) => x.id === r.id)!;
    let origin = old.groups[0]?.id;
    for (const g of r.groups) {
      if (old.groups.some((x) => x.id === g.id)) origin = g.id;
      if (origin && touched.has(origin)) g.confirmed = false;
      for (const f of ['weight', 'reps'] as const) {
        const raw = fields[`${r.id}:${origin}:${f}`];
        if (raw !== undefined) fields[`${r.id}:${g.id}:${f}`] = raw;
      }
    }
  }
  return { ...d, document, fields, baseline: undefined };
}
// A local editing/view copy only; reading never writes a historical document back to the API.
export function editableJournal(j: Journal, id: () => string): JournalDocument {
  const d = structuredClone(j.document);
  const legacy = d.version === 1;
  d.version = 2;
  for (const r of d.results) {
    if (!legacy) {
      seedRecommendedSets(j, d, r.id, id);
      continue;
    }
    r.notes = '';
    const hint = loggingFor(j, r.id);
    const expanded: SetGroup[] = [];
    for (const [index, g] of r.groups.entries()) {
      const entered = g.weight !== null || g.sets !== null || g.reps !== null;
      if (!entered) {
        expanded.push({ ...g, sets: 1, confirmed: false, unit: hint.load?.unit ?? g.unit });
        continue;
      }
      const n = g.sets;
      if (
        !g.removed &&
        n !== null &&
        Number.isInteger(n) &&
        n >= 1 &&
        n <= 24 &&
        g.reps !== null &&
        expanded.length + n + (r.groups.length - index - 1) <= 24
      ) {
        for (let k = 0; k < n; k++)
          expanded.push({ ...g, id: k === 0 ? g.id : id(), sets: 1, confirmed: true });
      } else expanded.push({ ...g, confirmed: true });
    }
    r.groups = expanded;
    seedRecommendedSets(j, d, r.id, id);
  }
  return d;
}
function seedRecommendedSets(j: Journal, d: JournalDocument, resultId: string, id: () => string) {
  const r = d.results.find((r) => r.id === resultId)!;
  if (
    d.outcome !== 'in_progress' ||
    r.mode === 'completion' ||
    r.removed ||
    r.groups.length !== 1 ||
    r.groups[0]!.removed ||
    r.groups[0]!.sets !== 1
  )
    return;
  const hint = loggingFor(j, resultId);
  const first = r.groups[0]!;
  if (
    (hint.setCount ?? 1) > 1 &&
    !first.confirmed &&
    first.weight === null &&
    first.reps === null &&
    hint.load
  )
    first.unit = hint.load.unit;
  while (r.groups.length < (hint.setCount ?? 1))
    r.groups.push(emptySet(id, hint.load?.unit ?? r.groups[0]!.unit));
}
export function suggestion(hint: ExerciseLogging, g: SetGroup, f: 'weight' | 'reps') {
  if (g.confirmed) return '';
  const range = f === 'weight' ? (g.unit === hint.load?.unit ? hint.load : null) : hint.reps;
  return range ? (range.min === range.max ? String(range.min) : `${range.min}–${range.max}`) : '';
}
// Finish is the explicit recording action. Opening/autosaving never turns a
// recommendation into performed work. Ranges stay raw until replaced or cleared.
export function finishVisibleSets(d: JournalDraft): JournalDraft {
  if (!d.document || !d.journal || d.document.version !== 2) return d;
  const document = structuredClone(d.document),
    fields = { ...d.fields };
  document.outcome = 'finished';
  for (const r of document.results) {
    if (r.removed || r.mode === 'completion') continue;
    const hint = loggingFor(d.journal, r.id);
    for (const g of r.groups) {
      if (g.removed || g.sets !== 1) continue;
      let valid = true,
        entered = false;
      const numericFields: readonly ('weight' | 'reps')[] =
        r.mode === 'weighted_reps' ? ['weight', 'reps'] : ['reps'];
      for (const f of numericFields) {
        const key = `${r.id}:${g.id}:${f}`;
        const raw = fields[key] ?? (g[f] === null ? suggestion(hint, g, f) : String(g[f]));
        if (!raw.trim()) {
          g[f] = null;
          continue;
        }
        if (
          (f === 'weight' ? /^\d+(\.\d+)?$/ : /^\d+$/).test(raw.trim()) &&
          Number(raw) <= 1000000
        ) {
          g[f] = Number(raw);
          entered = true;
        } else {
          fields[key] = raw;
          g[f] = null;
          valid = false;
        }
      }
      g.confirmed = valid && entered;
    }
  }
  return { ...d, document, fields };
}
