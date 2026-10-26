import type { WeightUnit } from '../../../../backend/src/shared/accountPreferences';
export type { WeightUnit };
const poundsPerKg = 1 / 0.45359237;
export const convertWeight = (n: number, from: WeightUnit, to: WeightUnit) =>
  from === to ? n : from === 'lb' ? n / poundsPerKg : n * poundsPerKg;
export const weightNumber = (n: number, from: WeightUnit, to: WeightUnit) =>
  from === to ? String(n) : String(Number(convertWeight(n, from, to).toFixed(2)));
export const weightLabel = (unit: WeightUnit) => (unit === 'lb' ? 'lbs' : 'kg');
// Incomplete text keeps its original unit until the user completes/clears it.
export function weightEntry(raw: string, from: WeightUnit, to: WeightUnit) {
  if (from === to || !raw.trim()) return { value: raw, unit: to };
  if (/^\d+(\.\d+)?$/.test(raw.trim()))
    return { value: weightNumber(Number(raw), from, to), unit: to };
  const range = raw.match(/^(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?)$/);
  if (range)
    return {
      value: `${weightNumber(Number(range[1]), from, to)}–${weightNumber(Number(range[2]), from, to)}`,
      unit: to,
    };
  return { value: raw, unit: from };
}
// Display only: preserve the authoritative prescription and its original source units.
export function weightText(text: string, unit: WeightUnit) {
  return text.replace(
    /\b((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:\s*([–-]|to)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?))?\s*(lbs?|kgs?|pounds?|kilograms?)\b/gi,
    (_all, a, join, b, u) => {
      const from: WeightUnit = /^(kg|kilogram)/i.test(u) ? 'kg' : 'lb';
      if (from === unit) return _all;
      return `${weightNumber(Number(a.replaceAll(',', '')), from, unit)}${b ? `${join === 'to' ? ' to ' : join}${weightNumber(Number(b.replaceAll(',', '')), from, unit)}` : ''} ${weightLabel(unit)}`;
    },
  );
}
