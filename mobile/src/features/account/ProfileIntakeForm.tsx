import { Page, ui, Action, Notice } from '../../components/Design';
import type { RecoveryRequest } from '../onboarding/onboardingApi';
import { TrainingScreen } from '../training/TrainingScreen';
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { submitIntake, validateIntake, loadProfile, type IntakeFields } from './profileIntake';
import { OnboardingScreen } from '../onboarding/OnboardingScreen';
import { hasAcceptedTraining, TrainingError, trainingRequest } from '../training/trainingApi';

const emptyFields: IntakeFields = {
  firstName: '',
  lastName: '',
  heightFeet: '',
  heightInches: '',
  age: '',
  weight: '',
  gender: '',
};

type Props = {
  accessToken: () => Promise<string>;
  onSessionEnded?: () => void;
  userId?: string;
  onAccount?: () => void;
  trainingRefresh?: number;
};
export function ProfileIntakeForm(props: Props) {
  return <AccountProfileForm key={props.userId ?? 'signed-out'} {...props} />;
}
function AccountProfileForm({
  accessToken,
  onSessionEnded,
  userId,
  onAccount,
  trainingRefresh,
}: Props) {
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
  const [recovery, setRecovery] = useState<RecoveryRequest | undefined>();
  const [onboarding, setOnboarding] = useState(false);
  const [onboardingNotice, setOnboardingNotice] = useState('');
  const [training, setTraining] = useState(false);
  const [generateOnOpen, setGenerateOnOpen] = useState(false);
  const [trainingAccess, setTrainingAccess] = useState<'checking' | 'saved' | 'empty' | 'failed'>(
    'checking',
  );
  const [accessCheck, setAccessCheck] = useState(0);

  useEffect(() => {
    if (!userId || savedFirstName === null || onboarding || training) return;
    let active = true;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      controller?.abort();
      clearTimeout(timeout);
      const current = new AbortController();
      controller = current;
      setTrainingAccess('checking');
      timeout = setTimeout(() => {
        current.abort();
        if (active && controller === current) setTrainingAccess('failed');
      }, 75_000);
      try {
        const token = await tokenGetter.current();
        if (!active || current.signal.aborted) return;
        const saved = await trainingRequest('', 'GET', undefined, token, current.signal);
        if (active && controller === current && !current.signal.aborted) {
          setTrainingAccess(hasAcceptedTraining(saved) ? 'saved' : 'empty');
          if (saved.summary || saved.plans.length || hasAcceptedTraining(saved)) {
            setGenerateOnOpen(false);
            setTraining(true);
          }
        }
      } catch (error) {
        if (!active || controller !== current) return;
        setTrainingAccess('failed');
        if (error instanceof TrainingError && error.code === 'session_ended')
          sessionEnded.current?.();
      } finally {
        if (controller === current) clearTimeout(timeout);
      }
    }
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
      else {
        controller?.abort();
        controller = undefined;
        clearTimeout(timeout);
        setTrainingAccess('checking');
      }
    });
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [userId, savedFirstName, onboarding, training, accessCheck]);

  function returnToGreeting() {
    setTrainingAccess('checking');
    setTraining(false);
    setGenerateOnOpen(false);
  }

  async function restore() {
    if (loading.current || pending.current) return;
    const controller = new AbortController();
    loading.current = controller;
    setReading(true);
    setLoadError('');
    const timeout = setTimeout(() => controller.abort(), 75_000);
    try {
      const token = await tokenGetter.current();
      const result = await loadProfile(process.env.EXPO_PUBLIC_API_URL, controller.signal, token);
      if (!mounted.current || loading.current !== controller) return;
      if ('error' in result) {
        if (result.sessionEnded) {
          sessionEnded.current?.();
          return;
        }
        setLoadError(result.error);
      } else if (result.profile) {
        setSavedFirstName(result.profile.firstName);
      }
    } catch {
      if (mounted.current && loading.current === controller)
        setLoadError('Unable to restore your profile. Please sign in again.');
    } finally {
      clearTimeout(timeout);
      if (mounted.current && loading.current === controller) {
        loading.current = null;
        setReading(false);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    void restore();
    return () => {
      mounted.current = false;
      pending.current?.abort();
      loading.current?.abort();
      pending.current = null;
      loading.current = null;
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
      result = await submitIntake(
        process.env.EXPO_PUBLIC_API_URL,
        validation.payload,
        controller.signal,
        token,
      );
    } catch {
      result = { error: 'Your session ended. Please sign out and sign in again.' };
    }
    clearTimeout(timeout);
    if (pending.current !== controller) return;
    pending.current = null;
    setSubmitting(false);
    if ('error' in result && result.sessionEnded) {
      sessionEnded.current?.();
      return;
    }
    if ('success' in result) setSavedFirstName(validation.payload.firstName);
    else setFeedback(result.error);
  }

  function field(
    key: keyof IntakeFields,
    label: string,
    keyboardType: 'default' | 'number-pad' | 'decimal-pad' = 'default',
  ) {
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
    if (training && userId)
      return (
        <TrainingScreen
          refreshVersion={trainingRefresh}
          onAccount={onAccount}
          key={userId}
          userId={userId}
          accessToken={accessToken}
          onSessionEnded={onSessionEnded}
          generateOnOpen={generateOnOpen}
          onClarify={(request) => {
            setRecovery(request);
            setTraining(false);
            setGenerateOnOpen(false);
            setOnboarding(true);
          }}
          onClose={returnToGreeting}
        />
      );
    if (onboarding && userId)
      return (
        <OnboardingScreen
          onAccount={onAccount}
          recovery={recovery}
          userId={userId}
          accessToken={accessToken}
          onSessionEnded={onSessionEnded}
          onClose={(message, summarySaved) => {
            setTrainingAccess('checking');
            setOnboarding(false);
            setRecovery(undefined);
            setOnboardingNotice(message ?? '');
            if (summarySaved) {
              setGenerateOnOpen(true);
              setTraining(true);
            }
          }}
        />
      );
    return (
      <Page onAccount={onAccount}>
        <Text style={ui.eyebrow}>LET’S MAKE A START</Text>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={ui.title}>
          Hi {savedFirstName}
        </Text>
        <Text style={ui.copy}>
          Your training starts with you. Build a week around your goals, time and equipment.
        </Text>
        {!!onboardingNotice && (
          <Text accessibilityLiveRegion="polite" style={styles.copy}>
            {onboardingNotice}
          </Text>
        )}
        {userId && trainingAccess === 'checking' && (
          <Text style={ui.copy}>Loading your saved progress…</Text>
        )}
        {userId && trainingAccess === 'failed' && (
          <>
            <Notice error>
              Couldn’t load your saved progress. Retry to continue where you left off.
            </Notice>
            <Action
              label="Retry loading saved progress"
              onPress={() => setAccessCheck((value) => value + 1)}
            />
          </>
        )}
        {userId && trainingAccess === 'empty' && (
          <Action
            label="Start onboarding"
            onPress={() => {
              setRecovery(undefined);
              setOnboardingNotice('');
              setOnboarding(true);
            }}
          />
        )}
      </Page>
    );
  }
  if (reading)
    return (
      <Page onAccount={onAccount}>
        <Text accessibilityLiveRegion="polite" style={ui.copy}>
          Loading your profile…
        </Text>
      </Page>
    );
  if (loadError)
    return (
      <Page onAccount={onAccount}>
        <Text accessibilityRole="header" style={ui.title}>
          Couldn’t load your profile.
        </Text>
        <Text accessibilityRole="alert" style={styles.error}>
          {loadError}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry profile loading"
          onPress={() => void restore()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Retry profile loading</Text>
        </Pressable>
      </Page>
    );

  return (
    <Page onAccount={onAccount}>
      <Text style={ui.eyebrow}>YOUR STARTING POINT</Text>
      <Text accessibilityRole="header" style={ui.title}>
        Start with you.
      </Text>
      <Text style={styles.copy}>Save your details to your FitQuest account.</Text>
      <View style={styles.row}>
        {field('firstName', 'First name')}
        {field('lastName', 'Last name')}
      </View>
      <View style={styles.row}>
        {field('heightFeet', 'Height (feet)', 'number-pad')}
        {field('heightInches', 'Height (inches)', 'number-pad')}
      </View>
      <View style={styles.row}>
        {field('age', 'Age (years)', 'number-pad')}
        {field('weight', 'Weight (lb)', 'decimal-pad')}
      </View>
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
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.feedback, styles.error]}
        >
          {feedback}
        </Text>
      )}
      <Text style={styles.hint}>
        Planning is for adults 18+. Your profile is saved privately to your account.
      </Text>
    </Page>
  );
}

const styles = StyleSheet.create({
  welcome: { marginTop: 32, color: '#191B20', fontSize: 32, fontWeight: '600' },
  notice: { marginTop: 20, color: '#626670', fontSize: 16 },
  card: {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#DCDFE4',
    gap: 14,
  },
  title: { color: '#191B20', fontSize: 22, fontWeight: '600' },
  copy: { color: '#626670', fontSize: 16, lineHeight: 25 },
  field: { flexGrow: 1, minWidth: 120, gap: 7 },
  label: { color: '#191B20', fontSize: 16, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#9399A4',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#191B20',
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  hint: { color: '#626670', fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 52,
    borderRadius: 9,
    backgroundColor: '#244DE5',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  feedback: { color: '#244DE5', fontSize: 16, lineHeight: 24, fontWeight: '600' },
  error: { color: '#9B302C' },
});
