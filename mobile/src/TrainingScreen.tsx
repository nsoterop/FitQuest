import { NextWeek } from './NextWeek';
import { hasHistoryConsent } from '../../backend/src/shared/progressConsent';
import { JournalScreen } from './JournalScreen';
import {
  hasPlanningConsent,
  planningConsentVersion,
  planningConsentScope,
} from '../../backend/src/shared/planningConsent';
import { PlanningPermission } from './PlanningPermission';
import { NutritionTargets } from './NutritionTargets';
import { isDocumentVersion } from '../../backend/src/shared/documentPlanContract';
import { NutritionScreen } from './NutritionScreen';
import { CompleteWeekView } from './CompleteWeekView';
import { Action, Page, ui, Tabs, Notice } from './Design';
import {
  DocumentToday,
  DocumentWeek,
  DocumentWorkout,
  dateLabel,
  localToday,
  type WorkoutSelection,
} from './DocumentTrainingView';
import { useConversationScroll } from './ConversationScrollView';
import { sessionRows } from './trainingPresentation';
import type { RecoveryRequest } from './onboardingApi';
import { privateDrafts } from './onboardingDraftStorage';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  hasAcceptedTraining,
  acceptedPlanForDate,
  needsClarification,
  weekComplete,
  TrainingError,
  trainingError,
  trainingRequest,
  type TrainingState,
  type TrainingPlan,
  type TrainingDay,
} from './trainingApi';

const coverageText: Record<string, string> = {
  missing_catalog_coverage: 'The catalog does not cover the requested work.',
  equipment_or_facility_unknown: 'Equipment or facility access needs clarification.',
  skill_partner_or_supervision_unknown:
    'Skill, partner or supervision requirements need clarification.',
  limitations_need_clarification: 'Relevant limitations need clarification.',
  summary_needs_correction: 'Update the training summary before planning.',
};
const calendarDate = (date: string) =>
  `${new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}, ${date}`;
