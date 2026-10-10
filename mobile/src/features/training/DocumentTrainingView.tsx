import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrainingPlan } from './trainingApi';
import { Action, Notice, colors, ui } from '../../components/Design';
import { rangeText } from './CompleteWeekView';
import { WorkoutContent } from './WorkoutContent';
export const dateLabel = (date: string, long = false) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: long ? 'long' : 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
export function localToday(timeZone?: string) {
  const d = new Date();
  if (timeZone) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(d)
        .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export type WorkoutSelection = { date: string; index: number };
export function DocumentToday({
  plan,
  onWeek,
  onOpen,
  selection,
  onSelect,
}: {
  plan: TrainingPlan;
  selection: WorkoutSelection;
  onSelect: (value: WorkoutSelection) => void;
  onWeek: () => void;
  onOpen: (selection: WorkoutSelection) => void;
}) {
  const today = localToday(plan.timeZone),
    selectedDate = selection.date,
    featured = selection.index;
  const overview = plan.documentOverview,
    day = overview?.days.find((d) => d.date === selectedDate),
    session = day?.sessions[featured];
  return (
    <>
      <Text style={ui.eyebrow}>{dateLabel(selectedDate, true)}</Text>
      <Text accessibilityRole="header" style={ui.title}>
        {selectedDate === today ? 'Today.' : dateLabel(selectedDate) + '.'}
      </Text>
      <View style={styles.dates}>
        {overview?.days.map((d) => (
          <Pressable
            key={d.date}
            accessibilityRole="button"
            accessibilityLabel={`Select ${d.date}`}
            accessibilityState={{ selected: selectedDate === d.date }}
            onPress={() => {
              onSelect({ date: d.date, index: 0 });
            }}
            style={[styles.date, selectedDate === d.date && styles.dateSelected]}
          >
            <Text style={[styles.dateText, selectedDate === d.date && styles.light]}>
              {dateLabel(d.date).slice(0, 3)}
            </Text>
            <Text style={[ui.section, selectedDate === d.date && styles.light]}>
              {Number(d.date.slice(-2))}
            </Text>
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: selectedDate === d.date ? colors.highlight : 'transparent',
              }}
            />
          </Pressable>
        ))}
      </View>
      {!day ? (
        <>
          <Text accessibilityRole="header" style={ui.section}>
            Outside your saved week.
          </Text>
          <Text style={ui.copy}>
            Your saved plan runs from {plan.dates[0]} to {plan.dates.at(-1)}. There is no saved
            session for this date.
          </Text>
          <Action label="View saved week" onPress={onWeek} />
        </>
      ) : plan.reviewState !== 'accepted' ? (
        <>
          <Notice title="Your week is ready to review.">
            Choose the plan to reveal its saved workouts.
          </Notice>
          <Action label="Review your week" onPress={onWeek} />
        </>
      ) : !day.sessions.length ? (
        <>
          <Text accessibilityRole="header" style={ui.section}>
            A rest day.
          </Text>
          <Text style={ui.copy}>No sessions are prescribed for this saved date.</Text>
          <Action label="View saved week" onPress={onWeek} secondary />
        </>
      ) : (
        <>
          {session && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View workout: ${session.title}`}
              onPress={() => onOpen({ date: selectedDate, index: featured })}
              style={styles.hero}
            >
              <Text style={[ui.eyebrow, { color: colors.highlight }]}>
                {session.timing ?? 'SAVED SESSION'}
                {session.optional ? ' · OPTIONAL' : ''}
              </Text>
              <Text style={styles.heroTitle}>{session.title}</Text>
              <Text style={[ui.copy, { color: '#D2D5DB' }]}>{session.goal}</Text>
              <View style={[ui.row, { marginTop: 14 }]}>
                <Text style={[ui.label, styles.light]}>
                  {rangeText(session.durationMinutes)} min
                </Text>
                <Text style={[ui.label, { color: colors.highlight }]}>View workout →</Text>
              </View>
            </Pressable>
          )}
          <Text style={ui.eyebrow}>SESSIONS · {day.sessions.length}</Text>
          {day.sessions.map((s, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Open session ${i + 1}: ${s.title}`}
              accessibilityState={{ selected: featured === i }}
              onPress={() => {
                onSelect({ date: selectedDate, index: i });
                onOpen({ date: selectedDate, index: i });
              }}
              style={styles.row}
            >
              <Text style={styles.number}>{String(i + 1).padStart(2, '0')}</Text>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={ui.label}>{s.title}</Text>
                <Text style={ui.copy}>
                  {[s.timing, `${rangeText(s.durationMinutes)} min`, s.optional ? 'Optional' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Text style={{ color: colors.action }}>{featured === i ? '●' : '›'}</Text>
            </Pressable>
          ))}
          <Text style={ui.copy}>Saved prescriptions. Completion is not tracked here.</Text>
        </>
      )}
    </>
  );
}
export function DocumentWeek({
  plan,
  onOpen,
}: {
  plan: TrainingPlan;
  onOpen: (selection: WorkoutSelection) => void;
}) {
  return (
    <View style={{ gap: 22 }}>
      {plan.documentOverview?.days.map((d) => (
        <View key={d.date} accessibilityLabel={`Training day ${d.date}`} style={{ gap: 12 }}>
          <View style={ui.row}>
            <Text accessibilityRole="header" style={ui.section}>
              {dateLabel(d.date, true)}
            </Text>
            {d.date === localToday(plan.timeZone) && (
              <Text style={[ui.eyebrow, { color: colors.action }]}>TODAY</Text>
            )}
          </View>
          {!d.sessions.length && (
            <Text style={[ui.copy, { paddingVertical: 12 }]}>Rest — no planned session.</Text>
          )}
          {d.sessions.map((s, i) => (
            <Pressable
              key={i}
              accessibilityLabel={`Session ${i + 1} on ${d.date}`}
              accessibilityHint={`${s.title}. ${s.goal}. ${s.timing ?? ''} About ${rangeText(s.durationMinutes)} minutes.${s.optional ? ' Optional session.' : ''}`}
              accessibilityRole={plan.reviewState === 'accepted' ? 'button' : undefined}
              disabled={plan.reviewState !== 'accepted'}
              onPress={() => onOpen({ date: d.date, index: i })}
              style={[
                styles.row,
                {
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 12,
                  backgroundColor: colors.canvas,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 7 }}>
                <Text style={ui.section}>{s.title}</Text>
                <Text style={ui.copy}>{s.goal}</Text>
                <View style={ui.row}>
                  <Text style={ui.label}>
                    {[s.timing, `About ${rangeText(s.durationMinutes)} min`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {s.optional && <Text style={ui.badge}>Optional session</Text>}
                </View>
              </View>
              {plan.reviewState === 'accepted' && (
                <Text style={{ fontSize: 24, color: colors.action }}>›</Text>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
export function DocumentWorkout({
  plan,
  selection,
}: {
  plan: TrainingPlan;
  selection: WorkoutSelection;
}) {
  if (plan.reviewState !== 'accepted') return null;
  const s = plan.documentPlan?.days.find((d) => d.date === selection.date)?.sessions[
    selection.index
  ];
  if (!s) return <Notice>This saved session is no longer available. Return to your week.</Notice>;
  return (
    <>
      <Text style={ui.eyebrow}>
        {dateLabel(selection.date, true)}
        {s.timing ? ` · ${s.timing}` : ''}
      </Text>
      <Text accessibilityRole="header" style={ui.title}>
        {s.title}
      </Text>
      <View style={ui.row}>
        <Text style={ui.badge}>{rangeText(s.durationMinutes)} min</Text>
        {s.optional && <Text style={ui.badge}>Optional session</Text>}
      </View>
      <View style={ui.divider} />
      <WorkoutContent session={s} />
    </>
  );
}
const styles = StyleSheet.create({
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  date: {
    minWidth: 38,
    flexGrow: 1,
    paddingVertical: 10,
    gap: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  dateSelected: { backgroundColor: colors.hero },
  dateText: { fontSize: 11, color: colors.muted },
  light: { color: '#FFF' },
  hero: { padding: 22, borderRadius: 13, backgroundColor: colors.hero, gap: 14 },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.7,
    color: '#FFF',
  },
  row: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  number: {
    fontSize: 14,
    color: colors.muted,
    backgroundColor: colors.canvas,
    padding: 10,
    borderRadius: 7,
  },
});
