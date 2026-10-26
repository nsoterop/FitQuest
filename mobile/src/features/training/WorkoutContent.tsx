import { ExercisePrescription } from '../../components/ExercisePrescription';
import { prescriptionHints } from '../journal/prescriptionHints';
import { Text, View } from 'react-native';
import type {
  DocumentSession,
  RowDocumentPlan,
} from '../../../../backend/src/shared/documentPlanContract';
import { colors, ui } from '../../components/Design';
import { WorkoutMarkdown } from './WorkoutMarkdown';
import { ExerciseInfo } from '../../components/ExerciseInfo';
// Native text only. Rows never execute HTML, load remote media or parse dose values.
export function WorkoutContent({
  session,
}: {
  session: DocumentSession | RowDocumentPlan['days'][number]['sessions'][number];
}) {
  if ('workoutMarkdown' in session)
    return (
      <View style={ui.row}>
        <Text style={ui.label}>Session details</Text>
        <ExerciseInfo name={session.title} prescription={session.workoutMarkdown}>
          <WorkoutMarkdown source={session.workoutMarkdown} />
        </ExerciseInfo>
      </View>
    );
  return (
    <View>
      {session.exercises.map((row, i) => {
        const mode = row.loggingMode ?? 'completion',
          fallback = prescriptionHints(row.prescription, mode),
          hint = {
            ...fallback,
            ...row.logging,
            setCount: row.logging?.setCount ?? fallback.setCount,
            reps: row.logging?.reps ?? fallback.reps,
            load: row.logging?.load ?? fallback.load,
          };
        return (
          <View
            key={i}
            accessibilityLabel={`Exercise ${i + 1}`}
            style={{ paddingVertical: 16, gap: 6, borderBottomWidth: 1, borderColor: colors.line }}
          >
            <View style={ui.row}>
              <Text accessibilityRole="header" style={[ui.section, { flex: 1 }]}>
                {row.exercise}
              </Text>
              <ExerciseInfo
                name={row.exercise}
                prescription={row.prescription}
                description={row.logging?.description}
              />
            </View>
            <ExercisePrescription
              prescription={row.prescription}
              mode={row.loggingMode ?? 'completion'}
              hint={hint}
            />
          </View>
        );
      })}
    </View>
  );
}
