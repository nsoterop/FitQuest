import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Action, Notice, Page, ui } from '../../components/Design';
import { PlanningPermission } from '../training/PlanningPermission';
import { TrainingError, trainingRequest, type TrainingState } from '../training/trainingApi';
import {
  recurringConsentVersion,
  recurringConsentScope,
} from '../../../../backend/src/shared/planningConsent';

export function PlanningSettings({
  userId,
  accessToken,
  onBack,
  onSessionEnded,
}: {
  userId: string;
  accessToken: () => Promise<string>;
  onBack: () => void;
  onSessionEnded: () => void;
}) {
  return (
    <AccountPlanningSettings
      key={userId}
      accessToken={accessToken}
      onBack={onBack}
      onSessionEnded={onSessionEnded}
    />
  );
}
function AccountPlanningSettings({
  accessToken,
  onBack,
  onSessionEnded,
}: Omit<Parameters<typeof PlanningSettings>[0], 'userId'>) {
  const [state, setState] = useState<TrainingState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [blocked, setBlocked] = useState(false);
  const alive = useRef(true),
    pending = useRef<AbortController | null>(null),
    token = useRef(accessToken),
    ended = useRef(onSessionEnded);
  token.current = accessToken;
  ended.current = onSessionEnded;
  async function readOrChange(granted?: boolean) {
    if (pending.current) return;
    const c = new AbortController();
    pending.current = c;
    setBusy(true);
    setError('');
    const timer = setTimeout(() => c.abort(), 75000);
    try {
      const t = await token.current();
      if (!alive.current || c.signal.aborted) return;
      const next = await trainingRequest(
        granted === undefined ? '' : '/consent',
        granted === undefined ? 'GET' : 'PUT',
        granted === undefined
          ? undefined
          : {
              version: recurringConsentVersion,
              scope: recurringConsentScope,
              granted,
              expectedRevision: state?.consent?.revision ?? 0,
              expectedHistoryRevision: state?.historyConsent?.revision ?? 0,
            },
        t,
        c.signal,
      );
      if (!alive.current || c.signal.aborted) return;
      setState(next);
      setBlocked(false);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof TrainingError && e.code === 'session_ended') ended.current();
      else {
        setBlocked(true);
        setError(
          'Could not confirm sharing permission. Check saved permission before trying again. Saved plans and logs remain available.',
        );
      }
    } finally {
      clearTimeout(timer);
      if (pending.current === c) {
        pending.current = null;
        if (alive.current) setBusy(false);
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    void readOrChange();
    return () => {
      alive.current = false;
      pending.current?.abort();
    };
  }, []);
  return (
    <Page onBack={onBack} backLabel="Account">
      <Text accessibilityRole="header" style={ui.title}>
        Sharing permission.
      </Text>
      {busy && <Text style={ui.copy}>Checking permission…</Text>}
      {error && <Notice error>{error}</Notice>}
      {state && (
        <PlanningPermission
          consent={state.consent}
          historyConsent={state.historyConsent}
          timeZone={state.summary?.timeZone}
          busy={busy || blocked}
          onChange={(granted) => void readOrChange(granted)}
        />
      )}
      {state?.schedule && (
        <Text style={ui.copy}>
          {state.schedule.enabled
            ? 'Sunday planning · 9 PM · ' + state.schedule.timeZone
            : state.schedule.autoEnrolled
              ? 'Automatic planning is off while sharing is withdrawn.'
              : 'Previously paused Sunday planning stays paused.'}
        </Text>
      )}
      {blocked && (
        <Action
          label="Check saved permission"
          disabled={busy}
          onPress={() => void readOrChange()}
        />
      )}
    </Page>
  );
}
