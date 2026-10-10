import { Icon } from '../../components/Icon';
import { useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, colors, ui } from '../../components/Design';
import { birthdayAge } from '../../../../backend/src/shared/profileBirthday.ts';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
type CalendarDate = { year: number; month: number; day: number };
function encoded(date: CalendarDate) {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
function validDays(year: number, month: number, today: Date) {
  return Array.from({ length: 31 }, (_, index) => index + 1).filter(
    (day) => birthdayAge(encoded({ year, month, day }), today) !== null,
  );
}
function validMonths(year: number, today: Date) {
  return months
    .map((_, index) => index + 1)
    .filter((month) => validDays(year, month, today).length);
}
function selection(value: string, today: Date): CalendarDate {
  if (birthdayAge(value, today) !== null) {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month, day };
  }
  return { year: today.getUTCFullYear() - 18, month: 1, day: 1 };
}
function display(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return `${months[month - 1]} ${day}, ${year}`;
}

export function BirthdayPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<CalendarDate | null>(null);
  const [today, setToday] = useState(() => new Date());
  function change(part: 'year' | 'month' | 'day', value: number) {
    if (!draft) return;
    const next = { ...draft, [part]: value };
    const availableMonths = validMonths(next.year, today);
    next.month = Math.max(availableMonths[0], Math.min(next.month, availableMonths.at(-1)!));
    const days = validDays(next.year, next.month, today);
    next.day = Math.max(days[0], Math.min(next.day, days.at(-1)!));
    setDraft(next);
  }
  const recorded = birthdayAge(value) !== null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={ui.section}>Birthday</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose birthday"
        accessibilityValue={{ text: recorded ? display(value) : 'Not selected' }}
        accessibilityState={{ disabled, expanded: draft !== null }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          const now = new Date();
          setToday(now);
          setDraft(selection(value, now));
        }}
        style={[ui.input, ui.row, { flexWrap: 'nowrap' }, disabled && ui.disabled]}
      >
        <Text style={[ui.copy, { flexShrink: 1 }]}>
          {recorded ? display(value) : 'Choose birthday'}
        </Text>
        <Icon name="chevron-down" />
      </Pressable>
      {draft && (
        <Modal transparent animationType="fade" onRequestClose={() => setDraft(null)}>
          <SafeAreaView style={styles.backdrop}>
            <View accessibilityViewIsModal style={styles.dialog}>
              <Text accessibilityRole="header" style={ui.section}>
                Choose birthday
              </Text>
              <Text accessibilityLiveRegion="polite" style={ui.copy}>
                {display(encoded(draft))}
              </Text>
              <View style={styles.columns}>
                <DateColumn
                  label="Month"
                  value={draft.month}
                  options={validMonths(draft.year, today)}
                  text={(month) => months[month - 1]}
                  onChange={(month) => change('month', month)}
                  wide
                />
                <DateColumn
                  label="Day"
                  value={draft.day}
                  options={validDays(draft.year, draft.month, today)}
                  text={String}
                  onChange={(day) => change('day', day)}
                />
                <DateColumn
                  label="Year"
                  value={draft.year}
                  options={Array.from(
                    { length: 132 },
                    (_, index) => today.getUTCFullYear() - index,
                  ).filter(
                    (year) =>
                      birthdayAge(`${year}-01-01`, today) !== null ||
                      birthdayAge(`${year}-12-31`, today) !== null,
                  )}
                  text={String}
                  onChange={(year) => change('year', year)}
                />
              </View>
              <View style={ui.row}>
                <Action label="Cancel" secondary onPress={() => setDraft(null)} />
                <Action
                  label="Done"
                  onPress={() => {
                    onChange(encoded(draft));
                    setDraft(null);
                  }}
                />
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
}

function DateColumn({
  label,
  value,
  options,
  text,
  onChange,
  wide = false,
}: {
  label: string;
  value: number;
  options: number[];
  text: (value: number) => string;
  onChange: (value: number) => void;
  wide?: boolean;
}) {
  const scroll = useRef<ScrollView>(null);
  return (
    <View style={{ flex: wide ? 1.6 : 1, minWidth: 0, gap: 8 }}>
      <Text style={ui.label}>{label}</Text>
      <ScrollView ref={scroll} style={styles.list} keyboardShouldPersistTaps="handled">
        {options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={`${label} ${text(option)}`}
            accessibilityState={{ checked: option === value }}
            onLayout={
              option === value
                ? (event) => {
                    scroll.current?.scrollTo({
                      y: Math.max(0, event.nativeEvent.layout.y - 52),
                      animated: false,
                    });
                  }
                : undefined
            }
            onPress={() => onChange(option)}
            style={[styles.option, option === value && styles.selected]}
          >
            <Text style={[ui.copy, option === value && styles.selectedText]}>{text(option)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#00000066' },
  dialog: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    gap: 16,
  },
  columns: { flexDirection: 'row', gap: 8 },
  list: { height: 220, backgroundColor: colors.canvas, borderRadius: 8 },
  option: { minHeight: 52, paddingHorizontal: 8, paddingVertical: 12, justifyContent: 'center' },
  selected: { backgroundColor: colors.actionWash, borderRadius: 8 },
  selectedText: { color: colors.action, fontWeight: '700' },
});
