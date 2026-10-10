import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Action, Notice, Page, ui } from '../../components/Design';
import { loadProfile, type SavedProfile } from './profileIntake';
import { PlanningSettings } from './PlanningSettings';
import { ProfileIntakeForm } from './ProfileIntakeForm';
export function AccountView({
  email,
  userId,
  accessToken,
  onBack,
  onSignOut,
  onSessionEnded,
  onJournal,
}: {
  email: string;
  userId: string;
  accessToken: () => Promise<string>;
  onBack: () => void;
  onSignOut: () => void;
  onSessionEnded: () => void;
  onJournal?: () => void;
}) {
  const [view, setView] = useState<'account' | 'profile' | 'signout' | 'sharing'>('account'),
    [profile, setProfile] = useState<SavedProfile | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  const token = useRef(accessToken);
  const [editing, setEditing] = useState(false);
  token.current = accessToken;
  const ended = useRef(onSessionEnded);
  ended.current = onSessionEnded;
  useEffect(() => {
    if (view !== 'profile') return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(() => c.abort(), 75000);
    let active = true;
    void (async () => {
      try {
        const result = await loadProfile(
          process.env.EXPO_PUBLIC_API_URL,
          c.signal,
          await token.current(),
        );
        if (!active) return;
        if ('error' in result) {
          if (result.sessionEnded) ended.current();
          else setError(result.error);
        } else setProfile(result.profile);
      } catch {
        if (active) setError('Unable to load your profile. Please retry.');
      } finally {
        clearTimeout(timer);
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      c.abort();
      clearTimeout(timer);
    };
  }, [view, retry]);
  if (editing && profile)
    return (
      <ProfileIntakeForm
        userId={userId}
        accessToken={accessToken}
        onSessionEnded={onSessionEnded}
        editingProfile={profile}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          setRetry((n) => n + 1);
        }}
      />
    );
  if (view === 'sharing')
    return (
      <PlanningSettings
        userId={userId}
        accessToken={accessToken}
        onBack={() => setView('account')}
        onSessionEnded={onSessionEnded}
      />
    );
  return (
    <Page
      onBack={view === 'account' ? onBack : () => setView('account')}
      backLabel={view === 'account' ? 'Back' : 'Account'}
      scrollKey={view}
    >
      {view === 'account' ? (
        <>
          <Text style={ui.eyebrow}>YOUR ACCOUNT</Text>
          <Text accessibilityRole="header" style={ui.title}>
            Account.
          </Text>
          <Text style={ui.copy}>{email}</Text>
          <View style={ui.divider} />
          <>
            {onJournal && (
              <>
                <AccountLink label="Workout history" onPress={onJournal} />
                <View style={ui.divider} />
              </>
            )}
          </>
          <AccountLink label="Saved profile" onPress={() => setView('profile')} />
          <View style={ui.divider} />
          <AccountLink label="Sharing permission" onPress={() => setView('sharing')} />
          <View style={ui.divider} />
          <AccountLink label="Sign out" onPress={() => setView('signout')} />
        </>
      ) : view === 'signout' ? (
        <>
          <Text accessibilityRole="header" style={ui.title}>
            Sign out?
          </Text>
          <Text style={ui.copy}>
            Unsubmitted intake text on this device will be removed. Your saved profile and submitted
            answers stay with this account.
          </Text>
          <Action label="Confirm sign out" onPress={onSignOut} />
          <Action label="Stay signed in" onPress={() => setView('account')} secondary />
        </>
      ) : (
        <>
          <Text style={ui.eyebrow}>YOUR ACCOUNT</Text>
          <Text accessibilityRole="header" style={ui.title}>
            Saved profile.
          </Text>
          <Text style={ui.copy}>Your saved details.</Text>
          {loading ? (
            <Text style={ui.copy}>Loading your profile…</Text>
          ) : error ? (
            <>
              <Notice error>{error}</Notice>
              <Action label="Retry saved profile" onPress={() => setRetry((n) => n + 1)} />
            </>
          ) : profile ? (
            <>
              {[
                ['Name', `${profile.firstName} ${profile.lastName}`],
                [
                  'Height',
                  `${Math.floor(profile.height.value / 12)} ft ${profile.height.value % 12} in`,
                ],
                ...(profile.birthday
                  ? [
                      ['Birthday', profile.birthday],
                      ['Age', `${profile.age} years`],
                    ]
                  : [
                      ['Age as recorded', `${profile.age} years`],
                      ['Birthday', 'Not recorded'],
                    ]),
                ['Weight as recorded', `${profile.weight.value} lb`],
                ['Gender', profile.gender],
                ['Last saved', new Date(profile.updatedAt).toLocaleDateString()],
              ].map(([label, value]) => (
                <View
                  key={label}
                  style={{
                    gap: 5,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderColor: '#DCDFE4',
                  }}
                >
                  <Text style={ui.eyebrow}>{label}</Text>
                  <Text style={ui.copy}>{value}</Text>
                </View>
              ))}
              <Action label="Edit profile" onPress={() => setEditing(true)} />
            </>
          ) : (
            <Notice>Complete your profile to save these details.</Notice>
          )}
        </>
      )}
    </Page>
  );
}

function AccountLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[ui.row, { minHeight: 56, paddingVertical: 12 }]}
    >
      <Text style={ui.copy}>{label}</Text>
      <Text style={ui.copy}>›</Text>
    </Pressable>
  );
}
