import { foodDate, foodId, foodToday } from './foodContract.ts';
import { validExerciseLogging, type ExerciseLogging } from './exerciseLogging.ts';
export const loggingModes = ['weighted_reps', 'reps', 'completion'] as const;
export type LoggingMode = (typeof loggingModes)[number];
export type JournalSource = {
  planId: string;
  revision: number;
  date: string;
  sessionIndex: number;
};
export type SetGroup = {
  id: string;
  weight: number | null;
  sets: number | null;
  reps: number | null;
  unit: 'lb' | 'kg';
  removed: boolean;
  confirmed?: boolean;
};
export type JournalResult = {
  id: string;
  name: string;
  mode: LoggingMode;
  groups: SetGroup[];
  completed: boolean | null;
  removed: boolean;
  notes?: string;
};
export type JournalDocument = {
  version: 1 | 2;
  title: string;
  performedDate: string;
  timeZone: string;
  outcome: 'in_progress' | 'completed' | 'partial' | 'skipped' | 'finished';
  results: JournalResult[];
  notes: string;
};
export type JournalSnapshot = {
  source: JournalSource | null;
  schemaVersion: string | null;
  acceptedAt: string | null;
  timeZone: string | null;
  session: unknown;
  fingerprint: string;
  exercises: {
    id: string;
    position: number;
    name: string;
    prescription: string;
    mode: LoggingMode;
    logging?: ExerciseLogging;
  }[];
  workoutMarkdown: string | null;
};
export type Journal = {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  snapshot: JournalSnapshot;
  document: JournalDocument;
};
export type JournalList = {
  items: {
    id: string;
    revision: number;
    title: string;
    performedDate: string;
    outcome: JournalDocument['outcome'];
    updatedAt: string;
  }[];
  nextOffset: number | null;
};
export type JournalCompletions = {
  planId: string;
  revision: number;
  sessions: { date: string; sessionIndex: number }[];
};
export type JournalSessionStates = {
  planId: string;
  revision: number;
  sessions: {
    date: string;
    sessionIndex: number;
    journalId: string;
    hasWork: boolean;
    finished: boolean;
  }[];
};
export function validJournalSessionStates(v: unknown): v is JournalSessionStates {
  const s = v as JournalSessionStates;
  return (
    journalKeys(s, ['planId', 'revision', 'sessions']) &&
    foodId(s.planId) &&
    Number.isSafeInteger(s.revision) &&
    s.revision > 0 &&
    s.revision <= 1000000 &&
    Array.isArray(s.sessions) &&
    s.sessions.length <= 84 &&
    s.sessions.every(
      (r) =>
        journalKeys(r, ['date', 'sessionIndex', 'journalId', 'hasWork', 'finished']) &&
        foodDate(r.date) &&
        Number.isInteger(r.sessionIndex) &&
        r.sessionIndex >= 0 &&
        r.sessionIndex < 12 &&
        foodId(r.journalId) &&
        typeof r.hasWork === 'boolean' &&
        typeof r.finished === 'boolean',
    )
  );
}
export function validJournalCompletions(v: unknown): v is JournalCompletions {
  const c = v as JournalCompletions;
  return (
    journalKeys(c, ['planId', 'revision', 'sessions']) &&
    foodId(c.planId) &&
    Number.isSafeInteger(c.revision) &&
    c.revision > 0 &&
    c.revision <= 1000000 &&
    Array.isArray(c.sessions) &&
    c.sessions.length <= 84 &&
    c.sessions.every(
      (s) =>
        journalKeys(s, ['date', 'sessionIndex']) &&
        foodDate(s.date) &&
        Number.isInteger(s.sessionIndex) &&
        s.sessionIndex >= 0 &&
        s.sessionIndex < 12,
    )
  );
}
export type JournalCommand =
  | {
      operationId: string;
      kind: 'begin';
      source: JournalSource | null;
      repeat: boolean;
      title: string;
      performedDate: string;
      timeZone: string;
    }
  | {
      operationId: string;
      kind: 'save';
      journalId: string;
      expectedRevision: number;
      document: JournalDocument;
    };
export type JournalReceipt = { id: string; journalId: string; revision: number };
export const journalKeys = (v: unknown, names: string[]) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === names.length &&
  names.every((k) => Object.hasOwn(v, k));
const text = (v: unknown, max: number, empty = false): v is string =>
  typeof v === 'string' && v.length <= max && (empty || !!v.trim());
const integer = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1000000;
const numeric = (v: unknown) =>
  v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000000);
