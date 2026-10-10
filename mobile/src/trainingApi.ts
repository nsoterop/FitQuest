import { validWeeklySchedule, type WeeklySchedule } from '../../backend/src/weeklyScheduleContract';
import { validHistoryConsent, type HistoryConsent } from '../../backend/src/progressConsent';
import { validPlanningConsent, type PlanningConsent } from '../../backend/src/planningConsent';
import {
  validDailyNutrition,
  documentPlanVersion,
  nutritionDocumentPlanVersion,
  type AcceptedNutrition,
  validSavedDocument,
  validDocumentOverview,
  documentOverview,
  isDocumentVersion,
  legacyDocumentPlanVersion,
  type DocumentVersion,
  type SavedDocumentPlan,
  type DocumentOverview,
} from '../../backend/src/documentPlanContract';
import {
  validCompletePlan,
  validOverview,
  planOverview,
  type WeeklyPlan,
  type PlanOverview,
} from '../../backend/src/completePlanContract';
import { validNutrition, type Nutrition } from './nutrition';
import { validSessionMeaning } from './trainingPresentation';
export type Clarification = { question: string; reason: string };
export const needsClarification = (value: {
  clarification?: Clarification | null;
  coverage: string[];
}) => !!value.clarification || value.coverage.some((code) => code !== 'missing_catalog_coverage');
const validClarification = (value: Clarification | null | undefined) =>
  value == null ||
  (typeof value.question === 'string' &&
    value.question.length >= 8 &&
    value.question.length <= 350 &&
    typeof value.reason === 'string' &&
    value.reason.length >= 8 &&
    value.reason.length <= 350);
export type TrainingFact = {
  intakeIndex?: number;
  category: 'goals' | 'availability' | 'equipment' | 'experience' | 'limitations' | 'nutrition';
  text: string;
  origin: 'user_report' | 'model_inference' | 'assumption' | 'unknown';
  goals?: string[] | null;
  nutritionInput?: {
    equationSex: 'male' | 'female' | null;
    weightIntent: 'maintain' | 'lose' | 'gain' | null;
    safety: 'general' | 'sensitive' | 'unknown';
  } | null;
};
export type TrainingDay = {
  date: string;
  detail: {
    clarification?: Clarification | null;
    date: string;
    coverage: string[];
    catalogVersion: string;
    sessions: {
      estimatedMinutes?: number;
      timing?: 'morning' | 'midday' | 'evening' | 'flexible' | null;
      intervals?: {
        workIndex: number;
        recoveryIndex: number;
        recoveries: 'between' | 'after_each';
      }[];
      activities: {
        repRange?: { min: number; max: number } | null;
        rir?: number | null;
        distanceTarget?: { value: number; unit: 'm' | 'km' | 'mi' | 'yd' } | null;
        id: string;
        phase: string;
        sets: number;
        measure: string;
        amount: number;
        effort: string;
        restSeconds: number;
        load: string;
        loadKg: number | null;
        side: string;
      }[];
    }[];
    activities: Record<
      string,
      {
        name: string;
        instructions: string;
        tracking: string;
        loadConvention: string;
        setup: string;
        review: string;
        reference: string;
        referenceScope: string;
      }
    >;
  };
};
export type TrainingPlan = {
  weekStart?: string | null;
  nextOperation?: string | null;
  contextCapturedAt?: string;
  contextChanged?: boolean;
  acceptedDocument?: {
    schemaVersion?: DocumentVersion;
    revision: number;
    acceptedAt: string;
    plan: SavedDocumentPlan;
  } | null;
  schemaVersion?: 'complete-week-v1' | DocumentVersion | null;
  documentPlan?: SavedDocumentPlan | null;
  documentOverview?: DocumentOverview | null;
  completeReady?: boolean;
  completePlan?: WeeklyPlan | null;
  overview?: PlanOverview | null;
  activityNames?: Record<string, { name: string; loadConvention: string }>;
  acceptedAt?: string | null;
  createdAt?: string;
  outlineFirst?: boolean;
  confirmedOutlineRevision?: number | null;
  reviewState?: 'legacy' | 'draft' | 'accepted';
  planRevision?: number;
  reviewNote?: string | null;
  reviewQuestion?: string | null;
  id: string;
  summaryRevision: number;
  timeZone: string;
  dates: string[];
  catalogVersion: string;
  outline: {
    sourceFormat?: 'plain-v1';
    originalResponse?: string;
    nutrition?: Nutrition;
    arrangementNote?: string | null;
    qualityVersion?: 2;
    units?: 'imperial' | 'metric';
    goalDecisions?: {
      sourceIndex: number;
      goalIndex?: number;
      goal: string;
      status: 'addressed' | 'introductory' | 'deferred';
      reason: string;
      evidence: { date: string; sessionIndex: number; activityIndex: number }[];
    }[];
    clarification?: Clarification | null;
    days: {
      date: string;
      sourceHeading?: string;
      restText?: string;
      sessions: {
        plain?: {
          sourceText: string;
          goal: string | null;
          durationText: string | null;
          durationRange: { min: number; max: number } | null;
          timingText: string | null;
          optional: boolean;
        };
        focus: string;
        activityIds: string[];
        timing?: 'morning' | 'midday' | 'evening' | 'flexible' | null;
        estimatedMinutes?: number;
      }[];
    }[];
    coverage: string[];
  } | null;
  days: TrainingDay[];
  jobs: {
    stage?: 'outline' | 'workouts' | null;
    rawResponse?: string | null;
    feedback?: string | null;
    target: string;
    status: string;
    error: string | null;
    attemptId: string;
  }[];
};
export const weekComplete = (plan: TrainingPlan) =>
  plan.schemaVersion === 'complete-week-v1' || isDocumentVersion(plan.schemaVersion)
    ? !!plan.completeReady
    : !!plan.outline &&
      !needsClarification(plan.outline) &&
      !plan.outline.coverage.length &&
      plan.dates.every((date) =>
        plan.days.some(
          (d) => d.date === date && !needsClarification(d.detail) && !d.detail.coverage.length,
        ),
      );
