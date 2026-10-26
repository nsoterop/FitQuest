import {
  legacyExerciseLogging,
  validExerciseLogging,
  type ExerciseLogging,
} from '../../../../backend/src/shared/exerciseLogging';

// Read only explicit dose notation from older saved prescriptions. Never infer load
// from an exercise name, effort, time, distance or an unrelated number.
export function prescriptionHints(text: string, mode: string): ExerciseLogging {
  const blank: ExerciseLogging = {
    version: 1,
    setCount: null,
    reps: null,
    load: null,
    description: null,
  };
  if (
    mode === 'completion' ||
    /\b(rounds?|superset|then|intervals?|warm[ -]?up|drop[ -]?sets?|pyramid)\b|\s\+\s/i.test(text)
  )
    return blank;
  if (/\b\d{1,2}\s*sets?\s*(?:or|to|[–-])\s*\d/i.test(text)) return blank;
  const original = legacyExerciseLogging(text, mode);
  const dose = text.match(
    /^\s*(\d{1,2})\s*(?:sets?\s*(?:of|[x×:,])?\s*|[x×]\s*)(\d{1,3})(?:\s*(?:[–-]|to)\s*(\d{1,3}))?\s*(?:reps?\b)?(?=\s*(?:per\s+(?:side|arm|leg|hand)\b|each\b|\/side\b|at\b|with\b|@|[;,.(–—-]|$))/i,
  );
  const labelledSets = [...text.matchAll(/\bsets?\s*:\s*(\d{1,2})\b(?!\s*(?:[–-]|to|or)\s*\d)/gi)];
  const labelledReps = [
    ...text.matchAll(
      /\breps?\s*:\s*(\d{1,3})(?:\s*(?:[–-]|to)\s*(\d{1,3}))?\b(?!\s*(?:[–-]|to|or)\s*\d)/gi,
    ),
  ];
  const setOnly = text.match(/^\s*(\d{1,2})\s*(?:sets?\b|[x×]\s*AMRAP\b)/i);
  const setCount =
    original.setCount ??
    (dose
      ? Number(dose[1])
      : labelledSets.length === 1
        ? Number(labelledSets[0]![1])
        : setOnly
          ? Number(setOnly[1])
          : null);
  const reps =
    original.reps ??
    (dose
      ? { min: Number(dose[2]), max: Number(dose[3] ?? dose[2]) }
      : labelledReps.length === 1
        ? {
            min: Number(labelledReps[0]![1]),
            max: Number(labelledReps[0]![2] ?? labelledReps[0]![1]),
          }
        : null);
  const result: ExerciseLogging = { ...blank, setCount, reps };
  const loads = [
    ...text.matchAll(
      /\b(\d+(?:\.\d+)?)(?:\s*(?:[–-]|to)\s*(\d+(?:\.\d+)?))?\s*-?\s*(lbs?|kgs?|pounds?|kilograms?)\b/gi,
    ),
  ];
  if (
    mode === 'weighted_reps' &&
    loads.length === 1 &&
    setCount !== null &&
    !/\b\d+(?:\.\d+)?\s+or\s+\d+(?:\.\d+)?\s*(?:lbs?|kgs?|pounds?|kilograms?)\b/i.test(text)
  ) {
    const match = loads[0]!;
    result.load = {
      min: Number(match[1]),
      max: Number(match[2] ?? match[1]),
      unit: /^(kg|kilogram)/i.test(match[3]!) ? 'kg' : 'lb',
      basis: /per dumbbell/i.test(text)
        ? 'per_dumbbell'
        : /per hand|\/hand\b/i.test(text)
          ? 'per_hand'
          : /total barbell|barbell total/i.test(text)
            ? 'barbell_total'
            : /machine stack/i.test(text)
              ? 'machine_stack'
              : /assistance/i.test(text)
                ? 'assistance'
                : 'unspecified',
    };
  }
  return validExerciseLogging(result) ? result : blank;
}