type TrainingProps = {
  initialTab?: 'today' | 'week' | 'nutrition';
  onAccount?: () => void;
  userId: string;
  accessToken: () => Promise<string>;
  onClose: () => void;
  onSessionEnded?: () => void;
  onClarify?: (request: RecoveryRequest) => void;
  generateOnOpen?: boolean;
};
export function TrainingScreen(props: TrainingProps) {
  return <AccountTrainingScreen key={props.userId} {...props} />;
}
function AccountTrainingScreen({
  initialTab,
  onAccount,
  userId,
  accessToken,
  onClose,
  onSessionEnded,
  onClarify,
  generateOnOpen = false,
}: TrainingProps) {
  const [state, setState] = useState<TrainingState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(''),
    [feedback, setFeedback] = useState('');
  const alive = useRef(true),
    pending = useRef<AbortController | null>(null),
    token = useRef(accessToken),
    ended = useRef(onSessionEnded);
  token.current = accessToken;
  ended.current = onSessionEnded;
  const [tab, setTab] = useState<'today' | 'week' | 'nutrition'>(initialTab ?? 'week'),
    [workout, setWorkout] = useState<WorkoutSelection | null>(null),
    [blocked, setBlocked] = useState(false),
    [leaving, setLeaving] = useState(false),
    [daySelection, setDaySelection] = useState<WorkoutSelection>({ date: localToday(), index: 0 });
  const lastToday = useRef(localToday());
  const calendarRefresh = useRef(() => {}),
    calendarZone = useRef<string | undefined>(undefined);
  calendarZone.current = state?.summary?.timeZone;
  useEffect(() => {
    const refresh = (foreground = false) => {
      const today = localToday(calendarZone.current);
      if (today !== lastToday.current) {
        lastToday.current = today;
        setDaySelection({ date: today, index: 0 });
        calendarRefresh.current();
      } else if (foreground) calendarRefresh.current();
    };
    const timer = setInterval(() => refresh(), 60000);
    const subscription = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh(true);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (state?.summary?.timeZone) {
      const date = localToday(state.summary.timeZone);
      lastToday.current = date;
      setDaySelection({ date, index: 0 });
    }
  }, [state?.summary?.timeZone]);
  const [journalOpen, setJournalOpen] = useState<false | 'resume' | 'repeat'>(false);
  const [workoutPlan, setWorkoutPlan] = useState<TrainingPlan | null>(null);
  const initial = useRef(generateOnOpen),
    firstLoad = useRef(true);
  const submitted = useRef<{ planId: string; planRevision: number; feedback: string } | null>(null);
  function update(s: TrainingState) {
    if (alive.current) {
      if (state && !hasAcceptedTraining(state) && hasAcceptedTraining(s)) setTab('today');
      setState(s);
      if (firstLoad.current) {
        firstLoad.current = false;
        if (!initialTab && hasAcceptedTraining(s)) setTab('today');
      }
      const sent = submitted.current;
      if (sent) {
        const result = s.plans.find((p) => p.id === sent.planId);
        if (result && result.planRevision !== sent.planRevision) {
          setFeedback((old) => (old === sent.feedback ? '' : old));
          submitted.current = null;
        }
      }
      const p =
        s.plans.find((x) => x.id === selected) ??
        s.plans.find((x) => x.summaryRevision === s.summary?.revision);
      const job = p?.jobs.find(
        (j) => j.target === `review:${p.planRevision}` && j.status !== 'completed',
      );
      if (job?.feedback) setFeedback((old) => old || job.feedback!);
    }
  }
  async function run(
    work: (
      request: (
        path: string,
        method: 'GET' | 'POST' | 'PUT',
        body?: unknown,
      ) => Promise<TrainingState>,
    ) => Promise<void>,
  ) {
    if (pending.current) return;
    const c = new AbortController();
    pending.current = c;
    setBusy(true);
    setError('');
    const timer = setTimeout(() => c.abort(), 210000);
    let methodUsed = 'GET';
    try {
      const t = await token.current();
      if (!alive.current || c.signal.aborted) return;
      const request = async (path: string, method: 'GET' | 'POST' | 'PUT', body?: unknown) => {
        if (!alive.current || c.signal.aborted) throw Error();
        methodUsed = method;
        const next = await trainingRequest(path, method, body, t, c.signal);
        if (!alive.current || c.signal.aborted) throw Error();
        if (next.summary?.sourceConversation)
          await privateDrafts.clear(userId, next.summary.sourceConversation);
        if (!alive.current || c.signal.aborted || pending.current !== c) throw Error();
        update(
          path.startsWith('?offset=') && state
            ? {
                ...next,
                plans: [
                  ...state.plans.filter((p) => !next.plans.some((n) => n.id === p.id)),
                  ...next.plans,
                ],
              }
            : next,
        );
        if (
          path === '/accept' &&
          next.plans
            .find((p) => p.id === (body as { planId?: string })?.planId)
            ?.dates.includes(localToday(next.summary?.timeZone))
        ) {
          setTab('today');
          setWorkout(null);
        }
        if (method === 'GET') setBlocked(false);
        return next;
      };
      await work(request);
    } catch (e) {
      if (alive.current && pending.current === c) {
        if (e instanceof TrainingError && e.code === 'session_ended') ended.current?.();
        else {
          const unknown =
            c.signal.aborted || !(e instanceof TrainingError) || e.code === 'unavailable';
          const stale =
            e instanceof TrainingError &&
            ['plan_changed', 'summary_changed', 'review_pending', 'consent_changed'].includes(
              e.code,
            );
          if (unknown || stale) setBlocked(true);
          setError(
            unknown
              ? methodUsed === 'GET'
                ? 'Couldn’t load your training. Check your connection and reload saved training.'
                : 'The connection ended before we received a result. Check status before trying again. Your saved work remains available.'
              : (e as TrainingError).message,
          );
        }
      }
    } finally {
      clearTimeout(timer);
      if (pending.current === c) {
        pending.current = null;
        if (alive.current) setBusy(false);
      }
    }
  }
  calendarRefresh.current = () => {
    if (!pending.current && !feedback.trim() && !journalOpen)
      void run(async (request) => {
        await request('', 'GET');
      });
  };
  const current = state?.plans.find(
    (p) => p.summaryRevision === state.summary?.revision && !p.weekStart,
  );
  const shown = state?.plans.find((p) => p.id === selected) ?? current ?? state?.plans[0];
  const onboarded = !!state && hasAcceptedTraining(state);
  const accepted = acceptedPlanForDate(state, daySelection.date);
  const openWorkout = (plan: TrainingPlan | undefined, selection: WorkoutSelection) => {
    if (plan?.reviewState === 'accepted') {
      setWorkoutPlan(plan);
      setWorkout(selection);
    }
  };
  const overviewReady =
    shown?.schemaVersion === 'complete-week-v1' || isDocumentVersion(shown?.schemaVersion)
      ? !!shown.completeReady
      : !!shown?.outline && !needsClarification(shown.outline) && !shown.outline.coverage.length;
  const reviewing =
    (shown?.reviewState === 'draft' || shown?.reviewState === 'accepted') &&
    (shown?.schemaVersion === 'complete-week-v1' ||
      isDocumentVersion(shown?.schemaVersion) ||
      !shown?.outlineFirst ||
      !weekComplete(shown));
  const reviewJob = shown?.jobs.find((j) => j.target === `review:${shown.planRevision}`);
  const inFlight = shown?.jobs.some((j) => j.status === 'pending');
  type Request = Parameters<Parameters<typeof run>[0]>[0];
  async function initialPlan(request: Request, s: TrainingState, retry = false) {
    if (!s.summary) return;
    if (!hasPlanningConsent(s.consent)) return;
    let p = s.plans.find((x) => x.summaryRevision === s.summary!.revision && !x.weekStart);
    if (!p) {
      s = await request('/plans', 'POST', { revision: s.summary.revision });
      p = s.plans.find((x) => x.summaryRevision === s.summary!.revision && !x.weekStart);
    }
    if (!p) return;
    setSelected(p.id);
    // A completion callback may be replayed after a lost response. Only a pristine
    // plan auto-generates; saved/failed/pending work needs an explicit weekly action.
    if (!retry && (p.completeReady || p.outline || p.days.length || p.jobs.length)) return;
    const target =
      p.schemaVersion === 'complete-week-v1' || isDocumentVersion(p.schemaVersion)
        ? 'week'
        : p.outlineFirst
          ? 'outline'
          : 'week';
    const job = p.jobs.find((j) => j.target === target);
    await request('/generate', 'POST', {
      summaryRevision: s.summary!.revision,
      planId: p.id,
      target,
      retryAttempt: retry && job?.status === 'failed' ? job.attemptId : null,
    });
  }
  useEffect(() => {
    alive.current = true;
    void run(async (request) => {
      const s = await request('', 'GET');
      if (initial.current) {
        initial.current = false;
        await initialPlan(request, s);
      }
    });
    return () => {
      alive.current = false;
      pending.current?.abort();
      pending.current = null;
    };
  }, [userId]);
  const button = (label: string, press: () => void, secondary = false, disabled = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy || disabled || (blocked && !secondary)}
      onPress={press}
      style={[
        styles.button,
        secondary && styles.secondary,
        (busy || disabled || (blocked && !secondary)) && { opacity: 0.5 },
      ]}
    >
      <Text style={secondary ? styles.copy : styles.buttonText}>{label}</Text>
    </Pressable>
  );
  function clarification(
    value: { clarification?: { question: string; reason: string } | null; coverage: string[] },
    target: string,
    plan = shown,
  ) {
    if (!plan || !state?.summary) return null;
    return (
      <View style={styles.day}>
        <Text style={styles.copy}>
          {value.clarification?.reason ??
            'This saved plan needs a clarification check before it can be used.'}
        </Text>
        {value.clarification && <Text style={styles.label}>{value.clarification.question}</Text>}
        {plan.summaryRevision === state.summary.revision &&
          onClarify &&
          button('Continue clarification', () =>
            onClarify({ planId: plan.id, summaryRevision: state.summary!.revision, target }),
          )}
      </View>
    );
  }
  function sessionSummary(
    session: NonNullable<TrainingPlan['outline']>['days'][number]['sessions'][number],
    detail?: TrainingDay['detail']['sessions'][number],
  ) {
    const timing = session.plain?.timingText ?? session.timing ?? detail?.timing,
      minutes = session.estimatedMinutes ?? detail?.estimatedMinutes;
    return (
      <View style={styles.exercise}>
        <Text style={styles.label}>{session.focus}</Text>
        {session.plain?.optional && <Text style={styles.small}>Optional session</Text>}
        {!!session.plain?.goal && <Text style={styles.copy}>{session.plain.goal}</Text>}
        {!!timing && <Text style={styles.small}>{timing[0]!.toUpperCase() + timing.slice(1)}</Text>}
        {session.plain?.durationText ? (
          <Text style={styles.copy}>About {session.plain.durationText}</Text>
        ) : (
          minutes !== undefined && <Text style={styles.copy}>About {minutes} min</Text>
        )}
      </View>
    );
  }
  function showDay(day: TrainingDay) {
    const d = day.detail;
    if (needsClarification(d)) return clarification(d, day.date);
    return (
      <View key={day.date} style={styles.day}>
        {d.coverage.map((code) => (
          <Text key={code} style={styles.copy}>
            {coverageText[code] ?? 'Catalog coverage is limited.'}
          </Text>
        ))}
        {!d.sessions.length &&
          !d.coverage.length &&
          !shown?.outline?.days.find((x) => x.date === day.date)?.restText && (
            <Text style={styles.copy}>Rest — no prescribed session.</Text>
          )}
        {d.sessions.map((s, i) => (
          <View key={i} style={styles.day}>
            {sessionSummary(
              shown?.outline?.days.find((x) => x.date === day.date)?.sessions[i] ?? {
                focus: `Session ${i + 1}`,
                activityIds: [],
              },
              s,
            )}
            {sessionRows(s, d.activities).map((row, j, rows) => (
              <View key={j} style={styles.exercise}>
                {(j === 0 || rows[j - 1]?.phase !== row.phase) && row.phase !== 'main' && (
                  <Text style={styles.small}>
                    {(
                      { warmup: 'Warm-up', cooldown: 'Cool-down', optional: 'Optional' } as Record<
                        string,
                        string
                      >
                    )[row.phase] ?? row.phase}
                  </Text>
                )}
                {j > 0 && rows[j - 1]?.phase !== row.phase && row.phase === 'main' && (
                  <Text style={styles.small}>Main</Text>
                )}
                <Text style={styles.copy}>{row.text}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  const document = isDocumentVersion(shown?.schemaVersion);
  const permitted = hasPlanningConsent(state?.consent);
  const changeConsent = (granted: boolean) =>
    void run(async (request) => {
      await request('/consent', 'PUT', {
        version: planningConsentVersion,
        scope: planningConsentScope,
        granted,
        expectedRevision: state?.consent?.revision ?? 0,
      });
    });
  const nextWeek =
    state && onboarded ? (
      <NextWeek
        key={userId}
        userId={userId}
        state={state}
        busy={busy || blocked || !!feedback.trim()}
        onOpen={(id) => {
          setSelected(id);
          setTab('week');
        }}
        onRequest={(path, method, body) =>
          new Promise<TrainingState>((resolve, reject) => {
            void run(async (request) => {
              try {
                const result = await request(path, method, body);
                if (path === '/next-week' && result.nextPlanId) {
                  setSelected(result.nextPlanId);
                  setTab('week');
                  const p = result.plans.find((x) => x.id === result.nextPlanId);
                  if (p && !p.completeReady && !p.jobs.length)
                    await request('/generate', 'POST', {
                      planId: p.id,
                      summaryRevision: p.summaryRevision,
                      target: 'week',
                      retryAttempt: null,
                    });
                }
                resolve(result);
              } catch (e) {
                reject(e);
                throw e;
              }
            });
          })
        }
      />
    ) : null;
  const close = () => {
    if (feedback.trim()) setLeaving(true);
    else onClose();
  };
  const body = (
    <View style={styles.screen}>
      <Text style={ui.eyebrow}>YOUR TRAINING</Text>
      <Text accessibilityRole="header" style={ui.title}>
        {document
          ? shown?.reviewState === 'accepted'
            ? 'Your week.'
            : 'Review your week.'
          : 'Your training'}
      </Text>
      {busy && (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          Loading or generating…
        </Text>
      )}

      {state && !state.summary && (
        <Text style={styles.copy}>
          Complete onboarding to save a training summary and create your week.
        </Text>
      )}
      {state?.summary && (
        <>
          {!permitted && (
            <PlanningPermission
              consent={state.consent}
              busy={busy || blocked}
              onChange={changeConsent}
            />
          )}
          {!current &&
            permitted &&
            button(
              onboarded ? 'Create week from updated summary' : 'Generate weekly plan',
              () => void run((request) => initialPlan(request, state, true)),
            )}
          {current && current.jobs.some((j) => j.error === 'summary_needs_correction')
            ? clarification({ coverage: ['summary_needs_correction'] }, 'outline', current)
            : current &&
              permitted &&
              (!current.outlineFirst || !current.outline) &&
              !weekComplete(current) &&
              !current.jobs.some((j) => j.status === 'pending') &&
              !(
                current.outline &&
                (needsClarification(current.outline) || current.outline.coverage.length)
              ) &&
              !current.days.some((d) => needsClarification(d.detail) || d.detail.coverage.length) &&
              button(
                current.outlineFirst
                  ? current.jobs.some((j) => j.target === 'outline' && j.status === 'failed')
                    ? 'Retry weekly outline'
                    : 'Generate weekly outline'
                  : current.jobs.some((j) => j.target === 'week' && j.status === 'failed')
                    ? current.jobs.some((j) => j.target === 'week' && j.stage === 'workouts')
                      ? 'Retry workouts'
                      : current.jobs.some((j) => j.target === 'week' && j.stage === 'outline')
                        ? 'Retry plan outline'
                        : 'Retry weekly plan'
                    : current.outline
                      ? 'Complete weekly plan'
                      : 'Generate weekly plan',
                () => void run((request) => initialPlan(request, state, true)),
              )}
        </>
      )}
      {nextWeek}
      {shown && (
        <View style={{ gap: 20 }}>
          <Text style={ui.copy}>
            {dateLabel(shown.dates[0]!)} – {dateLabel(shown.dates.at(-1)!)}
          </Text>
          {shown.contextCapturedAt && (
            <Text style={ui.copy}>
              Progress captured {new Date(shown.contextCapturedAt).toLocaleString()}.
              {shown.contextChanged
                ? ' New or changed context is available. This saved request stays unchanged; use an explicit revision to include updates.'
                : ''}
            </Text>
          )}
          {shown.weekStart &&
            !shown.completeReady &&
            !shown.jobs.some((j) => j.status === 'pending') &&
            button(
              shown.jobs.length ? 'Retry upcoming week' : 'Generate saved upcoming week',
              () =>
                void run(async (request) => {
                  const job = shown.jobs.find((j) => j.target === 'week');
                  await request('/generate', 'POST', {
                    planId: shown.id,
                    summaryRevision: shown.summaryRevision,
                    target: 'week',
                    retryAttempt: job?.status === 'failed' ? job.attemptId : null,
                  });
                }),
              false,
              !permitted || !hasHistoryConsent(state?.historyConsent),
            )}
          {shown.reviewState === 'legacy' && (
            <Text style={styles.small}>Saved plan — acceptance was not recorded.</Text>
          )}
          {!!shown.outline?.arrangementNote && (
            <Text style={styles.copy}>{shown.outline.arrangementNote}</Text>
          )}
          {!!shown.reviewNote && <Text style={styles.copy}>{shown.reviewNote}</Text>}
          {shown.summaryRevision !== state?.summary?.revision && (
            <Text style={styles.small}>
              Saved before your summary correction. Its existing sessions remain unchanged. Create a
              new week for future generation.
            </Text>
          )}
          {shown.outline && needsClarification(shown.outline)
            ? clarification(shown.outline, 'outline')
            : shown.outline?.coverage.map((code) => (
                <Text key={code} style={styles.error}>
                  {coverageText[code] ?? 'Catalog coverage is limited.'} A usable outline has not
                  been created.
                </Text>
              ))}
          {shown.outline?.goalDecisions
            ?.filter((g) => g.status !== 'addressed')
            .map((g, i) => (
              <Text key={`goal-${i}`} style={styles.small}>
                {g.goal}: {g.reason}
              </Text>
            ))}
          {shown.jobs
            .filter(
              (j) =>
                j.status !== 'completed' &&
                (j.target === `review:${shown.planRevision}` ||
                  j.target === 'week' ||
                  j.target === `details:${shown.planRevision}` ||
                  !shown.jobs.some((x) => x.target === 'week')),
            )
            .map((j) => (
              <Text key={j.target} style={styles.copy}>
                {j.stage === 'outline'
                  ? 'Plan outline'
                  : j.stage === 'workouts'
                    ? 'Workouts'
                    : j.target.startsWith('review:')
                      ? 'Changes'
                      : j.target === 'week'
                        ? 'Week'
                        : j.target.startsWith('details:')
                          ? 'Workouts'
                          : j.target}
                :{' '}
                {j.status === 'pending'
                  ? 'Generation in progress. Reload to check.'
                  : j.stage === 'outline' && j.error === 'outline_conversion'
                    ? 'The outline could not be read reliably. No workouts were requested. You can explicitly retry the outline.'
                    : trainingError(j.error ?? 'unavailable')}
                {j.stage === 'workouts' && j.status === 'failed'
                  ? ' Your outline is saved. Retry uses it without another outline request unless your answers, profile or revision feedback have changed.'
                  : ''}
              </Text>
            ))}
          {!shown.outline &&
            shown.jobs
              .filter((j) => j.rawResponse && j.status === 'failed')
              .map((j) => (
                <View key={`raw-${j.target}`} style={styles.day}>
                  <Text style={styles.label}>Response saved for recovery — not a usable plan</Text>
                  <Text style={styles.copy}>
                    {j.error === 'outline_conversion'
                      ? 'The response could not be converted into a complete dated outline. Retry checks the saved response first; a new AI request is used only if it still cannot be converted.'
                      : 'The response did not produce a usable outline. An explicit retry requests a new plan.'}
                  </Text>
                </View>
              ))}
          {isDocumentVersion(shown.schemaVersion) ? (
            <DocumentWeek plan={shown} onOpen={(selection) => openWorkout(shown, selection)} />
          ) : (
            shown.schemaVersion === 'complete-week-v1' && <CompleteWeekView plan={shown} />
          )}
          <NutritionTargets
            nutrition={shown.documentOverview?.nutrition}
            pending={shown.reviewState !== 'accepted'}
          />
          {shown.outline &&
            !needsClarification(shown.outline) &&
            !shown.outline.coverage.length &&
            shown.outline.days.map((d) => (
              <View key={d.date} accessibilityLabel={`Training day ${d.date}`} style={styles.day}>
                <Text accessibilityRole="header" style={styles.label}>
                  {calendarDate(d.date)}
                </Text>
                {d.restText && <Text style={styles.copy}>{d.restText}</Text>}
                {shown.days.some((x) => x.date === d.date) && shown.reviewState !== 'draft' ? (
                  showDay(shown.days.find((x) => x.date === d.date)!)
                ) : (
                  <>
                    {!d.sessions.length && !d.restText && (
                      <Text style={styles.copy}>Rest — no planned session.</Text>
                    )}
                    {d.sessions.map((session, i) => (
                      <View
                        key={i}
                        accessibilityLabel={`Session ${i + 1} on ${d.date}`}
                        style={styles.session}
                      >
                        {sessionSummary(
                          session,
                          shown.days.find((x) => x.date === d.date)?.detail.sessions[i],
                        )}
                      </View>
                    ))}
                  </>
                )}
              </View>
            ))}
          {reviewing &&
            (shown.outlineFirst ? overviewReady : weekComplete(shown)) &&
            (shown.weekStart || shown.summaryRevision === state?.summary?.revision) && (
              <View style={styles.day}>
                <View>
                  <Text
                    accessibilityRole={shown.reviewQuestion ? 'alert' : undefined}
                    style={styles.copy}
                  >
                    {shown.reviewQuestion ?? 'What would you change, and what should stay?'}
                  </Text>
                </View>
                <View style={styles.exercise}>
                  <FeedbackInput
                    accessibilityLabel="Plan feedback"
                    value={feedback}
                    multiline
                    maxLength={2000}
                    editable={!busy && !inFlight}
                    style={[styles.input, { maxHeight: 140 }]}
                    onChangeText={setFeedback}
                    placeholder="Tell me what to change or keep"
                  />
                  <Text style={styles.small}>
                    Feedback and the saved plan are shared with OpenAI for a revision
                    {isDocumentVersion(shown.schemaVersion)
                      ? ' in one request.'
                      : shown.schemaVersion === 'complete-week-v1'
                        ? ' using its saved planning format.'
                        : '.'}{' '}
                    Only context needed for review and recovery is retained.{' '}
                    {shown.schemaVersion === 'complete-week-v1' ||
                    isDocumentVersion(shown.schemaVersion)
                      ? 'Use this plan reveals the saved exercises without another AI request.'
                      : shown.outlineFirst
                        ? 'Confirming the outline sends it, your saved context and the exercise catalog to OpenAI to create all workouts together.'
                        : 'Acceptance makes no AI request.'}
                  </Text>
                  {!!feedback && button('Clear feedback', () => setFeedback(''), true, !!inFlight)}
                  {button(
                    reviewJob?.status === 'failed' ? 'Retry changes' : 'Update this week',
                    () =>
                      void run(async (request) => {
                        submitted.current = {
                          planId: shown.id,
                          planRevision: shown.planRevision!,
                          feedback,
                        };
                        const result = await request('/review', 'POST', {
                          planId: shown.id,
                          summaryRevision: shown.summaryRevision,
                          planRevision: shown.planRevision,
                          feedback,
                          retryAttempt: reviewJob?.status === 'failed' ? reviewJob.attemptId : null,
                        });
                        const next = result.plans.find((p) => p.id === shown.id);
                        if (next?.planRevision !== shown.planRevision) setFeedback('');
                      }),
                    false,
                    !feedback.trim() ||
                      !!inFlight ||
                      (document &&
                        (!permitted ||
                          (!!shown.weekStart && !hasHistoryConsent(state?.historyConsent)))),
                  )}
                  {shown.reviewState === 'draft' &&
                    !shown.outlineFirst &&
                    button(
                      'Use this plan',
                      () =>
                        void run(async (request) => {
                          await request('/accept', 'POST', {
                            planId: shown.id,
                            summaryRevision: shown.summaryRevision,
                            planRevision: shown.planRevision,
                          });
                        }),
                      false,
                      !!feedback.trim() || !!inFlight || !!shown.reviewQuestion,
                    )}
                  {shown.outlineFirst && (
                    <Text style={styles.small}>
                      This older outline has no saved exercises yet. Creating its workouts makes a
                      new AI request.
                    </Text>
                  )}
                  {shown.outlineFirst &&
                    button(
                      shown.jobs.some(
                        (j) =>
                          j.target === `details:${shown.planRevision}` && j.status === 'failed',
                      )
                        ? 'Retry creating workouts'
                        : 'Create workouts from this older outline',
                      () =>
                        void run(async (request) => {
                          const job = shown.jobs.find(
                            (j) => j.target === `details:${shown.planRevision}`,
                          );
                          await request('/generate', 'POST', {
                            planId: shown.id,
                            summaryRevision: shown.summaryRevision,
                            planRevision: shown.planRevision,
                            confirmOutline: true,
                            target: 'week',
                            retryAttempt: job?.status === 'failed' ? job.attemptId : null,
                          });
                        }),
                      false,
                      !!feedback.trim() || !!inFlight || !!shown.reviewQuestion || !!error,
                    )}
                </View>
              </View>
            )}
        </View>
      )}
      {state && permitted && (
        <PlanningPermission
          consent={state.consent}
          busy={busy || blocked}
          onChange={changeConsent}
        />
      )}
      {state?.nextOffset &&
        button(
          'Older saved weeks',
          () =>
            void run(async (request) => {
              await request('?offset=' + state.nextOffset, 'GET');
            }),
          true,
          !!feedback.trim(),
        )}
      {state && state.plans.length > 1 && (
        <View>
          {state.plans
            .filter((p) => p.id !== shown?.id)
            .map((p) =>
              button(
                `View saved week ${p.dates[0]} · revision ${p.summaryRevision}`,
                () => {
                  setSelected(p.id);
                  setDaySelection({ date: localToday(state.summary?.timeZone), index: 0 });
                  setFeedback(
                    p.jobs.find((j) => j.target === `review:${p.planRevision}`)?.feedback ?? '',
                  );
                },
                true,
                !!feedback.trim(),
              ),
            )}
        </View>
      )}
    </View>
  );
  if (journalOpen && workout && workoutPlan)
    return (
      <JournalScreen
        userId={userId}
        accessToken={accessToken}
        onSessionEnded={onSessionEnded}
        onBack={() => setJournalOpen(false)}
        source={{
          planId: workoutPlan.id,
          revision: workoutPlan.planRevision!,
          date: workout.date,
          sessionIndex: workout.index,
        }}
        repeat={journalOpen === 'repeat'}
      />
    );
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1, display: tab === 'nutrition' ? 'none' : 'flex' }}
        accessibilityElementsHidden={tab === 'nutrition'}
        importantForAccessibility={tab === 'nutrition' ? 'no-hide-descendants' : 'auto'}
      >
        <Page
          onAccount={onAccount}
          onBack={workout ? () => setWorkout(null) : undefined}
          backLabel={tab === 'week' ? 'Back to week' : 'Back to day'}
          scrollKey={
            workout
              ? `${workout.date}:${workout.index}`
              : `${tab}:${error ? (blocked ? 'blocked' : 'error') : 'ready'}`
          }
          footer={
            !workout && onboarded ? <Tabs nutrition value={tab} onChange={setTab} /> : undefined
          }
        >
          {!!error && (
            <Notice title={blocked ? 'Check saved progress' : undefined} error>
              {error}
            </Notice>
          )}
          {leaving && (
            <Notice title="Keep your changes?">
              <Text>Leaving this screen discards unsubmitted plan feedback.</Text>
            </Notice>
          )}
          {leaving && (
            <>
              {button('Keep editing', () => setLeaving(false), true)}
              {button('Discard changes and leave', onClose, true)}
            </>
          )}
          {workout && workoutPlan?.reviewState === 'accepted' ? (
            <>
              <DocumentWorkout plan={workoutPlan} selection={workout} />
              <Action label="Log workout" onPress={() => setJournalOpen('resume')} />
              <Action
                label="Record another occurrence"
                secondary
                onPress={() => setJournalOpen('repeat')}
              />
            </>
          ) : tab === 'today' &&
            isDocumentVersion(accepted?.schemaVersion) &&
            accepted.documentOverview ? (
            <>
              <DocumentToday
                selection={daySelection}
                onSelect={setDaySelection}
                plan={accepted}
                onWeek={() => setTab('week')}
                onOpen={(selection) => openWorkout(accepted, selection)}
              />
              {shown?.reviewState === 'draft' &&
                button('Review updated week', () => setTab('week'), true)}
              {nextWeek}
            </>
          ) : tab === 'today' ? (
            <>
              {nextWeek}
              <Text accessibilityRole="header" style={ui.title}>
                Today.
              </Text>
              <Text style={ui.copy}>
                {!state
                  ? error
                    ? 'Saved training hasn’t loaded yet.'
                    : 'Loading your saved training…'
                  : state.summary
                    ? onboarded
                      ? 'Outside your saved week. No accepted workout is saved for this date. Open a saved week to review it.'
                      : 'Open your saved week to review its current status and sessions.'
                    : 'Complete onboarding to build your week.'}
              </Text>
              {button('View saved week', () => setTab('week'))}
              {!state?.summary && button('Start onboarding', close, true)}
            </>
          ) : (
            body
          )}
          {!workout &&
            (blocked || !!error || inFlight || (!state && !busy)) &&
            button(
              blocked || inFlight ? 'Check status' : 'Retry loading saved training',
              () =>
                void run(async (request) => {
                  await request('', 'GET');
                }),
              true,
            )}
        </Page>
      </View>
      {tab === 'nutrition' && onboarded && (
        <NutritionScreen
          userId={userId}
          accessToken={accessToken}
          onSessionEnded={onSessionEnded}
          onAccount={onAccount}
          onTab={setTab}
        />
      )}
    </View>
  );
}
function FeedbackInput(props: React.ComponentProps<typeof TextInput>) {
  const composer = useRef<View | null>(null),
    question = useRef<View | null>(null),
    focused = useRef(false),
    scroll = useConversationScroll();
  const reveal = (focus = false) => scroll.reveal({ composer, question }, focus);
  return (
    <View
      ref={composer}
      collapsable={false}
      onLayout={() => {
        if (focused.current) reveal();
      }}
    >
      <TextInput
        {...props}
        onFocus={() => {
          focused.current = true;
          reveal(true);
        }}
        onBlur={() => {
          focused.current = false;
        }}
        onContentSizeChange={() => {
          if (focused.current) reveal();
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { gap: 18 },
  title: { fontSize: 26, color: '#191B20', fontWeight: '600' },
  label: { fontSize: 16, color: '#191B20', fontWeight: '600' },
  copy: { fontSize: 16, lineHeight: 23, color: '#626670' },
  small: { fontSize: 13, lineHeight: 19, color: '#626670' },
  day: { gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: '#DCDFE4' },
  session: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: '#F2F3F5' },
  exercise: { gap: 6 },
  button: ui.button,
  buttonText: { fontSize: 16, color: '#fff', textAlign: 'center' },
  secondary: { backgroundColor: '#F2F3F5' },
  input: {
    borderWidth: 1,
    borderColor: '#9399A4',
    borderRadius: 8,
    padding: 10,
    color: '#191B20',
    fontSize: 16,
    minHeight: 65,
  },
  error: { color: '#9B302C', fontSize: 16 },
});
