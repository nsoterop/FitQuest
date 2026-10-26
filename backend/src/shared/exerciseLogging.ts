// Optional versioned display hints. Prescriptions remain the authoritative readable source.
export type NumberRange = { min: number; max: number };
export const weightBases = [
  'per_dumbbell',
  'per_hand',
  'barbell_total',
  'machine_stack',
  'assistance',
  'unspecified',
] as const;
export type ExerciseLogging = {
  version: 1;
  setCount: number | null;
  reps: NumberRange | null;
  load: (NumberRange & { unit: 'lb' | 'kg'; basis: (typeof weightBases)[number] }) | null;
  description: string | null;
};
const keys = (v: unknown, k: string[]) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === k.length &&
  k.every((x) => Object.hasOwn(v, x));
const range = (v: NumberRange, integer = false) =>
  typeof v.min === 'number' &&
  typeof v.max === 'number' &&
  Number.isFinite(v.min) &&
  Number.isFinite(v.max) &&
  v.min >= 0 &&
  v.max >= v.min &&
  v.max <= 1000000 &&
  (!integer || (Number.isInteger(v.min) && Number.isInteger(v.max)));
export function validExerciseLogging(v: unknown): v is ExerciseLogging {
  const m = v as ExerciseLogging;
  return (
    keys(m, ['version', 'setCount', 'reps', 'load', 'description']) &&
    m.version === 1 &&
    (m.setCount === null ||
      (Number.isInteger(m.setCount) && m.setCount >= 1 && m.setCount <= 24)) &&
    (m.reps === null || (keys(m.reps, ['min', 'max']) && range(m.reps, true))) &&
    (m.load === null ||
      (keys(m.load, ['min', 'max', 'unit', 'basis']) &&
        range(m.load) &&
        ['lb', 'kg'].includes(m.load.unit) &&
        weightBases.includes(m.load.basis))) &&
    (m.description === null ||
      (typeof m.description === 'string' && m.description.length <= 1200 && !!m.description.trim()))
  );
}
export const weightBasisLabel = (
  basis: NonNullable<ExerciseLogging['load']>['basis'],
  unit: string,
) =>
  `${({ per_dumbbell: 'Weight per dumbbell', per_hand: 'Weight per hand', barbell_total: 'Total barbell weight', machine_stack: 'Machine stack weight', assistance: 'Assistance weight' } as Record<string, string>)[basis] ?? 'Weight · basis unspecified'} (${unit})`;

// Deliberately narrow legacy forms only. Composite work and ambiguous numbers stay manual.
export function legacyExerciseLogging(prescription: string, mode: string): ExerciseLogging {
  const blank: ExerciseLogging = {
    version: 1,
    setCount: null,
    reps: null,
    load: null,
    description: null,
  };
  if (mode === 'completion' || /\b(rounds?|superset|then|intervals?)\b|\s\+\s/i.test(prescription))
    return blank;
  const m = prescription.match(
    /^\s*(\d{1,2})\s*(?:[×x]\s*|sets?\s+of\s+)(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?\s*(?:reps?)?(?=\s*(?:at|@|;|\.|$))/i,
  );
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 24) return blank;
  const result: ExerciseLogging = {
    ...blank,
    setCount: Number(m[1]),
    reps: { min: Number(m[2]), max: Number(m[3] ?? m[2]) },
  };
  const loads = [
    ...prescription.matchAll(
      /(?:\bat|@)\s*(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*(lb|kg)\b/gi,
    ),
  ];
  if (mode === 'weighted_reps' && loads.length === 1) {
    const l = loads[0]!;
    const basis: NonNullable<ExerciseLogging['load']>['basis'] = /per dumbbell/i.test(prescription)
      ? 'per_dumbbell'
      : /per hand/i.test(prescription)
        ? 'per_hand'
        : /total barbell|barbell total/i.test(prescription)
          ? 'barbell_total'
          : /assistance/i.test(prescription)
            ? 'assistance'
            : 'unspecified';
    result.load = {
      min: Number(l[1]),
      max: Number(l[2] ?? l[1]),
      unit: l[3]!.toLowerCase() as 'lb' | 'kg',
      basis,
    };
  }
  return validExerciseLogging(result) ? result : blank;
}
