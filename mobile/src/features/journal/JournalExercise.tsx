import { useWeightUnits } from '../account/WeightUnitPreference';
import { weightEntry, weightLabel, weightNumber, type WeightUnit } from '../account/weightUnits';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useState, type ReactNode } from 'react';
import { Action, colors, ui } from '../../components/Design';
import { Icon } from '../../components/Icon';
import { JournalField } from './JournalField';
import { emptySet, suggestion } from './journalSets';
import { operationId } from '../onboarding/onboardingApi';
import { type ExerciseLogging } from '../../../../backend/src/shared/exerciseLogging';
import type { JournalResult } from '../../../../backend/src/shared/journalContract';
export function JournalExercise({
  result: r,
  hint,
  fields,
  showRecommendations = true,
  disabled,
  onField,
  onChange,
}: {
  result: JournalResult;
  hint: ExerciseLogging;
  fields: Record<string, string>;
  showRecommendations?: boolean;
  disabled: boolean;
  onField: (key: string, value: string, unit?: WeightUnit) => void;
  onChange: (change: (row: JournalResult) => void) => void;
}) {
  const { unit } = useWeightUnits();
  const dimensions = useWindowDimensions();
  const tableWidth =
    dimensions.fontScale > 1.3 ? Math.round(280 * Math.min(dimensions.fontScale, 2.5)) : undefined;
  const active = r.groups.filter((g) => !g.removed);
  const canAdd = r.groups.length < 24 || r.groups.some((g) => g.removed && g.sets === 1);
  const [notesOpen, setNotesOpen] = useState(!!r.notes);
  return (
    <>
      {r.mode === 'completion' ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Completed ${r.name}`}
          accessibilityState={{ checked: r.completed === true, disabled }}
          disabled={disabled}
          onPress={() => onChange((row) => (row.completed = row.completed === true ? false : true))}
          style={[ui.row, { minHeight: 48, justifyContent: 'flex-start' }]}
        >
          <Icon
            name={r.completed === true ? 'square-check' : 'square'}
            color={r.completed === true ? colors.action : colors.muted}
          />
          <Text style={ui.copy}>Completed{r.completed === null ? ' · Not logged' : ''}</Text>
        </Pressable>
      ) : (
        <>
          <SetTable width={tableWidth}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingBottom: 4 }}>
              <Text style={[ui.label, { width: 36 }]}>Set</Text>
              {r.mode === 'weighted_reps' && (
                <Text style={[ui.label, { flex: 1 }]}>Weight ({weightLabel(unit)})</Text>
              )}
              <Text style={[ui.label, { flex: 1 }]}>Reps</Text>
            </View>
            {active.map((g, index) => {
              const i = r.groups.findIndex((x) => x.id === g.id);
              if (g.sets !== 1)
                return (
                  <View key={g.id} style={{ gap: 4 }}>
                    <Text style={ui.label}>Legacy grouped entry · retained</Text>
                    <Text style={ui.copy}>
                      {g.sets ?? 'Unknown'} sets · {g.reps ?? 'Unknown'} reps
                      {r.mode === 'weighted_reps'
                        ? ` · ${g.weight === null ? 'Unknown' : weightNumber(g.weight, g.unit, unit)} ${weightLabel(unit)}`
                        : ''}
                      . Original values retained; add individual sets below for new work.
                    </Text>
                    <Action
                      label="Remove entry"
                      accessibilityLabel={`Remove legacy group for ${r.name}`}
                      compact
                      secondary
                      disabled={disabled}
                      onPress={() =>
                        onChange((row) => (row.groups.find((x) => x.id === g.id)!.removed = true))
                      }
                    />
                  </View>
                );
              return (
                <View key={g.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Text style={[ui.copy, { width: 36 }]}>{index + 1}</Text>
                  {(r.mode === 'weighted_reps'
                    ? (['weight', 'reps'] as const)
                    : (['reps'] as const)
                  ).map((f) => {
                    const key = `${r.id}:${g.id}:${f}`,
                      rec = showRecommendations ? suggestion(hint, g, f) : '',
                      exact = /^\d+(\.\d+)?$/.test(rec);
                    const raw = fields[key] ?? (g[f] === null ? rec : String(g[f]));
                    const entry =
                      f === 'weight' ? weightEntry(raw, g.unit, unit) : { value: raw, unit };
                    return (
                      <View key={f} style={{ flex: 1 }}>
                        <JournalField
                          label={`${r.name} · set ${i + 1} · ${f === 'weight' ? `Weight (${entry.unit})` : 'Reps'}`}
                          hideLabel
                          value={entry.value}
                          numeric
                          integer={f === 'reps'}
                          disabled={disabled}
                          suggested={
                            g[f] === null &&
                            !!rec &&
                            (fields[key] === undefined || (!exact && fields[key] === rec))
                          }
                          onChange={(v) => onField(key, v, f === 'weight' ? entry.unit : undefined)}
                        />
                        {f === 'weight' && entry.unit !== unit && (
                          <Text style={{ fontSize: 12, color: colors.muted }}>
                            Unfinished {entry.unit} entry
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </SetTable>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: '#B6C4F5',
              borderRadius: 10,
              backgroundColor: colors.actionWash,
              overflow: 'hidden',
            }}
          >
            <Text style={[ui.label, { paddingHorizontal: 14 }]}>Sets · {active.length}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add set for ${r.name}`}
              accessibilityState={{ disabled: disabled || !canAdd }}
              disabled={disabled || !canAdd}
              onPress={() =>
                onChange((row) => {
                  const removed = row.groups.find((g) => g.removed && g.sets === 1);
                  if (removed) removed.removed = false;
                  else row.groups.push(emptySet(operationId, unit));
                })
              }
              style={({ pressed }) => ({
                minWidth: 48,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderLeftWidth: 1,
                borderColor: '#B6C4F5',
                opacity: disabled || !canAdd || pressed ? 0.45 : 1,
              })}
            >
              <Text style={{ fontSize: 24, color: colors.action }}>+</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Subtract set for ${r.name}`}
              accessibilityState={{ disabled: disabled || !active.some((g) => g.sets === 1) }}
              disabled={disabled || !active.some((g) => g.sets === 1)}
              onPress={() =>
                onChange((row) => {
                  const last = [...row.groups].reverse().find((g) => !g.removed && g.sets === 1);
                  if (last) last.removed = true;
                })
              }
              style={({ pressed }) => ({
                minWidth: 48,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderLeftWidth: 1,
                borderColor: '#B6C4F5',
                opacity: disabled || !active.some((g) => g.sets === 1) || pressed ? 0.45 : 1,
              })}
            >
              <Text style={{ fontSize: 24, color: colors.action }}>−</Text>
            </Pressable>
          </View>
        </>
      )}
      {notesOpen || r.notes ? (
        <JournalField
          label={`Notes for ${r.name}`}
          visibleLabel="Exercise notes · Optional"
          multiline
          maxLength={2000}
          value={r.notes ?? ''}
          disabled={disabled}
          onChange={(notes) => onChange((row) => (row.notes = notes))}
        />
      ) : (
        <Action
          label="Add notes"
          accessibilityLabel={`Add notes for ${r.name}`}
          compact
          secondary
          disabled={disabled}
          onPress={() => setNotesOpen(true)}
        />
      )}
    </>
  );
}

function SetTable({ width, children }: { width?: number; children: ReactNode }) {
  const table = <View style={{ gap: 8, ...(width ? { minWidth: width } : null) }}>{children}</View>;
  return width ? (
    <ScrollView horizontal keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {table}
    </ScrollView>
  ) : (
    table
  );
}