export function journalZone(v: unknown): v is string {
  try {
    return (
      typeof v === 'string' &&
      v.length <= 80 &&
      !!new Intl.DateTimeFormat('en-US', { timeZone: v }).format()
    );
  } catch {
    return false;
  }
}
export function validJournalSource(v: unknown): v is JournalSource {
  const s = v as JournalSource;
  return (
    journalKeys(s, ['planId', 'revision', 'date', 'sessionIndex']) &&
    foodId(s.planId) &&
    integer(s.revision) &&
    s.revision > 0 &&
    foodDate(s.date) &&
    integer(s.sessionIndex) &&
    s.sessionIndex < 12
  );
}
export function validJournalDocument(v: unknown): v is JournalDocument {
  const d = v as JournalDocument;
  if (
    !journalKeys(d, [
      'version',
      'title',
      'performedDate',
      'timeZone',
      'outcome',
      'results',
      'notes',
    ]) ||
    ![1, 2].includes(d.version) ||
    !text(d.title, 160) ||
    !foodDate(d.performedDate) ||
    !journalZone(d.timeZone) ||
    ![
      'in_progress',
      'completed',
      'partial',
      'skipped',
      ...(d.version === 2 ? ['finished'] : []),
    ].includes(d.outcome) ||
    !text(d.notes, 4000, true) ||
    !Array.isArray(d.results) ||
    d.results.length > 96
  )
    return false;
  return (
    new Set(d.results.map((r) => r?.id)).size === d.results.length &&
    d.results.every(
      (r) =>
        journalKeys(r, [
          'id',
          'name',
          'mode',
          'groups',
          'completed',
          'removed',
          ...(d.version === 2 ? ['notes'] : []),
        ]) &&
        (d.version === 1 || text(r.notes, 2000, true)) &&
        foodId(r.id) &&
        text(r.name, 160) &&
        loggingModes.includes(r.mode) &&
        typeof r.removed === 'boolean' &&
        (r.completed === null || typeof r.completed === 'boolean') &&
        Array.isArray(r.groups) &&
        r.groups.length >= 1 &&
        r.groups.length <= 24 &&
        new Set(r.groups.map((g) => g?.id)).size === r.groups.length &&
        r.groups.every(
          (g) =>
            journalKeys(g, [
              'id',
              'weight',
              'sets',
              'reps',
              'unit',
              'removed',
              ...(d.version === 2 ? ['confirmed'] : []),
            ]) &&
            (d.version === 1 || typeof g.confirmed === 'boolean') &&
            foodId(g.id) &&
            numeric(g.weight) &&
            (g.sets === null || integer(g.sets)) &&
            (g.reps === null || integer(g.reps)) &&
            ['lb', 'kg'].includes(g.unit) &&
            typeof g.removed === 'boolean',
        ),
    )
  );
}
export function validJournalCommand(v: unknown): v is JournalCommand {
  const c = v as JournalCommand;
  if (!c || !foodId(c.operationId)) return false;
  if (c.kind === 'begin')
    return (
      journalKeys(c, [
        'operationId',
        'kind',
        'source',
        'repeat',
        'title',
        'performedDate',
        'timeZone',
      ]) &&
      (c.source === null || validJournalSource(c.source)) &&
      typeof c.repeat === 'boolean' &&
      text(c.title, 160, true) &&
      foodDate(c.performedDate) &&
      journalZone(c.timeZone)
    );
  return (
    c.kind === 'save' &&
    journalKeys(c, ['operationId', 'kind', 'journalId', 'expectedRevision', 'document']) &&
    foodId(c.journalId) &&
    integer(c.expectedRevision) &&
    c.expectedRevision > 0 &&
    validJournalDocument(c.document)
  );
}
export function validJournal(v: unknown): v is Journal {
  const j = v as Journal;
  return (
    !!j &&
    foodId(j.id) &&
    integer(j.revision) &&
    j.revision > 0 &&
    validJournalDocument(j.document) &&
    !!j.snapshot &&
    Array.isArray(j.snapshot.exercises) &&
    j.snapshot.exercises.every(
      (e) =>
        foodId(e.id) &&
        text(e.name, 160) &&
        text(e.prescription, 1800) &&
        loggingModes.includes(e.mode) &&
        (e.logging === undefined || validExerciseLogging(e.logging)),
    ) &&
    typeof j.snapshot.fingerprint === 'string' &&
    (j.snapshot.source === null || validJournalSource(j.snapshot.source)) &&
    (j.snapshot.workoutMarkdown === null || text(j.snapshot.workoutMarkdown, 12000)) &&
    Number.isFinite(Date.parse(j.updatedAt))
  );
}
export const journalToday = foodToday;
export const journalHasWork = (d: JournalDocument) =>
  !!d.notes.trim() ||
  d.results.some(
    (r) =>
      !r.removed &&
      (!!r.notes?.trim() ||
        r.completed !== null ||
        r.groups.some(
          (g) =>
            !g.removed &&
            (g.weight !== null ||
              g.reps !== null ||
              (g.confirmed === undefined && g.sets !== null)),
        )),
  );
export const resultLogged = (r: JournalResult) =>
  !r.removed &&
  (r.mode === 'completion'
    ? r.completed !== null
    : r.groups.some(
        (g) =>
          !g.removed &&
          g.confirmed !== false &&
          (g.sets !== null || g.reps !== null || (r.mode === 'weighted_reps' && g.weight !== null)),
      ));
