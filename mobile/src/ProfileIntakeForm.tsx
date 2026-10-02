import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { submitIntake, validateIntake, type IntakeFields } from './profileIntake';

const emptyFields: IntakeFields = {
  firstName: '', lastName: '', heightFeet: '', heightInches: '', age: '', weight: '', gender: '',
};

export function ProfileIntakeForm() {
  const [fields, setFields] = useState(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; success: boolean } | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  function update(key: keyof IntakeFields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setFeedback(null);
  }

  async function submit() {
    // Lock immediately, before React rerenders, so rapid taps send only one request.
    if (pending.current) return;
    const validation = validateIntake(fields);
    if ('error' in validation) {
      setFeedback({ text: validation.error, success: false });
      return;
    }
    Keyboard.dismiss();
    const controller = new AbortController();
    pending.current = controller;
    setSubmitting(true);
    setFeedback(null);
    const timeout = setTimeout(() => controller.abort(), 75_000);
    const result = await submitIntake(process.env.EXPO_PUBLIC_API_URL, validation.payload, controller.signal);
    clearTimeout(timeout);
    if (pending.current !== controller) return;
    pending.current = null;
    setSubmitting(false);
    setFeedback('success' in result
      ? { text: 'User Data Saved', success: true }
      : { text: result.error, success: false });
  }

  function field(key: keyof IntakeFields, label: string, keyboardType: 'default' | 'number-pad' | 'decimal-pad' = 'default') {
    return (
      <View style={styles.field} key={key}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          value={fields[key]}
          onChangeText={(value) => update(key, value)}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'default' ? 'words' : 'none'}
          autoCorrect={false}
          editable={!submitting}
          maxLength={keyboardType === 'default' ? 100 : 10}
          style={[styles.input, submitting && styles.disabled]}
        />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>Your profile</Text>
      <Text style={styles.copy}>Enter your details to send them to FitQuest.</Text>
      {field('firstName', 'First name')}
      {field('lastName', 'Last name')}
      <View style={styles.row}>
        {field('heightFeet', 'Height (feet)', 'number-pad')}
        {field('heightInches', 'Height (inches)', 'number-pad')}
      </View>
      {field('age', 'Age (years)', 'number-pad')}
      {field('weight', 'Weight (lb)', 'decimal-pad')}
      {field('gender', 'Gender')}
      <Text style={styles.hint}>Describe your gender, or enter “Prefer not to say”.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Submit profile"
        accessibilityState={{ disabled: submitting, busy: submitting }}
        disabled={submitting}
        onPress={() => void submit()}
        style={({ pressed }) => [styles.button, (pressed || submitting) && styles.disabled]}
      >
        <Text style={styles.buttonText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
      </Pressable>
      {feedback && (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert"
          style={[styles.feedback, !feedback.success && styles.error]}>
          {feedback.text}
        </Text>
      )}
      <Text style={styles.hint}>For now, submission confirms receipt only. Your profile is not stored.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 20, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: '#DDE5DD', gap: 14 },
  title: { color: '#193B34', fontSize: 22, fontWeight: '600' },
  copy: { color: '#52655E', fontSize: 16, lineHeight: 25 },
  field: { flex: 1, gap: 7 },
  label: { color: '#193B34', fontSize: 16, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#91A69B', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, color: '#193B34', fontSize: 17,
    backgroundColor: '#F6F7F2' },
  row: { flexDirection: 'row', gap: 12 },
  hint: { color: '#52655E', fontSize: 14, lineHeight: 21 },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#176B5B',
    padding: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  feedback: { color: '#176B5B', fontSize: 16, lineHeight: 24, fontWeight: '600' },
  error: { color: '#9B302C' },
});
