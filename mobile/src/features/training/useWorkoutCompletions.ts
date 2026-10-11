import { useEffect, useRef, useState } from 'react';
import type { JournalCompletions } from '../../../../backend/src/shared/journalContract';
import { JournalError, journalRequest } from '../journal/journalApi';
import type { TrainingPlan } from './trainingApi';

export const completionKey = (date: string, index: number) => `${date}:${index}`;
const empty: ReadonlySet<string> = new Set();
export function useWorkoutCompletions({
  plan,
  userId,
  accessToken,
  onSessionEnded,
  refreshVersion,
}: {
  plan?: TrainingPlan;
  userId: string;
  accessToken: () => Promise<string>;
  onSessionEnded?: () => void;
  refreshVersion: string;
}) {
  const planId = plan?.reviewState === 'accepted' ? plan.id : undefined,
    revision = plan?.planRevision,
    key = planId && revision ? `${userId}:${planId}:${revision}:${refreshVersion}` : '';
  const [saved, setSaved] = useState<{
    key: string;
    completed: ReadonlySet<string>;
    error: boolean;
  } | null>(null);
  const token = useRef(accessToken),
    ended = useRef(onSessionEnded);
  token.current = accessToken;
  ended.current = onSessionEnded;
  useEffect(() => {
    if (!key || !planId || !revision) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      c.abort();
      setSaved({ key, completed: empty, error: true });
    }, 15000);
    void (async () => {
      try {
        const t = await token.current();
        if (c.signal.aborted) return;
        const value = await journalRequest<JournalCompletions>(
          `/completed-sessions?planId=${encodeURIComponent(planId)}&revision=${revision}`,
          t,
          c.signal,
        );
        if (value.planId !== planId || value.revision !== revision) throw Error();
        if (!c.signal.aborted)
          setSaved({
            key,
            completed: new Set(value.sessions.map((s) => completionKey(s.date, s.sessionIndex))),
            error: false,
          });
      } catch (e) {
        if (c.signal.aborted) return;
        setSaved({ key, completed: empty, error: true });
        if (e instanceof JournalError && e.code === 'session_ended') ended.current?.();
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [key, planId, revision]);
  return {
    completed: saved?.key === key ? saved.completed : empty,
    error: !!key && saved?.key === key && saved.error,
    loading: !!key && saved?.key !== key,
  };
}
