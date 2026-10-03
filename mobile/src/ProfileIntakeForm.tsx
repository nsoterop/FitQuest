import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { submitIntake, validateIntake, loadProfile, type IntakeFields } from './profileIntake';
import { OnboardingScreen } from './OnboardingScreen';

const emptyFields: IntakeFields = {
  firstName: '', lastName: '', heightFeet: '', heightInches: '', age: '', weight: '', gender: '',
};

export function ProfileIntakeForm({ accessToken, onSessionEnded, userId }: {
  accessToken: () => Promise<string>; onSessionEnded?: () => void; userId?: string;
}) {
  const [fields, setFields] = useState(emptyFields);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const loading = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const tokenGetter = useRef(accessToken);
  tokenGetter.current = accessToken;
  const sessionEnded = useRef(onSessionEnded);
  sessionEnded.current = onSessionEnded;
  const [reading, setReading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savedFirstName, setSavedFirstName] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [onboardingNotice, setOnboardingNotice] = useState('');

  async function restore() {
    if (loading.current || pending.current) return;
    const controller = new AbortController();
    loading.current = controller;
    setReading(true); setLoadError('');
    const timeout = setTimeout(() => controller.abort(), 75_000);
    try {
      const token = await tokenGetter.current();
      const result = await loadProfile(process.env.EXPO_PUBLIC_API_URL, controller.signal, token);
      if (!mounted.current || loading.current !== controller) return;
      if ('error' in result) {
        if (result.sessionEnded) { sessionEnded.current?.(); return; }
        setLoadError(result.error);
      }
      else if (result.profile) {
        setSavedFirstName(result.profile.firstName);
      }
    } catch { if (mounted.current && loading.current === controller) setLoadError('Unable to restore your profile. Please sign in again.'); }
    finally {
      clearTimeout(timeout);
      if (mounted.current && loading.current === controller) { loading.current = null; setReading(false); }
    }
  }

  useEffect(() => {
    mounted.current = true;
    void restore();
    return () => {
      mounted.current = false;
      pending.current?.abort(); loading.current?.abort();
      pending.current = null; loading.current = null;
    };
  }, []);

  function update(key: keyof IntakeFields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setFeedback(null);
  }

  async function submit() {
    // Lock immediately, before React rerenders, so rapid taps send only one request.
    if (pending.current || reading) return;
    const validation = validateIntake(fields);
    if ('error' in validation) {
      setFeedback(validation.error);
      return;
    }
    Keyboard.dismiss();
    const controller = new AbortController();
    pending.current = controller;
    setSubmitting(true);
    setFeedback(null);
    const timeout = setTimeout(() => controller.abort(), 75_000);
    let result: { success: true } | { error: string; sessionEnded?: true };
    try {
      const token = await tokenGetter.current();
      result = await submitIntake(process.env.EXPO_PUBLIC_API_URL, validation.payload, controller.signal, token);
    } catch { result = { error: 'Your session ended. Please sign out and sign in again.' }; }
    clearTimeout(timeout);
    if (pending.current !== controller) return;
    pending.current = null;
    setSubmitting(false);
    if ('error' in result && result.sessionEnded) { sessionEnded.current?.(); return; }
    if ('success' in result) setSavedFirstName(validation.payload.firstName);
    else setFeedback(result.error);
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

  if (savedFirstName !== null) {
    if (onboarding && userId) return <OnboardingScreen userId={userId} accessToken={accessToken} onSessionEnded={onSessionEnded} onClose={message => {setOnboarding(false);setOnboardingNotice(message??'')}} />;
    return <View>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.welcome}>Hi {savedFirstName}</Text>
      {!!onboardingNotice && <Text accessibilityLiveRegion="polite" style={styles.copy}>{onboardingNotice}</Text>}
      {userId && <Pressable accessibilityRole="button" accessibilityLabel="Start onboarding" onPress={() => {setOnboardingNotice('');setOnboarding(true)}} style={[styles.button, { marginTop: 24 }]}><Text style={styles.buttonText}>Start onboarding</Text></Pressable>}
    </View>;
  }
  if (reading) return <Text accessibilityLiveRegion="polite" style={styles.notice}>Loading your profile…</Text>;
  if (loadError) return <View style={styles.card}>
    <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Retry profile loading" onPress={() => void restore()} style={styles.button}>
      <Text style={styles.buttonText}>Retry profile loading</Text>
    </Pressable>
  </View>;

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>Your profile</Text>
      <Text style={styles.copy}>Save your details to your FitQuest account.</Text>
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
        accessibilityState={{ disabled: submitting || reading, busy: submitting }}
        disabled={submitting || reading}
        onPress={() => void submit()}
        style={({ pressed }) => [styles.button, (pressed || submitting) && styles.disabled]}
      >
        <Text style={styles.buttonText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
      </Pressable>
      {feedback && (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert"
          style={[styles.feedback, styles.error]}>
          {feedback}
        </Text>
      )}
      <Text style={styles.hint}>Submit to save your profile privately to your account.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: { marginTop: 32, color: '#193B34', fontSize: 32, fontWeight: '600' },
  notice: { marginTop: 20, color: '#52655E', fontSize: 16 },
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
