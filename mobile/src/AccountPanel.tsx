import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ProfileIntakeForm } from './ProfileIntakeForm';

export function AccountPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [pendingLabel, setPendingLabel] = useState('Restoring your session…');
  const passwordInput = useRef<TextInput>(null);
  const lock = useRef(false);
  const current = useRef<Session | null>(null);
  const hidden = useRef(false);

  useEffect(() => {
    const client = supabase;
    if (!client) { setReady(true); return; }
    let active = true;
    let revision = 0;
    let validation = 0;
    const apply = async (next: Session | null) => {
      const request = ++validation;
      if (!active) return;
      if (!next || hidden.current) {
        current.current = null; setSession(null); setReady(true); setPassword('');
        return;
      }
      // A stored session is only a candidate until Auth verifies this exact token.
      if (current.current?.user.id !== next.user.id) {
        current.current = null; setSession(null); setReady(false);
      }
      try {
        const { data, error } = await client.auth.getUser(next.access_token);
        if (!active || request !== validation || hidden.current) return;
        if (error || !data.user || data.user.id !== next.user.id ||
          !data.user.email_confirmed_at || data.user.is_anonymous) {
          current.current = null; setSession(null);
          setMessage('Your session could not be verified. Please sign in again.');
        } else {
          current.current = next; setSession(next); setMessage('');
        }
      } catch {
        if (active && request === validation) {
          current.current = null; setSession(null);
          setMessage('Unable to verify your session. Please try signing in again.');
        }
      } finally {
        if (active && request === validation) { setReady(true); setPassword(''); }
      }
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      revision++;
      if (event === 'SIGNED_OUT') hidden.current = false;
      // Return synchronously; Supabase auth notifications must not await auth calls.
      void apply(next);
    });
    const initial = revision;
    void client.auth.getSession().then(({ data, error }) => {
      if (active && revision === initial) {
        void apply(error ? null : data.session);
        if (error) setMessage('Unable to restore your session. Please sign in again.');
      }
    }).catch(() => { if (active) { setReady(true); setMessage('Unable to read secure session storage.'); } });
    const refresh = (state: string) => state === 'active' ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh();
    refresh(AppState.currentState);
    const appState = AppState.addEventListener('change', refresh);
    // Confirmation links are accepted only from our app route. Profile ownership still comes from Fastify verification.
    const confirmation = async (url: string) => {
      if (!active || lock.current || hidden.current || !url.startsWith('fitquest-dev://auth#')) return;
      const params = new URLSearchParams(url.split('#')[1]);
      if (params.has('error')) {
        setMessage('This confirmation link is invalid or expired. Try signing in or request a new email.');
        return;
      }
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) return;
      setPendingLabel('Confirming your account…');
      try {
        const { error } = await client.auth.setSession({ access_token, refresh_token });
        if (active && error) setMessage('Unable to confirm your account. Try signing in.');
      } catch { if (active) setMessage('Unable to confirm your account. Try signing in.'); }
    };
    const links = Linking.addEventListener('url', event => void confirmation(event.url));
    void Linking.getInitialURL().then(url => { if (active && url) void confirmation(url); }).catch(() => {});
    return () => { active = false; validation++; subscription.unsubscribe(); appState.remove(); links.remove(); client.auth.stopAutoRefresh(); };
  }, []);

  async function authenticate(signUp: boolean) {
    const client = supabase;
    if (!client || lock.current) return;
    if (!email.trim() || !password) { setMessage('Enter your email and password.'); return; }
    Keyboard.dismiss();
    setPendingLabel('Signing you in…');
    lock.current = true; setBusy(true); setMessage('');
    try {
      const credentials = { email: email.trim(), password };
      const { data, error } = signUp
        ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: 'fitquest-dev://auth' } })
        : await client.auth.signInWithPassword(credentials);
      if (error) {
        setMessage(error.code === 'email_not_confirmed' ? 'Confirm your email using the link in your inbox, then sign in.'
          : signUp ? 'Unable to create your account or send the confirmation email. Please try again.'
          : 'Unable to sign in. Check your email and password.');
      } else {
        hidden.current = false;
        // The auth subscription verifies any new session before displaying the form.
        setPassword('');
        if (signUp && !data.session) setMessage('Check your email and open the confirmation link, then sign in.');
      }
    } catch { setMessage('Unable to reach authentication. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function signOut(endedMessage = '') {
    if (!supabase || lock.current) return;
    lock.current = true; hidden.current = true;
    current.current = null; setSession(null); setEmail(''); setPassword(''); setMessage(''); setBusy(true); setMode('signIn');
    // Hide/unmount profile immediately, including when remote sign-out fails.
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) setMessage('Sign-out could not finish. Your profile is hidden; retry sign out before switching accounts.');
      else { hidden.current = false; setMessage(endedMessage); }
    } catch { setMessage('Sign-out could not finish. Your profile is hidden; retry sign out before switching accounts.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function accessToken(userId: string) {
    if (!supabase || hidden.current || current.current?.user.id !== userId) throw new Error('Signed out.');
    const { data, error } = await supabase.auth.getSession();
    if (error || hidden.current || current.current?.user.id !== userId || data.session?.user.id !== userId) throw new Error('Session changed.');
    return data.session.access_token;
  }

  if (!supabase) return <Text style={styles.notice}>Account setup is not configured yet.</Text>;
  if (!ready) return <Text accessibilityLiveRegion="polite" style={styles.notice}>{pendingLabel}</Text>;
  if (session) return <View>
    <View style={styles.account}>
      <Text style={styles.email} numberOfLines={1}>{session.user.email}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void signOut()} style={styles.switch}><Text style={styles.switchText}>Sign out</Text></Pressable>
    </View>
    <ProfileIntakeForm key={session.user.id} accessToken={() => accessToken(session.user.id)} onSessionEnded={() => void signOut('Your session ended. Please sign in again.')} />
  </View>;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>{mode === 'signUp' ? 'Create your account' : 'Sign in'}</Text>
    <Text style={styles.copy}>{mode === 'signUp' ? 'Create an account to save your profile. Confirm your email before signing in.' : 'Sign in to save and restore your profile.'}</Text>
    <Text style={styles.label}>Email</Text>
    <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!busy && !hidden.current} textContentType="emailAddress" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()} style={styles.input} />
    <Text style={styles.label}>Password</Text>
    <TextInput ref={passwordInput} accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy && !hidden.current} textContentType={mode === 'signUp' ? 'newPassword' : 'password'} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} returnKeyType="go" onSubmitEditing={() => void authenticate(mode === 'signUp')} style={styles.input} />
    <Pressable accessibilityRole="button" accessibilityLabel={mode === 'signUp' ? 'Create account' : 'Sign in'} accessibilityState={{ disabled: busy || hidden.current, busy }} disabled={busy || hidden.current} onPress={() => void authenticate(mode === 'signUp')} style={[styles.button, (busy || hidden.current) && styles.disabled]}><Text style={styles.buttonText}>{busy ? (mode === 'signUp' ? 'Creating account…' : 'Signing in…') : mode === 'signUp' ? 'Create account' : 'Sign in'}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={mode === 'signUp' ? 'Switch to sign in' : 'Switch to create account'} disabled={busy || hidden.current} onPress={() => { setMode(mode === 'signUp' ? 'signIn' : 'signUp'); setPassword(''); setMessage(''); }} style={styles.switch}><Text style={styles.switchText}>{mode === 'signUp' ? 'Already have an account? Sign in' : 'New to FitQuest? Create an account'}</Text></Pressable>
    {hidden.current && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void signOut()} style={styles.button}><Text style={styles.buttonText}>Retry sign out</Text></Pressable>}
    {message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { marginTop: 20, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#DDE5DD', gap: 14 },
  title: { color: '#193B34', fontSize: 28, fontWeight: '600' },
  account: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  email: { flex: 1, color: '#52655E', fontSize: 14 },
  switch: { minHeight: 44, paddingVertical: 12, justifyContent: 'center' },
  switchText: { color: '#176B5B', fontSize: 16, fontWeight: '600' },
  copy: { color: '#52655E', fontSize: 16, lineHeight: 25 },
  label: { color: '#193B34', fontSize: 16, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#91A69B', borderRadius: 12, padding: 12, color: '#193B34', fontSize: 17, backgroundColor: '#F6F7F2' },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#176B5B', padding: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.5 }, notice: { marginTop: 20, color: '#52655E', fontSize: 16 },
});