export type TrainingState = {
  schedule?: WeeklySchedule | null;
  nextOffset?: number | null;
  nextPlanId?: string;
  historyConsent?: HistoryConsent | null;
  consent?: PlanningConsent | null;
  onboarded?: boolean;
  summary: {
    preferences?: string[];
    revision: number;
    document: TrainingFact[];
    timeZone: string;
    sourceConversation?: string | null;
  } | null;
  plans: TrainingPlan[];
};
const validationReasons: Record<string, string> = {
  week_schema: 'response structure',
  week_dates: 'week dates',
  blocked_response: 'conflict response',
  detail_schema: 'workout structure',
  detail_date: 'workout date',
  session_count: 'session count',
  session_focus: 'session focus',
  timing_required: 'session timing',
  distance_required: 'distance target',
  main_work: 'main exercise',
  quantity: 'exercise quantity',
  load: 'exercise load',
  rep_range: 'repetition range',
  rir: 'repetitions-in-reserve target',
  distance_conversion: 'distance conversion',
  interval_order: 'interval order',
  interval_prescription: 'work/recovery prescription',
  goal_identity: 'goal matching',
  goal_evidence: 'goal support',
  goal_coverage: 'goal coverage',
  units: 'units',
};
function validationError(code: string) {
  const match = /^invalid_plan:([a-z_]+)(?::[0-9]{1,5}){0,4}$/.exec(code),
    reason = match && validationReasons[match[1]!];
  return reason
    ? `Workout creation failed the ${reason} check. Your saved plan is unchanged. An explicit retry makes another AI request.`
    : undefined;
}
export const trainingError = (code: string) =>
  validationError(code) ??
  (
    {
      progress_context_limit:
        'Your saved history exceeds the safe request size. No AI request was sent; all notes remain saved.',
      accepted_week_required: 'Accept a training week before creating next week.',
      history_consent_required:
        'Allow workout and weight history sharing with OpenAI before creating next week.',
      planning_consent_required:
        'Allow profile sharing with OpenAI before a new plan request. Existing plans remain available.',
      consent_changed: 'Your sharing permission changed. Reload and try again.',
      invalid_document:
        'The generated week could not be read reliably. Your saved plan is unchanged. An explicit retry makes another AI request.',
      outlined_schedule_changed:
        'The workouts changed the saved outline. They were not saved. Retry workouts to keep its days and sessions.',
      plan_unavailable:
        'A complete plan could not be prepared. Review the explanation; any saved plan is unchanged. An explicit retry makes a new AI request.',
      outline_conversion:
        'The response could not be converted reliably. Its original text is saved below; no usable plan was published. You can explicitly retry.',
      saved_nutrition_changed:
        'The response changed nutrition you asked to keep. Your saved plan remains unchanged; clarify the requested change.',
      invalid_nutrition:
        'The nutrition estimate did not pass validation. Your saved plan is unchanged.',
      outline_confirmation_required:
        'Review and explicitly confirm the outline before creating workouts.',
      approved_outline_changed:
        'The response changed the approved outline and was not saved. Your outline remains available.',
      outline_conflict:
        'Workout creation found a conflict with the approved outline. Review the explanation below and revise or explicitly retry.',
      plan_changed: 'This plan changed. Reload before reviewing or accepting it.',
      review_pending: 'Changes are still being prepared. Reload to check before accepting.',
      review_unavailable:
        'This plan cannot be accepted yet. Resolve the question or finish generation first.',
      invalid_feedback: 'Describe the changes or the answer to the planning question.',
      feedback_limit: 'This request is too long. Keep the planning changes concise.',
      time_limit:
        'The proposed work did not fit the saved time limits. Your previous plan is unchanged.',
      preference_limit: 'The saved preference limit was reached. Your previous plan is unchanged.',
      clarification_required:
        'A planning answer is needed. Continue clarification from your saved summary.',
      summary_changed: 'Your summary changed. Reload before generating future sessions.',
      summary_required: 'Complete onboarding to save a training summary first.',
      summary_needs_correction: 'Update the missing summary fields before planning.',
      catalog_changed: 'This plan uses an older catalog. Update your summary to create a new week.',
      saved_day_changed:
        'The response changed an existing session and was not saved. Your saved sessions are unchanged; you can explicitly retry the week.',
      catalog_coverage: 'The catalog could not support a valid weekly prescription.',
      budget_exhausted:
        'The shared AI spending allowance is exhausted. Your summary and saved plans remain available.',
      ai_disabled: 'AI generation is unavailable. Your saved summary and plans remain available.',
      adults_only: 'AI planning is for adults 18+.',
      invalid_plan: 'The generated plan did not pass validation. You can explicitly retry.',
      outline_context_limit:
        'This outline exceeds the generation limit and was not saved. Generate the complete weekly plan explicitly; your summary is still saved.',
      planning_context_limit:
        'This request exceeds the generation limit. Your saved summary and plans remain available.',
      invalid_timezone: 'Choose a valid time zone on your device.',
      interrupted: 'Generation was interrupted. An explicit retry may incur another AI charge.',
      provider_error: 'Generation did not finish. An explicit retry may incur another AI charge.',
      refused: 'AI could not generate this plan.',
      incomplete: 'The AI response was incomplete.',
      session_ended: 'Your session ended. Please sign in again.',
    } as Record<string, string>
  )[code] ??
  'Could not load training. Reload to check saved progress before retrying.';
