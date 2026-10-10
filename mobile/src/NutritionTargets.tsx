import { Text, View } from 'react-native';
import type { DailyNutrition } from '../../backend/src/shared/documentPlanContract';
import { ui } from './Design';
export function NutritionTargets({
  nutrition,
  pending = false,
}: {
  nutrition: DailyNutrition | undefined;
  pending?: boolean;
}) {
  if (!nutrition) return null;
  return (
    <View style={{ gap: 10, paddingVertical: 12 }}>
      <Text accessibilityRole="header" style={ui.section}>
        Recommended nutrition targets
      </Text>
      <Text style={ui.copy}>Daily estimates{pending ? ' · Activate with Use this plan' : ''}</Text>
      {nutrition.status === 'unavailable' ? (
        <Text style={ui.copy}>Targets unavailable: {nutrition.rationale}</Text>
      ) : (
        <>
          <View style={[ui.row, { flexWrap: 'wrap', gap: 16 }]}>
            {[
              [nutrition.caloriesKcal, 'kcal'],
              [nutrition.proteinGrams, 'g protein'],
              [nutrition.carbohydrateGrams, 'g carbohydrate'],
              [nutrition.fatGrams, 'g fat'],
            ].map(([v, label]) => (
              <View key={label} style={{ minWidth: 120, gap: 4 }}>
                <Text style={ui.section}>{v}</Text>
                <Text style={ui.copy}>{label} / day</Text>
              </View>
            ))}
          </View>
          {nutrition.rationale && <Text style={ui.copy}>{nutrition.rationale}</Text>}
        </>
      )}
    </View>
  );
}
