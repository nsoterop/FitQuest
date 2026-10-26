import { useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';
import { Action, colors } from '../../components/Design';
import { privateJournalDrafts } from './journalStorage';
import { hasJournalWork, journalSourceKey } from './journalEdits';
import { journalRequest } from './journalApi';
import type {
  JournalSource,
  JournalSessionStates,
} from '../../../../backend/src/shared/journalContract';

export function WorkoutJournalAction({
  userId,
  source,
  accessToken,
  onOpen,
}: {
  userId: string;
  source: JournalSource;
  accessToken: () => Promise<string>;
  onOpen: () => void;
}) {
  const [label, setLabel] = useState('Open workout'),
    [error, setError] = useState(false),
    [refresh, setRefresh] = useState(0);
  const identity = journalSourceKey(source);
  useEffect(() => {
    const controller = new AbortController();
    setLabel('Open workout');
    setError(false);
    void (async () => {
      try {
        const drafts = await privateJournalDrafts.list(userId);
        const local = drafts
          .filter((d) => journalSourceKey(d.source) === identity)
          .sort((a, b) => b.savedAt - a.savedAt)[0];
        if (controller.signal.aborted) return;
        if (local)
          setLabel(
            local.journal?.document.outcome !== 'in_progress' && local.journal?.document.outcome
              ? 'View workout'
              : hasJournalWork(local)
                ? 'Continue workout'
                : 'Start workout',
          );
        const state = await journalRequest<JournalSessionStates>(
          `/session-states?planId=${source.planId}&revision=${source.revision}`,
          await accessToken(),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (state.planId !== source.planId || state.revision !== source.revision) throw Error();
        if (local?.dirty || local?.pending) return;
        const saved = state.sessions.find(
          (s) => s.date === source.date && s.sessionIndex === source.sessionIndex,
        );
        setLabel(
          saved?.finished ? 'View workout' : saved?.hasWork ? 'Continue workout' : 'Start workout',
        );
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    const subscription = AppState.addEventListener('change', (s) => {
      if (s === 'active') setRefresh((n) => n + 1);
    });
    return () => {
      controller.abort();
      subscription.remove();
    };
  }, [userId, identity, refresh]);
  return (
    <>
      <Action label={label} onPress={onOpen} />
      {error && (
        <Text style={{ color: colors.muted }}>
          Saved status unavailable. Opening checks your saved workout and device edits.
        </Text>
      )}
    </>
  );
}
