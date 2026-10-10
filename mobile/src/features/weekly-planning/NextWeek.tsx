import { WeeklyScheduleControls } from './WeeklyScheduleControls';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { secureSessionStorage } from '../account/secureSessionStorage';
import { operationId } from '../onboarding/onboardingApi';
import { JournalField } from '../journal/JournalScreen';
import { Action, Notice, ui } from '../../components/Design';
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
  onRequest: (
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
  ) => Promise<TrainingState>;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<Draft>({ changes: '', operationId: null }),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const live = useRef(true),
    locked = useRef(false),
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
            'Could not restore saved next-week input. Reopen to retry; it has not been removed.',
          );
      });
    return () => {
      live.current = false;
    };
  }, [key]);
  async function persist(d: Draft) {
    await storage.setItem(key, JSON.stringify(d));
    if (!live.current) return;
    current.current = d;
    setDraft(d);
  }
  async function recoverDraft() {
    if (!ready || busy || locked.current) return;
    locked.current = true;
    setSaving(true);
    setError('');
    try {
      const d = { ...current.current, operationId: current.current.operationId ?? operationId() };
      // Reconcile saved attempts first; never blindly replay an uncertain mutation.
      let s = await onRequest('', 'GET');
      let existing = s.plans.find((p) => p.nextOperation === d.operationId);
      while (!existing && s.nextOffset) {
        s = await onRequest('?offset=' + s.nextOffset, 'GET');
        existing = s.plans.find((p) => p.nextOperation === d.operationId);
      }
      if (!live.current) return;
      if (!existing) {
        await persist(d);
        if (!live.current) return;
        s = await onRequest('/next-week', 'POST', d);
      }
      if (!live.current) return;
      const id = existing?.id ?? s.nextPlanId;
      if (id) {
        await persist({ changes: '', operationId: null });
        if (live.current) {
          onOpen(id);
          setOpen(false);
        }
      }
    } catch {
      if (live.current)
        setError(
          'Your saved next-week input is kept. Check and recover this same request; uncertain work is never automatically retried.',
        );
    } finally {
      locked.current = false;
      if (live.current) setSaving(false);
    }
  }
  const recoverable = !!draft.changes.trim() || !!draft.operationId;
  const upcoming = state.plans.find((p) => p.weekStart && p.reviewState !== 'accepted');
  return (
    <View style={{ gap: 12 }}>
      <WeeklyScheduleControls schedule={state.schedule} />
      {upcoming && (
        <Action
          label="Review upcoming week"
          secondary
          disabled={busy || saving}
          onPress={() => onOpen(upcoming.id)}
        />
      )}
      {error && <Notice error>{error}</Notice>}
      {recoverable && (
        <Action
          label={open ? 'Close saved next-week input' : 'Recover saved next-week input'}
          secondary
          disabled={busy || saving}
          onPress={() => setOpen((v) => !v)}
        />
      )}
      {open && recoverable && (
        <>
          <Text style={ui.copy}>
            Input saved before automatic planning remains available. Recovering it checks the
            original request and keeps any existing saved week.
          </Text>
          <JournalField
            multiline
            label="Saved next-week changes"
            value={draft.changes}
            disabled={busy || saving || !!draft.operationId || !ready}
            onChange={(changes) => {
              if (changes.length <= 2000)
                void persist({ ...current.current, changes }).catch(() =>
                  setError('Could not save this device draft. Keep this screen open and retry.'),
                );
            }}
          />
          <Action
            label="Check and recover saved next-week request"
            disabled={busy || saving || !ready}
            onPress={() => void recoverDraft()}
          />
        </>
      )}
    </View>
  );
}
