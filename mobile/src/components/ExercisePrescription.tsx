import { Text, View } from 'react-native';
import type { ExerciseLogging } from '../../../backend/src/shared/exerciseLogging';
import { useWeightUnits } from '../features/account/WeightUnitPreference';
import { weightLabel, weightNumber, weightText } from '../features/account/weightUnits';
import { colors, ui } from './Design';
export function recommendation(hint: ExerciseLogging, unit: 'lb' | 'kg') {
  const range = (r: { min: number; max: number }, from?: 'lb' | 'kg') => {
    const a = from ? weightNumber(r.min, from, unit) : String(r.min),
      b = from ? weightNumber(r.max, from, unit) : String(r.max);
    return a === b ? a : `${a}–${b}`;
  };
  const dose =
    hint.setCount && hint.reps
      ? `${hint.setCount} × ${range(hint.reps)}`
      : hint.setCount
        ? `${hint.setCount} sets`
        : hint.reps
          ? `${range(hint.reps)} reps`
          : '';
  const basis = hint.load
    ? {
        per_dumbbell: ' per dumbbell',
        per_hand: ' per hand',
        barbell_total: ' total barbell',
        machine_stack: ' machine stack',
        assistance: ' assistance',
        unspecified: '',
      }[hint.load.basis]
    : '';
  return [dose, hint.load ? `${range(hint.load, hint.load.unit)} ${weightLabel(unit)}${basis}` : '']
    .filter(Boolean)
    .join(', ');
}
export function ExercisePrescription({
  prescription,
  mode,
  hint,
}: {
  prescription: string;
  mode: string;
  hint: ExerciseLogging;
}) {
  const { unit } = useWeightUnits();
  if (mode === 'completion')
    return (
      <View style={{ gap: 6 }}>
        <Text selectable style={ui.copy}>
          {weightText(prescription, unit)}
        </Text>
        {hint.description && hint.description.trim() !== prescription.trim() && (
          <Text selectable style={ui.copy}>
            {weightText(hint.description, unit)}
          </Text>
        )}
      </View>
    );
  const summary = recommendation(hint, unit);
  return summary ? (
    <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
      Recommended: {summary}
    </Text>
  ) : null;
}
