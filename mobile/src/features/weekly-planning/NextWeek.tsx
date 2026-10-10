import { WeeklyScheduleControls } from './WeeklyScheduleControls';
import { weeklyScheduleVersion } from '../../../../backend/src/shared/weeklyScheduleContract';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { secureSessionStorage } from '../account/secureSessionStorage';
import { operationId } from '../onboarding/onboardingApi';
import { JournalField } from '../journal/JournalScreen';
import { Action, Notice, ui } from '../../components/Design';
import {
  hasHistoryConsent,
  historyConsentVersion,
  historyConsentScope,
  historyDisclosure,
} from '../../../../backend/src/shared/progressConsent';
import type { TrainingState } from '../training/trainingApi';
const storage = secureSessionStorage({
  getItemAsync: (k) => SecureStore.getItemAsync(k),
  setItemAsync: (k, v) =>
    SecureStore.setItemAsync(k, v, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  deleteItemAsync: (k) => SecureStore.deleteItemAsync(k),
});
type Draft = { changes: string; operationId: string | null };
export function NextWeek({
  userId,
  state,
  busy,
  onRequest,
  onOpen,
}: {
  userId: string;
  state: TrainingState;
  busy: boolean;
  onRequest: (path: string, method: 'POST' | 'PUT', body: unknown) => Promise<TrainingState>;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<Draft>({ changes: '', operationId: null }),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const live = useRef(true),
    current = useRef(draft),
    key = 'next-week.' + userId;
  useEffect(() => {
    live.current = true;
    void storage
      .getItem(key)
      .then((raw) => {
        if (!live.current) return;
        const d = raw ? JSON.parse(raw) : null;
        if (d) {
          if (
            typeof d.changes !== 'string' ||
            d.changes.length > 2000 ||
            !(d.operationId === null || typeof d.operationId === 'string')
          )
            throw Error();
          current.current = d;
          setDraft(d);
        }
        setReady(true);
      })
      .catch(() => {
        if (live.current)
          setError(
            'Could not restore next-week input. Reopen this screen to retry; it has not been removed.',
          );
      });
    return () => {
      live.current = false;
    };
  }, [key]);
  async function persist(d: Draft) {
    current.current = d;
    setDraft(d);
    await storage.setItem(key, JSON.stringify(d));
  }
  async function create() {
    if (!ready || busy || saving) return;
    setSaving(true);
    setError('');
    try {
      const d = { ...current.current, operationId: current.current.operationId ?? operationId() };
      await persist(d);
      const s = await onRequest('/next-week', 'POST', d);
      if (!live.current) return;
      if (s.nextPlanId) {
        await persist({ changes: '', operationId: null });
        onOpen(s.nextPlanId);
        setOpen(false);
      }
    } catch {
      if (live.current)
        setError(
          'Your next-week input is kept. Check saved progress, then retry this same request.',
        );
    } finally {
      if (live.current) setSaving(false);
    }
  }
  const schedule = state.schedule;
  const setSchedule = (enabled: boolean) =>
    void onRequest('/schedule', 'PUT', {
      version: weeklyScheduleVersion,
      enabled,
      expectedRevision: schedule?.revision ?? 0,
    }).catch(() => {});
  const allowed = hasHistoryConsent(state.historyConsent),
    disabled = busy || saving;
  const permission = (granted: boolean) =>
    void onRequest('/history-consent', 'PUT', {
      version: historyConsentVersion,
      scope: historyConsentScope,
      granted,
      expectedRevision: state.historyConsent?.revision ?? 0,
    }).catch(() => {});
  return (
    <View style={{ gap: 12 }}>
      <Action
        label={open ? 'Close next-week setup' : 'Generate next week'}
        secondary
        disabled={disabled}
        onPress={() => setOpen((v) => !v)}
      />
      {open && (
        <>
          <Text style={ui.copy}>
            Create the upcoming Monday–Sunday using your saved goals and progress. An existing week
            opens free; changing it requires an explicit revision.
          </Text>
          {error && <Notice error>{error}</Notice>}
          <JournalField
            multiline
            label="Anything different next week? (optional)"
            value={draft.changes}
            disabled={disabled || !!draft.operationId || !ready}
            onChange={(changes) => {
              if (changes.length <= 2000)
                void persist({ ...current.current, changes }).catch(() =>
                  setError('Could not save this device draft. Keep this screen open and retry.'),
                );
            }}
          />
          {!allowed ? (
            <>
              {schedule?.enabled && (
                <Action
                  label="Pause automatic weekly plans"
                  secondary
                  disabled={disabled}
                  onPress={() => setSchedule(false)}
                />
              )}
              <Text style={ui.copy}>{historyDisclosure}</Text>
              <Action
                label="Allow workout and weight history sharing"
                disabled={disabled}
                onPress={() => permission(true)}
              />
              <Action
                label="Decline history sharing"
                secondary
                disabled={disabled || state.historyConsent?.granted === false}
                onPress={() => permission(false)}
              />
              {state.historyConsent?.granted === false && (
                <Text style={ui.copy}>
                  History sharing declined. Your saved plans and logs stay available.
                </Text>
              )}
            </>
          ) : (
            <>
              <Action
                label={
                  draft.operationId ? 'Retry saved next-week request' : 'Generate upcoming week'
                }
                disabled={disabled || !ready}
                onPress={() => void create()}
              />
              <WeeklyScheduleControls
                schedule={schedule}
                disabled={disabled}
                onToggle={setSchedule}
              />
              <Action
                label="Withdraw history sharing permission"
                secondary
                disabled={disabled}
                onPress={() => permission(false)}
              />
            </>
          )}
        </>
      )}
    </View>
  );
}
