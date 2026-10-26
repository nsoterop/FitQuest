import { useEffect, useRef, useState } from 'react';
import type { JournalCompletions } from '../../../../backend/src/shared/journalContract';
import { JournalError, journalRequest } from '../journal/journalApi';
import type { TrainingPlan } from './trainingApi';
import { privateJournalDrafts } from '../journal/journalStorage';
import { journalSourceKey } from '../journal/journalEdits';

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
          `/finished-sessions?planId=${encodeURIComponent(planId)}&revision=${revision}`,
          t,
          c.signal,
        );
        if (value.planId !== planId || value.revision !== revision) throw Error();
        const local = await privateJournalDrafts.list(userId);
        const pending = new Set(
          local.filter((d) => d.dirty || d.pending).map((d) => journalSourceKey(d.source)),
        );
        if (!c.signal.aborted)
          setSaved({
            key,
            completed: new Set(
              value.sessions
                .filter(
                  (s) =>
                    !pending.has(
                      journalSourceKey({
                        planId,
                        revision,
                        date: s.date,
                        sessionIndex: s.sessionIndex,
                      }),
                    ),
                )
                .map((s) => completionKey(s.date, s.sessionIndex)),
            ),
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
