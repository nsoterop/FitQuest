import type {
  Journal,
  JournalDocument,
  SetGroup,
} from '../../../../backend/src/shared/journalContract';
import type { JournalDraft } from './journalDraft';
import {
  legacyExerciseLogging,
  type ExerciseLogging,
} from '../../../../backend/src/shared/exerciseLogging';
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
  return e?.logging ?? legacyExerciseLogging(e?.prescription ?? '', e?.mode ?? 'completion');
}
// Upgrade an older encrypted draft, never its durable operation command or server snapshot.
export function restoreJournalDraft(d: JournalDraft, id: () => string): JournalDraft {
  if (!d.document || !d.journal || d.document.version === 2) return d;
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
  if (d.version === 2) return d;
  d.version = 2;
  for (const r of d.results) {
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
    if (
      r.mode !== 'completion' &&
      r.groups.length === 1 &&
      !r.groups[0]!.removed &&
      r.groups[0]!.confirmed === false
    ) {
      while (r.groups.length < (hint.setCount ?? 1)) r.groups.push(emptySet(id, hint.load?.unit));
    }
  }
  return d;
}
export function suggestion(hint: ExerciseLogging, g: SetGroup, f: 'weight' | 'reps') {
  const range = f === 'weight' ? (g.unit === hint.load?.unit ? hint.load : null) : hint.reps;
  return range ? (range.min === range.max ? String(range.min) : `${range.min}–${range.max}`) : '';
}
export function confirmSet(
  g: SetGroup,
  fields: Record<string, string>,
  resultId: string,
  hint: ExerciseLogging,
  weighted: boolean,
): SetGroup | null {
  const next = { ...g, confirmed: true };
  for (const f of weighted ? (['weight', 'reps'] as const) : (['reps'] as const)) {
    const raw =
      fields[`${resultId}:${g.id}:${f}`] ?? (g[f] === null ? suggestion(hint, g, f) : String(g[f]));
    if (!(f === 'weight' ? /^\d+(\.\d+)?$/ : /^\d+$/).test(raw)) return null;
    const number = Number(raw);
    if (!Number.isFinite(number) || number > 1000000) return null;
    next[f] = number;
  }
  return next;
}
