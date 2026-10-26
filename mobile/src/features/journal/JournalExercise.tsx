import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { Action, colors, ui } from '../../components/Design';
import { Icon } from '../../components/Icon';
import { JournalField } from './JournalField';
import { emptySet, suggestion } from './journalSets';
import { operationId } from '../onboarding/onboardingApi';
import {
  weightBasisLabel,
  type ExerciseLogging,
} from '../../../../backend/src/shared/exerciseLogging';
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
  onField: (key: string, value: string) => void;
  onChange: (change: (row: JournalResult) => void) => void;
}) {
  const dimensions = useWindowDimensions(),
    stacked = dimensions.width < 360 || dimensions.fontScale > 1.1;
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
          {active.map((g) => {
            const i = r.groups.findIndex((x) => x.id === g.id);
            if (g.sets !== 1)
              return (
                <View key={g.id}>
                  <Text style={ui.label}>Legacy grouped entry · retained</Text>
                  <Text style={ui.copy}>
                    {g.sets ?? 'Unknown'} sets · {g.reps ?? 'Unknown'} reps
                    {r.mode === 'weighted_reps' ? ` · ${g.weight ?? 'Unknown'} ${g.unit}` : ''}.
                    Original values retained; add individual sets below for new work.
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
            const confirmed = g.confirmed === true;
            return (
              <View key={g.id} style={{ gap: 8 }}>
                <Text style={ui.label}>
                  Set {i + 1} ·{' '}
                  {confirmed
                    ? 'Recorded'
                    : g.weight !== null ||
                        g.reps !== null ||
                        Object.keys(fields).some((k) => k.startsWith(`${r.id}:${g.id}:`))
                      ? 'Draft'
                      : hint.reps || hint.load
                        ? 'Recommended'
                        : 'Not logged'}
                </Text>
                <View style={stacked ? { gap: 10 } : ui.row}>
                  {(r.mode === 'weighted_reps'
                    ? (['weight', 'reps'] as const)
                    : (['reps'] as const)
                  ).map((f) => {
                    const key = `${r.id}:${g.id}:${f}`,
                      rec = showRecommendations ? suggestion(hint, g, f) : '',
                      exact = /^\d+(\.\d+)?$/.test(rec);
                    const value = fields[key] ?? (g[f] === null ? rec : String(g[f]));
                    const label =
                      f === 'weight'
                        ? hint.load?.basis && hint.load.basis !== 'unspecified'
                          ? weightBasisLabel(hint.load.basis, g.unit)
                          : `Weight (${g.unit})`
                        : 'Reps';
                    return (
                      <View key={f} style={{ flex: 1, gap: 4 }}>
                        <JournalField
                          label={`${r.name} · set ${i + 1} · ${f === 'weight' ? `Weight (${g.unit})` : 'Reps'}`}
                          visibleLabel={label}
                          value={value}
                          onChange={(v) => onField(key, v)}
                          numeric
                          integer={f === 'reps'}
                          disabled={disabled}
                          suggested={
                            g[f] === null &&
                            !!rec &&
                            (fields[key] === undefined || (!exact && fields[key] === rec))
                          }
                        />
                        {rec && !exact && (
                          <Text style={ui.copy}>Enter the specific value you used.</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                {r.mode === 'weighted_reps' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Change weight unit for ${r.name} set ${i + 1}`}
                    disabled={disabled}
                    onPress={() =>
                      onChange((row) => {
                        const item = row.groups.find((x) => x.id === g.id)!;
                        item.unit = item.unit === 'lb' ? 'kg' : 'lb';
                        item.confirmed = !showRecommendations && !!g.confirmed;
                      })
                    }
                    accessibilityHint="Change unit without converting the entered number"
                    style={{
                      minHeight: 44,
                      minWidth: 64,
                      paddingHorizontal: 12,
                      alignSelf: 'flex-start',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 8,
                      backgroundColor: colors.canvas,
                    }}
                  >
                    <Text style={{ color: colors.action }}>{g.unit} ⇄</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
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
                  else
                    row.groups.push(emptySet(operationId, hint.load?.unit ?? active.at(-1)?.unit));
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
          {r.groups
            .filter((g) => g.removed)
            .map((g) => (
              <Action
                key={g.id}
                label={`Restore set ${r.groups.findIndex((x) => x.id === g.id) + 1}`}
                accessibilityLabel={`Undo removal of ${r.name} set ${r.groups.findIndex((x) => x.id === g.id) + 1}`}
                compact
                secondary
                disabled={disabled}
                onPress={() =>
                  onChange((row) => (row.groups.find((x) => x.id === g.id)!.removed = false))
                }
              />
            ))}
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
