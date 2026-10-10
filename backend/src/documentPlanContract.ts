import { loggingModes, type LoggingMode } from './journalContract.ts';
// Versioned display contracts. Legacy prose is never parsed into exercise records.
export const legacyDocumentPlanVersion = 'document-week-v1' as const;
export const rowDocumentPlanVersion = 'document-week-v2' as const;
export const nutritionDocumentPlanVersion = 'document-week-v3' as const;
export const documentPlanVersion = 'document-week-v4' as const;
export type DocumentVersion =
  | typeof legacyDocumentPlanVersion
  | typeof rowDocumentPlanVersion
  | typeof nutritionDocumentPlanVersion
  | typeof documentPlanVersion;
export const isDocumentVersion = (v: unknown): v is DocumentVersion =>
  v === documentPlanVersion ||
  v === nutritionDocumentPlanVersion ||
  v === rowDocumentPlanVersion ||
  v === legacyDocumentPlanVersion;
export type DocumentSession = {
  title: string;
  goal: string;
  timing: string | null;
  durationMinutes: { min: number; max: number };
  optional: boolean;
  workoutMarkdown: string;
};
export type DocumentPlan = { days: { date: string; sessions: DocumentSession[] }[] };
export type SessionOverview = Omit<DocumentSession, 'workoutMarkdown'>;
export type ExerciseRow = { exercise: string; prescription: string; loggingMode?: LoggingMode };
export type RowDocumentPlan = {
  days: { date: string; sessions: (SessionOverview & { exercises: ExerciseRow[] })[] }[];
};
export type DailyNutrition = {
  version: 1;
  status: 'available' | 'unavailable';
  caloriesKcal: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
  rationale: string | null;
};
export type NutritionDocumentPlan = RowDocumentPlan & { nutrition: DailyNutrition };
export type SavedDocumentPlan = DocumentPlan | RowDocumentPlan | NutritionDocumentPlan;
export function validDailyNutrition(v: unknown): v is DailyNutrition {
  const n = v as DailyNutrition;
  if (
    !keys(n, [
      'version',
      'status',
      'caloriesKcal',
      'proteinGrams',
      'carbohydrateGrams',
      'fatGrams',
      'rationale',
    ]) ||
    n.version !== 1 ||
    !['available', 'unavailable'].includes(n.status) ||
    (n.rationale !== null && !text(n.rationale, 600))
  )
    return false;
  const values = [n.caloriesKcal, n.proteinGrams, n.carbohydrateGrams, n.fatGrams];
  return n.status === 'unavailable'
    ? values.every((v) => v === null) && text(n.rationale, 600)
    : values.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) &&
        n.caloriesKcal! > 0;
}
export const nutritionOf = (
  p: SavedDocumentPlan | DocumentOverview | null | undefined,
): DailyNutrition | undefined => (p && 'nutrition' in p ? p.nutrition : undefined);
export type AcceptedNutrition = {
  planId: string;
  planRevision: number;
  schemaVersion: DocumentVersion;
  acceptedAt: string;
  dates: string[];
  timeZone: string;
  nutrition: DailyNutrition;
};
export type DocumentOverview = {
  nutrition?: DailyNutrition;
  days: { date: string; sessions: SessionOverview[] }[];
};
const keys = (v: unknown, names: string[]): boolean =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === names.length &&
  names.every((n) => Object.hasOwn(v, n));
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= max;
function validSessionOverview(s: SessionOverview) {
  const r = s?.durationMinutes;
  return (
    text(s.title, 160) &&
    text(s.goal, 600) &&
    (s.timing === null || text(s.timing, 600)) &&
    typeof s.optional === 'boolean' &&
    keys(r, ['min', 'max']) &&
    Number.isFinite(r.min) &&
    Number.isFinite(r.max) &&
    r.min >= 1 &&
    r.max <= 1440 &&
    r.min <= r.max
  );
}
export function documentOverview(plan: SavedDocumentPlan): DocumentOverview {
  return {
    ...(nutritionOf(plan) ? { nutrition: nutritionOf(plan) } : {}),
    days: plan.days.map((d) => ({
      date: d.date,
      sessions: d.sessions.map((s) => ({
        title: s.title,
        goal: s.goal,
        timing: s.timing,
        durationMinutes: { ...s.durationMinutes },
        optional: s.optional,
      })),
    })),
  };
}
export function validDocument(v: unknown, dates: string[], details = true): v is DocumentPlan {
  const p = v as DocumentPlan;
  return (
    keys(p, ['days']) &&
    Array.isArray(p.days) &&
    p.days.length === 7 &&
    dates.length === 7 &&
    p.days.every(
      (d, i) =>
        keys(d, ['date', 'sessions']) &&
        d.date === dates[i] &&
        Array.isArray(d.sessions) &&
        d.sessions.length <= 12 &&
        d.sessions.every((s) => {
          return (
            keys(s, [
              'title',
              'goal',
              'timing',
              'durationMinutes',
              'optional',
              ...(details ? ['workoutMarkdown'] : []),
            ]) &&
            validSessionOverview(s) &&
            (!details || text(s.workoutMarkdown, 12000))
          );
        }),
    )
  );
}
export function validDocumentOverview(
  v: unknown,
  dates: string[],
  version?: unknown,
): v is DocumentOverview {
  const p = v as DocumentOverview;
  if (version === documentPlanVersion || version === nutritionDocumentPlanVersion) {
    if (!keys(p, ['days', 'nutrition']) || !validDailyNutrition(p.nutrition)) return false;
    return validDocument({ days: p.days }, dates, false);
  }
  return validDocument(v, dates, false);
}

export function validSavedDocument(
  v: unknown,
  dates: string[],
  version: unknown,
): v is SavedDocumentPlan {
  if (version === legacyDocumentPlanVersion) return validDocument(v, dates);
  if (
    version !== documentPlanVersion &&
    version !== nutritionDocumentPlanVersion &&
    version !== rowDocumentPlanVersion
  )
    return false;
  const p = v as NutritionDocumentPlan;
  if (
    (version === documentPlanVersion || version === nutritionDocumentPlanVersion) &&
    !validDailyNutrition(p?.nutrition)
  )
    return false;
  if (
    !keys(p, version !== rowDocumentPlanVersion ? ['days', 'nutrition'] : ['days']) ||
    !Array.isArray(p.days) ||
    p.days.length !== 7 ||
    dates.length !== 7
  )
    return false;
  return p.days.every(
    (d, i) =>
      keys(d, ['date', 'sessions']) &&
      d.date === dates[i] &&
      Array.isArray(d.sessions) &&
      d.sessions.length <= 12 &&
      d.sessions.every((s) => {
        if (
          !keys(s, ['title', 'goal', 'timing', 'durationMinutes', 'optional', 'exercises']) ||
          !Array.isArray(s.exercises) ||
          !s.exercises.length ||
          s.exercises.length > 64
        )
          return false;
        const { exercises, ...overview } = s;
        return (
          validSessionOverview(overview) &&
          exercises.every(
            (r) =>
              keys(
                r,
                version === documentPlanVersion
                  ? ['exercise', 'prescription', 'loggingMode']
                  : ['exercise', 'prescription'],
              ) &&
              (version !== documentPlanVersion || loggingModes.includes(r.loggingMode!)) &&
              text(r.exercise, 160) &&
              text(r.prescription, 1800),
          ) &&
          exercises.reduce((n, r) => n + r.exercise.length + r.prescription.length, 0) <= 12000
        );
      }),
  );
}
