export type WeightUnit = 'lb' | 'kg';
export type AccountPreferences = { weightUnit: WeightUnit; revision: number };
export type PreferencesChange = { weightUnit: WeightUnit; expectedRevision: number };
export const validWeightUnit = (v: unknown): v is WeightUnit => v === 'lb' || v === 'kg';
export function validPreferences(v: unknown): v is AccountPreferences {
  const p = v as AccountPreferences;
  return (
    !!p &&
    typeof p === 'object' &&
    !Array.isArray(p) &&
    Object.keys(p).length === 2 &&
    validWeightUnit(p.weightUnit) &&
    Number.isSafeInteger(p.revision) &&
    p.revision >= 0 &&
    p.revision < 2147483647
  );
}
export function validPreferencesChange(v: unknown): v is PreferencesChange {
  const p = v as PreferencesChange;
  return (
    !!p &&
    typeof p === 'object' &&
    !Array.isArray(p) &&
    Object.keys(p).length === 2 &&
    validWeightUnit(p.weightUnit) &&
    Number.isSafeInteger(p.expectedRevision) &&
    p.expectedRevision >= 0 &&
    p.expectedRevision < 2147483646
  );
}
