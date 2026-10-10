import { JournalHistory } from '../journal/JournalScreen';
import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Pressable, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ProfileIntakeForm } from './ProfileIntakeForm';
import { Action, Page, Notice, ui, colors } from '../../components/Design';
import { AccountView } from './AccountView';
import { privateDrafts } from '../onboarding/onboardingDraftStorage';

export function AccountPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [journalOpen, setJournalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [trainingRefresh, setTrainingRefresh] = useState(0);
  const [confirmation, setConfirmation] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [pendingLabel, setPendingLabel] = useState('Restoring your session…');
  const passwordInput = useRef<TextInput>(null);
  const lock = useRef(false);
  const current = useRef<Session | null>(null);
  const hidden = useRef(false);
  const draftAccount = useRef<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setReady(true);
      return;
    }
    let active = true;
    let revision = 0;
    let validation = 0;
    const apply = async (next: Session | null) => {
      const request = ++validation;
      if (!active) return;
      if (draftAccount.current && draftAccount.current !== next?.user.id) {
        current.current = null;
        setSession(null);
        setReady(false);
        try {
          await privateDrafts.clear(draftAccount.current);
          draftAccount.current = null;
        } catch {
          hidden.current = true;
          setReady(true);
          setMessage(
            'Unable to clear your device draft. Retry sign out before switching accounts.',
          );
          return;
        }
        if (!active || request !== validation) return;
      }
      if (!next || hidden.current) {
        current.current = null;
        setSession(null);
        setReady(true);
        setPassword('');
        return;
      }
      // A stored session is only a candidate until Auth verifies this exact token.
      if (current.current?.user.id !== next.user.id) {
        current.current = null;
        setSession(null);
        setReady(false);
      }
      try {
        const { data, error } = await client.auth.getUser(next.access_token);
        if (!active || request !== validation || hidden.current) return;
        if (
          error ||
          !data.user ||
          data.user.id !== next.user.id ||
          !data.user.email_confirmed_at ||
          data.user.is_anonymous
        ) {
          current.current = null;
          setSession(null);
          setMessage('Your session could not be verified. Please sign in again.');
        } else {
          current.current = next;
          draftAccount.current = next.user.id;
          setSession(next);
          setMessage('');
        }
      } catch {
        if (active && request === validation) {
          current.current = null;
          setSession(null);
          setMessage('Unable to verify your session. Please try signing in again.');
        }
      } finally {
        if (active && request === validation) {
          setReady(true);
          setPassword('');
        }
      }
    };
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      revision++;
      if (event === 'SIGNED_OUT') hidden.current = false;
      // Return synchronously; Supabase auth notifications must not await auth calls.
      void apply(next);
    });
    const initial = revision;
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && revision === initial) {
          void apply(error ? null : data.session);
          if (error) setMessage('Unable to restore your session. Please sign in again.');
        }
      })
      .catch(() => {
        if (active) {
          setReady(true);
          setMessage('Unable to read secure session storage.');
        }
      });
    const refresh = (state: string) =>
      state === 'active' ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh();
    refresh(AppState.currentState);
    const appState = AppState.addEventListener('change', refresh);
    // Confirmation links are accepted only from our app route. Profile ownership still comes from Fastify verification.
    const confirmation = async (url: string) => {
      if (!active || lock.current || hidden.current || !url.startsWith('fitquest-dev://auth#'))
        return;
      const params = new URLSearchParams(url.split('#')[1]);
      if (params.has('error')) {
        setMessage(
          'This confirmation link is invalid or expired. Try signing in or request a new email.',
        );
        return;
      }
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) return;
      setPendingLabel('Confirming your account…');
      try {
        const { error } = await client.auth.setSession({ access_token, refresh_token });
        if (active && error) setMessage('Unable to confirm your account. Try signing in.');
      } catch {
        if (active) setMessage('Unable to confirm your account. Try signing in.');
      }
    };
    const links = Linking.addEventListener('url', (event) => void confirmation(event.url));
    void Linking.getInitialURL()
      .then((url) => {
        if (active && url) void confirmation(url);
      })
      .catch(() => {});
    return () => {
      active = false;
      validation++;
      subscription.unsubscribe();
      appState.remove();
      links.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);

  async function authenticate(signUp: boolean) {
    const client = supabase;
    if (!client || lock.current) return;
    if (!email.trim() || !password) {
      setMessage('Enter your email and password.');
      return;
    }
    Keyboard.dismiss();
    setPendingLabel('Signing you in…');
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      const credentials = { email: email.trim(), password };
      const { data, error } = signUp
        ? await client.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: 'fitquest-dev://auth' },
          })
        : await client.auth.signInWithPassword(credentials);
      if (error) {
        setMessage(
          error.code === 'email_not_confirmed'
            ? 'Confirm your email using the link in your inbox, then sign in.'
            : signUp
              ? 'Unable to create your account or send the confirmation email. Please try again.'
              : 'Unable to sign in. Check your email and password.',
        );
      } else {
        hidden.current = false;
        // The auth subscription verifies any new session before displaying the form.
        setPassword('');
        if (signUp && !data.session) setConfirmation(true);
      }
    } catch {
      setMessage('Unable to reach authentication. Please try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function signOut(endedMessage = '') {
    if (!supabase || lock.current) return;
    lock.current = true;
    hidden.current = true;
    setAccountOpen(false);
    setJournalOpen(false);
    setConfirmation(false);
    current.current = null;
    setSession(null);
    setEmail('');
    setPassword('');
    setMessage('');
    setBusy(true);
    setMode('signIn');
    // Hide/unmount profile immediately, including when remote sign-out fails.
    try {
      if (draftAccount.current) {
        await privateDrafts.clear(draftAccount.current);
        draftAccount.current = null;
      }
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error)
        setMessage(
          'Sign-out could not finish. Your profile is hidden; retry sign out before switching accounts.',
        );
      else {
        hidden.current = false;
        setMessage(endedMessage);
      }
    } catch {
      setMessage(
        'Sign-out could not finish. Your profile is hidden; retry sign out before switching accounts.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function accessToken(userId: string) {
    if (!supabase || hidden.current || current.current?.user.id !== userId)
      throw new Error('Signed out.');
    const { data, error } = await supabase.auth.getSession();
    if (
      error ||
      hidden.current ||
      current.current?.user.id !== userId ||
      data.session?.user.id !== userId
    )
      throw new Error('Session changed.');
    return data.session.access_token;
  }

  if (!supabase)
    return (
      <Page>
        <Notice>Account setup is not configured yet.</Notice>
      </Page>
    );
  if (!ready)
    return (
      <Page>
        <Text accessibilityLiveRegion="polite" style={ui.copy}>
          {pendingLabel}
        </Text>
      </Page>
    );
  if (hidden.current)
    return (
      <Page>
        <Text accessibilityRole="header" style={ui.title}>
          Finish signing out.
        </Text>
        <Notice error>{message || 'Clearing your device draft…'}</Notice>
        <Action label="Retry sign out" busy={busy} onPress={() => void signOut()} />
      </Page>
    );
  if (session && journalOpen)
    return (
      <JournalHistory
        userId={session.user.id}
        accessToken={() => accessToken(session.user.id)}
        onBack={() => setJournalOpen(false)}
        onSessionEnded={() => void signOut('Your session ended. Please sign in again.')}
      />
    );
  if (session)
    return (
      <View style={ui.screen}>
        <View
          style={accountOpen ? { display: 'none' } : ui.screen}
          accessibilityElementsHidden={accountOpen}
          importantForAccessibility={accountOpen ? 'no-hide-descendants' : 'auto'}
        >
          <ProfileIntakeForm
            trainingRefresh={trainingRefresh}
            key={session.user.id}
            userId={session.user.id}
            accessToken={() => accessToken(session.user.id)}
            onAccount={() => setAccountOpen(true)}
            onSessionEnded={() => void signOut('Your session ended. Please sign in again.')}
          />
        </View>
        {accountOpen && (
          <AccountView
            userId={session.user.id}
            onJournal={() => setJournalOpen(true)}
            key={session.user.id}
            email={session.user.email ?? ''}
            accessToken={() => accessToken(session.user.id)}
            onBack={() => {
              setAccountOpen(false);
              setTrainingRefresh((n) => n + 1);
            }}
            onSignOut={() => void signOut()}
            onSessionEnded={() => void signOut('Your session ended. Please sign in again.')}
          />
        )}
      </View>
    );
  if (confirmation)
    return (
      <Page>
        <Text style={ui.eyebrow}>ONE MORE STEP</Text>
        <Text accessibilityRole="header" style={ui.title}>
          Check your inbox.
        </Text>
        <Text style={ui.copy}>
          Open the confirmation link sent to {email.trim()}, then sign in.
        </Text>
        <Notice>Keep this app installed so the link can bring you back to FitQuest.</Notice>
        <Action
          label="Back to sign in"
          onPress={() => {
            setConfirmation(false);
            setMode('signIn');
            setMessage('');
          }}
        />
        <Action
          label="Use a different email"
          onPress={() => {
            setConfirmation(false);
            setEmail('');
            setMessage('');
          }}
          secondary
        />
        {!!message && <Notice error>{message}</Notice>}
      </Page>
    );
  return (
    <Page context={mode === 'signUp' ? 'Create account' : 'Welcome back'}>
      <Text style={ui.eyebrow}>TRAINING, BUILT AROUND YOU</Text>
      <Text accessibilityRole="header" style={ui.title}>
        {mode === 'signUp' ? 'Make room for your goals.' : 'Welcome back.'}
      </Text>
      <Text style={ui.copy}>
        {mode === 'signUp'
          ? 'Create your account to start a plan that fits your life.'
          : 'Sign in to pick up where you left off.'}
      </Text>
      <View style={{ gap: 7 }}>
        <Text style={ui.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordInput.current?.focus()}
          style={ui.input}
        />
      </View>
      <View style={{ gap: 7 }}>
        <View style={ui.row}>
          <Text style={ui.label}>Password</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            onPress={() => setShowPassword(!showPassword)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.action }}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>
        <TextInput
          ref={passwordInput}
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          returnKeyType="go"
          onSubmitEditing={() => void authenticate(mode === 'signUp')}
          style={ui.input}
        />
      </View>
      {!!message && <Notice error>{message}</Notice>}
      <Action
        label={mode === 'signUp' ? 'Create account' : 'Sign in'}
        busy={busy}
        onPress={() => void authenticate(mode === 'signUp')}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'signUp' ? 'Switch to sign in' : 'Switch to create account'}
        disabled={busy}
        onPress={() => {
          setMode(mode === 'signUp' ? 'signIn' : 'signUp');
          setPassword('');
          setMessage('');
        }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={[ui.copy, { color: colors.action, textAlign: 'center' }]}>
          {mode === 'signUp'
            ? 'Already have an account? Sign in'
            : 'New to FitQuest? Create an account'}
        </Text>
      </Pressable>
      <View
        style={{
          padding: 22,
          borderRadius: 13,
          backgroundColor: colors.hero,
          gap: 12,
          marginTop: 12,
        }}
      >
        <Text style={[ui.eyebrow, { color: colors.highlight }]}>YOUR WEEK. YOUR WAY.</Text>
        <Text style={[ui.section, { color: 'white' }]}>A clear plan. Room for real life.</Text>
        <Text style={[ui.copy, { color: '#CDD0D7' }]}>
          Start with your goals. Build a week around the time and equipment you have.
        </Text>
      </View>
    </Page>
  );
}