export class TrainingError extends Error {
  code: string;
  constructor(code: string) {
    super(trainingError(code));
    this.code = code;
  }
}
function validQuality(p: TrainingPlan): boolean {
  const o = p.outline!;
  if (!validNutrition(o.nutrition)) return false;
  if (o.sourceFormat !== undefined) {
    if (
      o.sourceFormat !== 'plain-v1' ||
      typeof o.originalResponse !== 'string' ||
      o.originalResponse.length > 64000 ||
      !o.originalResponse.trim() ||
      o.nutrition !== undefined
    )
      return false;
    if (
      !o.days.every(
        (d) => d.sessions.length > 0 || (typeof d.restText === 'string' && !!d.restText.trim()),
      )
    )
      return false;
    if (
      !o.days.every((d) =>
        d.sessions.every((s) => {
          const v = s.plain;
          return (
            v &&
            typeof v.sourceText === 'string' &&
            !!v.sourceText.trim() &&
            (v.goal === null || typeof v.goal === 'string') &&
            (v.timingText === null || typeof v.timingText === 'string') &&
            typeof v.optional === 'boolean' &&
            typeof v.durationText === 'string' &&
            v.durationRange &&
            Number.isFinite(v.durationRange.min) &&
            v.durationRange.min > 0 &&
            Number.isFinite(v.durationRange.max) &&
            v.durationRange.max >= v.durationRange.min
          );
        }),
      )
    )
      return false;
  }
  if (
    o.arrangementNote != null &&
    (typeof o.arrangementNote !== 'string' || o.arrangementNote.length > 350)
  )
    return false;
  if (o.qualityVersion === undefined) return o.goalDecisions === undefined && o.units === undefined;
  if (
    o.qualityVersion !== 2 ||
    !['imperial', 'metric'].includes(o.units ?? '') ||
    !Array.isArray(o.goalDecisions) ||
    o.goalDecisions.length > 24
  )
    return false;
  return o.goalDecisions.every(
    (g) =>
      g &&
      Number.isInteger(g.sourceIndex) &&
      g.sourceIndex >= 0 &&
      g.sourceIndex < 12 &&
      (g.goalIndex === undefined ||
        (Number.isInteger(g.goalIndex) && g.goalIndex >= 0 && g.goalIndex < 24)) &&
      typeof g.goal === 'string' &&
      g.goal.trim().length > 0 &&
      g.goal.length <= (o.sourceFormat === 'plain-v1' ? 4000 : 150) &&
      typeof g.reason === 'string' &&
      g.reason.length >= 8 &&
      g.reason.length <= 350 &&
      ['addressed', 'introductory', 'deferred'].includes(g.status) &&
      Array.isArray(g.evidence) &&
      g.evidence.length <= 7 &&
      (g.status === 'deferred' ? g.evidence.length === 0 : g.evidence.length > 0) &&
      g.evidence.every((e) => {
        if (!e || !Number.isInteger(e.sessionIndex) || !Number.isInteger(e.activityIndex))
          return false;
        const s = p.days?.find((d) => d.date === e.date)?.detail?.sessions?.[e.sessionIndex],
          a = s?.activities?.[e.activityIndex];
        return (
          a?.phase === 'main' && !s?.intervals?.some((i) => i.recoveryIndex === e.activityIndex)
        );
      }),
  );
}
function validReview(p: TrainingPlan): boolean {
  if (p.outlineFirst !== undefined && typeof p.outlineFirst !== 'boolean') return false;
  if (
    p.confirmedOutlineRevision != null &&
    (!p.outlineFirst ||
      !Number.isInteger(p.confirmedOutlineRevision) ||
      p.confirmedOutlineRevision < 1 ||
      p.confirmedOutlineRevision !== p.planRevision)
  )
    return false;
  if (
    p.outlineFirst &&
    p.outline &&
    p.outline.sourceFormat !== 'plain-v1' &&
    !p.outline.clarification &&
    p.outline.days.some((d) =>
      d.sessions.some(
        (s) =>
          !Number.isInteger(s.estimatedMinutes) ||
          s.estimatedMinutes! < 1 ||
          s.estimatedMinutes! > 240 ||
          !['morning', 'midday', 'evening', 'flexible'].includes(s.timing ?? ''),
      ),
    )
  )
    return false;
  if (
    p.outlineFirst &&
    p.reviewState === 'accepted' &&
    (!weekComplete(p) || p.confirmedOutlineRevision !== p.planRevision)
  )
    return false;
  if (p.reviewState === undefined) return p.planRevision === undefined;
  if (
    !['legacy', 'draft', 'accepted'].includes(p.reviewState) ||
    !Number.isInteger(p.planRevision) ||
    p.planRevision! < 0
  )
    return false;
  if (
    (p.reviewNote != null && (typeof p.reviewNote !== 'string' || p.reviewNote.length > 600)) ||
    (p.reviewQuestion != null &&
      (typeof p.reviewQuestion !== 'string' || p.reviewQuestion.length > 350))
  )
    return false;
  if (p.reviewState === 'accepted' && !p.planRevision) return false;
  if (
    p.reviewState !== 'legacy' &&
    p.planRevision! > 0 &&
    !p.days?.every((d) =>
      d.detail?.sessions?.every(
        (s) =>
          Number.isInteger(s.estimatedMinutes) &&
          s.estimatedMinutes! >= 1 &&
          (p.outline?.sourceFormat === 'plain-v1' || s.estimatedMinutes! <= 240),
      ),
    )
  )
    return false;
  return true;
}
function validCompleteState(p: TrainingPlan): boolean {
  if (
    !p ||
    typeof p.id !== 'string' ||
    !Number.isInteger(p.summaryRevision) ||
    typeof p.timeZone !== 'string' ||
    typeof p.catalogVersion !== 'string' ||
    !Array.isArray(p.dates) ||
    p.dates.length !== 7 ||
    new Set(p.dates).size !== 7 ||
    !p.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) ||
    !Number.isInteger(p.planRevision) ||
    p.planRevision! < 0 ||
    !['draft', 'accepted'].includes(p.reviewState ?? '')
  )
    return false;
  if (
    p.outline !== null ||
    !Array.isArray(p.days) ||
    p.days.length ||
    typeof p.completeReady !== 'boolean' ||
    !Array.isArray(p.jobs) ||
    !p.jobs.every(
      (j) =>
        typeof j.target === 'string' &&
        typeof j.attemptId === 'string' &&
        ['pending', 'failed', 'completed'].includes(j.status) &&
        (j.stage == null || ['outline', 'workouts'].includes(j.stage)) &&
        !j.rawResponse,
    )
  )
    return false;
  if (p.reviewNote != null && (typeof p.reviewNote !== 'string' || p.reviewNote.length > 600))
    return false;
  if (p.completeReady) {
    if (!p.planRevision || !validOverview(p.overview, p.dates)) return false;
  } else if (p.overview !== null || p.completePlan !== null || p.reviewState !== 'draft')
    return false;
  if (p.reviewState === 'accepted')
    return (
      !!p.acceptedAt &&
      validCompletePlan(p.completePlan, p.dates) &&
      JSON.stringify(planOverview(p.completePlan)) === JSON.stringify(p.overview) &&
      p.completePlan.days.every((d) =>
        d.sessions.every((s) =>
          s.blocks.every((b) =>
            [...b.exercises, ...(b.recovery?.activity ? [b.recovery.activity] : [])].every(
              (e) =>
                typeof p.activityNames?.[e.activityId]?.name === 'string' &&
                typeof p.activityNames[e.activityId]?.loadConvention === 'string',
            ),
          ),
        ),
      )
    );
  return (
    p.completePlan === null &&
    p.acceptedAt === null &&
    !!p.activityNames &&
    Object.keys(p.activityNames).length === 0
  );
}
function validDocumentState(p: TrainingPlan): boolean {
  if (
    p.acceptedDocument != null &&
    (!Number.isInteger(p.acceptedDocument.revision) ||
      p.acceptedDocument.revision < 1 ||
      p.acceptedDocument.revision > (p.planRevision ?? 0) ||
      typeof p.acceptedDocument.acceptedAt !== 'string' ||
      !Number.isFinite(Date.parse(p.acceptedDocument.acceptedAt)) ||
      !validSavedDocument(
        p.acceptedDocument.plan,
        p.dates,
        p.acceptedDocument.schemaVersion ?? legacyDocumentPlanVersion,
      ))
  )
    return false;
  if (
    !p ||
    typeof p.id !== 'string' ||
    !Number.isInteger(p.summaryRevision) ||
    typeof p.timeZone !== 'string' ||
    !Array.isArray(p.dates) ||
    p.dates.length !== 7 ||
    new Set(p.dates).size !== 7 ||
    !p.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) ||
    !Number.isInteger(p.planRevision) ||
    p.planRevision! < 0 ||
    !['draft', 'accepted'].includes(p.reviewState ?? '')
  )
    return false;
  if (
    p.outline !== null ||
    p.completePlan != null ||
    p.outlineFirst !== false ||
    !Array.isArray(p.days) ||
    p.days.length ||
    typeof p.completeReady !== 'boolean' ||
    !Array.isArray(p.jobs) ||
    !p.jobs.every(
      (j) =>
        typeof j.target === 'string' &&
        typeof j.attemptId === 'string' &&
        ['pending', 'failed', 'completed'].includes(j.status) &&
        j.rawResponse == null &&
        j.stage == null,
    )
  )
    return false;
  if (p.completeReady) {
    if (!p.planRevision || !validDocumentOverview(p.documentOverview, p.dates, p.schemaVersion))
      return false;
  } else if (p.documentOverview !== null || p.documentPlan !== null || p.reviewState !== 'draft')
    return false;
  if (p.reviewState === 'accepted')
    return (
      !!p.acceptedAt &&
      validSavedDocument(p.documentPlan, p.dates, p.schemaVersion) &&
      JSON.stringify(documentOverview(p.documentPlan)) === JSON.stringify(p.documentOverview)
    );
  return p.documentPlan === null && p.acceptedAt === null;
}
function validState(value: unknown): value is TrainingState {
  if (!value || typeof value !== 'object') return false;
  const s = value as TrainingState;
  return (
    (s.schedule == null || validWeeklySchedule(s.schedule)) &&
    (s.historyConsent == null || validHistoryConsent(s.historyConsent)) &&
    (s.nextPlanId === undefined || typeof s.nextPlanId === 'string') &&
    (s.consent == null || validPlanningConsent(s.consent)) &&
    (s.onboarded === undefined || typeof s.onboarded === 'boolean') &&
    (s.summary === null ||
      (!!s.summary &&
        Number.isInteger(s.summary.revision) &&
        s.summary.revision > 0 &&
        typeof s.summary.timeZone === 'string' &&
        (s.summary.preferences === undefined ||
          (Array.isArray(s.summary.preferences) &&
            s.summary.preferences.length <= 6 &&
            s.summary.preferences.every((p) => typeof p === 'string' && p.length <= 350))) &&
        (s.summary.sourceConversation === undefined ||
          s.summary.sourceConversation === null ||
          typeof s.summary.sourceConversation === 'string') &&
        Array.isArray(s.summary.document) &&
        s.summary.document.length <= 12 &&
        s.summary.document.every(
          (f) =>
            f &&
            typeof f.text === 'string' &&
            f.text.length <= (f.intakeIndex === undefined ? 350 : 4000) &&
            [
              'goals',
              'availability',
              'equipment',
              'experience',
              'limitations',
              'nutrition',
            ].includes(f.category) &&
            ['user_report', 'model_inference', 'assumption', 'unknown'].includes(f.origin) &&
            (f.goals == null ||
              (f.category === 'goals' &&
                Array.isArray(f.goals) &&
                f.goals.length > 0 &&
                f.goals.length <= 24 &&
                f.goals.every(
                  (g) => typeof g === 'string' && g.trim().length > 0 && g.length <= 150,
                ))),
        ))) &&
    Array.isArray(s.plans) &&
    s.plans.length <= 20 &&
    s.plans.every((p) =>
      isDocumentVersion(p.schemaVersion)
        ? validDocumentState(p)
        : p.schemaVersion === 'complete-week-v1'
          ? validCompleteState(p)
          : p.schemaVersion != null
            ? false
            : validReview(p) &&
              typeof p.id === 'string' &&
              Number.isInteger(p.summaryRevision) &&
              typeof p.timeZone === 'string' &&
              typeof p.catalogVersion === 'string' &&
              Array.isArray(p.dates) &&
              p.dates.length >= 1 &&
              p.dates.length <= 7 &&
              new Set(p.dates).size === p.dates.length &&
              p.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) &&
              (p.outline === null ||
                (!!p.outline &&
                  validQuality(p) &&
                  validClarification(p.outline.clarification) &&
                  Array.isArray(p.outline.coverage) &&
                  p.outline.coverage.every((x) => typeof x === 'string') &&
                  Array.isArray(p.outline.days) &&
                  p.outline.days.length === p.dates.length &&
                  p.outline.days.every(
                    (d, i) =>
                      d.date === p.dates[i] &&
                      Array.isArray(d.sessions) &&
                      (p.outline?.sourceFormat === 'plain-v1' || d.sessions.length <= 3) &&
                      d.sessions.every(
                        (x) =>
                          typeof x.focus === 'string' &&
                          x.focus.trim().length > 0 &&
                          x.focus.length <= (p.outline?.sourceFormat === 'plain-v1' ? 64000 : 64) &&
                          !/[\r\n]/.test(x.focus) &&
                          Array.isArray(x.activityIds) &&
                          x.activityIds.every((id) => typeof id === 'string'),
                      ),
                  ))) &&
              Array.isArray(p.jobs) &&
              p.jobs.every(
                (j) =>
                  typeof j.target === 'string' &&
                  ['pending', 'failed', 'completed'].includes(j.status) &&
                  typeof j.attemptId === 'string' &&
                  (j.rawResponse == null ||
                    (typeof j.rawResponse === 'string' && j.rawResponse.length <= 64000)) &&
                  (j.error === null || typeof j.error === 'string'),
              ) &&
              Array.isArray(p.days) &&
              p.days.length <= p.dates.length &&
              new Set(p.days.map((d) => d.date)).size === p.days.length &&
              p.days.every(
                (d) =>
                  p.dates.includes(d.date) &&
                  d.detail?.date === d.date &&
                  validClarification(d.detail.clarification) &&
                  Array.isArray(d.detail.coverage) &&
                  Array.isArray(d.detail.sessions) &&
                  (p.outline?.sourceFormat === 'plain-v1' || d.detail.sessions.length <= 3) &&
                  d.detail.sessions.every(
                    (x) =>
                      Array.isArray(x.activities) &&
                      x.activities.length <= 15 &&
                      x.activities.every(
                        (a) =>
                          typeof a.id === 'string' &&
                          !!d.detail.activities?.[a.id] &&
                          typeof d.detail.activities[a.id]!.name === 'string' &&
                          typeof d.detail.activities[a.id]!.instructions === 'string' &&
                          Number.isFinite(a.amount) &&
                          Number.isInteger(a.sets) &&
                          typeof a.measure === 'string' &&
                          typeof a.phase === 'string',
                      ) &&
                      validSessionMeaning(x),
                  ),
              ),
    )
  );
}
export async function trainingRequest(
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  body: unknown,
  token: string,
  signal: AbortSignal,
): Promise<TrainingState> {
  try {
    const url = new URL(process.env.EXPO_PUBLIC_API_URL ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || !token || signal.aborted)
      throw Error();
    const [route, query] = path.split('?');
    url.pathname = `${url.pathname.replace(/\/$/, '')}/training${route}`;
    url.search = query ?? '';
    url.hash = '';
    const response = await fetch(url.toString(), {
      method,
      signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
    if (signal.aborted) throw Error();
    if (response.status === 401) throw new TrainingError('session_ended');
    const value = await response.json();
    if (signal.aborted) throw Error();
    if (response.status !== 200)
      throw new TrainingError(typeof value?.code === 'string' ? value.code : 'unavailable');
    if (!validState(value)) throw Error();
    return value;
  } catch (e) {
    if (e instanceof TrainingError) throw e;
    throw new TrainingError('unavailable');
  }
}

// A saved summary or a pending draft never establishes initial acceptance.
export function hasAcceptedTraining(s: TrainingState) {
  return (
    s.onboarded === true ||
    s.plans.some((p) => p.reviewState === 'accepted' || !!p.acceptedDocument)
  );
}
export function acceptedTrainingPlan(p: TrainingPlan | undefined): TrainingPlan | undefined {
  if (!p) return;
  if (p.reviewState === 'accepted') return p;
  const accepted = p.acceptedDocument;
  if (!isDocumentVersion(p.schemaVersion) || !accepted) return;
  return {
    ...p,
    schemaVersion: accepted.schemaVersion ?? legacyDocumentPlanVersion,
    reviewState: 'accepted',
    planRevision: accepted.revision,
    acceptedAt: accepted.acceptedAt,
    documentPlan: accepted.plan,
    documentOverview: documentOverview(accepted.plan),
  };
}

export async function nutritionTargetRequest(
  date: string,
  token: string,
  signal: AbortSignal,
): Promise<AcceptedNutrition | null> {
  try {
    const base = new URL(process.env.EXPO_PUBLIC_API_URL ?? '');
    if (base.protocol !== 'https:' || base.username || base.password || !token || signal.aborted)
      throw Error();
    base.pathname = `${base.pathname.replace(/\/$/, '')}/training/nutrition`;
    base.search = new URLSearchParams({ date }).toString();
    base.hash = '';
    const response = await fetch(base.toString(), {
      method: 'GET',
      signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (signal.aborted) throw Error();
    if (response.status === 401) throw new TrainingError('session_ended');
    const value = await response.json();
    if (response.status !== 200) throw Error();
    const t = value?.target;
    if (t === null) return null;
    if (
      !t ||
      ![documentPlanVersion, nutritionDocumentPlanVersion].includes(t.schemaVersion) ||
      typeof t.planId !== 'string' ||
      !Number.isInteger(t.planRevision) ||
      t.planRevision < 1 ||
      typeof t.acceptedAt !== 'string' ||
      !Number.isFinite(Date.parse(t.acceptedAt)) ||
      typeof t.timeZone !== 'string' ||
      !Array.isArray(t.dates) ||
      t.dates.length !== 7 ||
      !t.dates.includes(date) ||
      !validDailyNutrition(t.nutrition)
    )
      throw Error();
    return t;
  } catch (e) {
    if (e instanceof TrainingError) throw e;
    throw new TrainingError('unavailable');
  }
}

export function acceptedPlanForDate(s: TrainingState | null, date: string) {
  return s?.plans
    .map(acceptedTrainingPlan)
    .filter((p): p is TrainingPlan => !!p && p.dates.includes(date))
    .sort((a, b) =>
      (b.acceptedAt ?? b.createdAt ?? '').localeCompare(a.acceptedAt ?? a.createdAt ?? ''),
    )[0];
}
