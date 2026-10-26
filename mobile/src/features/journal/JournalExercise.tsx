import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { Action, colors, ui } from '../../components/Design';
import { Icon } from '../../components/Icon';
import { JournalField } from './JournalField';
import { confirmSet, emptySet, suggestion } from './journalSets';
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
  disabled,
  onField,
  onChange,
}: {
  result: JournalResult;
  hint: ExerciseLogging;
  fields: Record<string, string>;
  disabled: boolean;
  onField: (key: string, value: string) => void;
  onChange: (change: (row: JournalResult) => void) => void;
}) {
  const dimensions = useWindowDimensions(),
    stacked = dimensions.width < 360 || dimensions.fontScale > 1.1;
  const active = r.groups.filter((g) => !g.removed);
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
                    label={`Remove legacy group for ${r.name}`}
                    secondary
                    disabled={disabled}
                    onPress={() =>
                      onChange((row) => (row.groups.find((x) => x.id === g.id)!.removed = true))
                    }
                  />
                </View>
              );
            const confirmed = g.confirmed === true;
            const valid = confirmSet(g, fields, r.id, hint, r.mode === 'weighted_reps');
            return (
              <View key={g.id} style={{ gap: 8 }}>
                <Text style={ui.label}>
                  Set {i + 1} ·{' '}
                  {confirmed
                    ? 'Recorded'
                    : g.weight !== null ||
                        g.reps !== null ||
                        Object.keys(fields).some((k) => k.startsWith(`${r.id}:${g.id}:`))
                      ? 'Draft · Not confirmed'
                      : hint.reps || hint.load
                        ? 'Suggested · Not recorded'
                        : 'Not logged'}
                </Text>
                <View style={stacked ? { gap: 10 } : ui.row}>
                  {(r.mode === 'weighted_reps'
                    ? (['weight', 'reps'] as const)
                    : (['reps'] as const)
                  ).map((f) => {
                    const key = `${r.id}:${g.id}:${f}`,
                      rec = suggestion(hint, g, f),
                      exact = /^\d+(\.\d+)?$/.test(rec);
                    const value =
                      fields[key] ?? (g[f] === null ? (exact ? rec : '') : String(g[f]));
                    const label =
                      f === 'weight'
                        ? weightBasisLabel(hint.load?.basis ?? 'unspecified', g.unit)
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
                          suggested={!confirmed}
                        />
                        {rec && !exact && (
                          <Text style={ui.copy}>
                            Suggested: {rec}
                            {f === 'weight' ? ` ${g.unit}` : ''} · enter a specific value
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Confirm set ${i + 1} for ${r.name}`}
                  accessibilityHint="Record these exact values as performed. Suggested ranges require a specific entered value."
                  accessibilityState={{
                    checked: confirmed,
                    disabled: disabled || (!confirmed && !valid),
                  }}
                  disabled={disabled || (!confirmed && !valid)}
                  onPress={() =>
                    onChange((row) => {
                      const index = row.groups.findIndex((x) => x.id === g.id);
                      row.groups[index] = confirmed ? { ...g, confirmed: false } : valid!;
                    })
                  }
                  style={[ui.row, { minHeight: 44, justifyContent: 'flex-start' }]}
                >
                  <Icon name={confirmed ? 'square-check' : 'square'} />
                  <Text style={ui.copy}>{confirmed ? 'Set recorded' : 'Confirm set'}</Text>
                </Pressable>
                {r.mode === 'weighted_reps' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Change weight unit for ${r.name} set ${i + 1}`}
                    disabled={disabled}
                    onPress={() =>
                      onChange((row) => {
                        const item = row.groups.find((x) => x.id === g.id)!;
                        item.unit = item.unit === 'lb' ? 'kg' : 'lb';
                        item.confirmed = false;
                      })
                    }
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.action }}>
                      Unit: {g.unit} · change (values are not converted)
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
          <Action
            label={`Add set for ${r.name}`}
            secondary
            disabled={disabled || r.groups.length >= 24}
            onPress={() =>
              onChange((row) => row.groups.push(emptySet(operationId, hint.load?.unit)))
            }
          />
          <Action
            label={`Subtract set for ${r.name}`}
            secondary
            disabled={disabled || !active.some((g) => g.sets === 1)}
            onPress={() =>
              onChange((row) => {
                const last = [...row.groups].reverse().find((g) => !g.removed && g.sets === 1);
                if (last) last.removed = true;
              })
            }
          />
          {r.groups
            .filter((g) => g.removed)
            .map((g) => (
              <Action
                key={g.id}
                label={`Undo removal of ${r.name} set ${r.groups.findIndex((x) => x.id === g.id) + 1}`}
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
          label={`Add notes for ${r.name}`}
          secondary
          disabled={disabled}
          onPress={() => setNotesOpen(true)}
        />
      )}
    </>
  );
}
