import { Text, View } from 'react-native';
import type { DocumentSession, RowDocumentPlan } from '../../backend/src/documentPlanContract';
import { colors, ui } from './Design';
import { WorkoutMarkdown } from './WorkoutMarkdown';
// Native text only. Rows never execute HTML, load remote media or parse dose values.
export function WorkoutContent({
  session,
}: {
  session: DocumentSession | RowDocumentPlan['days'][number]['sessions'][number];
}) {
  if ('workoutMarkdown' in session) return <WorkoutMarkdown source={session.workoutMarkdown} />;
  return (
    <View>
      {session.exercises.map((row, i) => (
        <View
          key={i}
          accessibilityLabel={`Exercise ${i + 1}`}
          style={{ paddingVertical: 16, gap: 6, borderBottomWidth: 1, borderColor: colors.line }}
        >
          <Text accessibilityRole="header" style={ui.section}>
            {row.exercise}
          </Text>
          <Text style={[ui.copy, { color: colors.ink }]}>{row.prescription}</Text>
        </View>
      ))}
    </View>
  );
}
