import { reviewProtections } from './reviewProtection.js';
import { Ajv } from 'ajv';
import { isDeepStrictEqual } from 'node:util';
import {
  checkResolvedScope,
  resolvedScopeSchema,
  type ResolvedScope,
} from './resolvedReviewScope.js';
import { providerSchema } from '../../ai/providerSchema.js';
import { OnboardingError } from '../onboarding/onboardingError.js';
import type { OnboardingProvider } from '../../ai/onboardingProvider.js';
import type { PlanningInput, Detail } from './planningDomain.js';
import {
  prepareWeek,
  checkWeek,
  draftWeekSchema,
  weeklyLimits,
  type Week,
  type CheckedWeek,
} from './weeklyPlanning.js';

export type PlanVersion = { planId: string; summaryRevision: number; planRevision: number };
export type ReviewRequest = PlanVersion & { feedback: string; retryAttempt: string | null };
export type ReviewResult = {
  week: CheckedWeek | null;
  reply: string;
  question: string | null;
  lastingPreference: string | null;
};
const reviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scope', 'week', 'changedDates', 'reply', 'lastingPreference'],
  properties: {
    scope: resolvedScopeSchema,
    week: draftWeekSchema,
    changedDates: {
      type: 'array',
      maxItems: 7,
      uniqueItems: true,
      items: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    },
    reply: { type: 'string', minLength: 8, maxLength: 600 },
    lastingPreference: {
      anyOf: [{ type: 'null' }, { type: 'string', minLength: 8, maxLength: 350 }],
    },
  },
};
type Output = {
  scope: ResolvedScope | null;
  week: Week;
  changedDates: string[];
  reply: string;
  lastingPreference: string | null;
};
const valid = new Ajv().compile<Output>(reviewSchema);
export function prepareReview(provider: OnboardingProvider, input: PlanningInput) {
  if (!input.review) throw new OnboardingError(422, 'invalid_feedback');
  const body = JSON.parse(
    prepareWeek(provider, { ...input, outline: undefined, savedDays: undefined, draftReview: true })
      .body,
  );
  body.instructions += `\nThis request is feedback on the EXISTING SAME DATED WEEK in review. Do not treat feedback as unconditional acceptance, including 'yes, but'. Never change the dates or infer performed work. The athlete does not design their exercise program: choose appropriate catalog work yourself. The review.week response contains all supplied detailed dates together. Only revise work requested by the feedback, retaining explicitly kept and unaffected sessions, phases, quantities and order exactly. List the actually changed dates in changedDates; all other dates must echo saved work exactly. A focus-label-only edit does not satisfy a request to change the work. Preserve overall workload coherence, limitations, all expected goals and time limits. You may redistribute work within an authorized date, without adding total workload just to fill slots. A date mentioned only to keep it never restricts changes to that date. A general request for the rest of the week applies beyond kept dates. Earlier keep instructions survive a clarification; merely mentioning or praising a day does not override them. An explicit later request to change kept work may override the earlier keep only for the work actually requested. A kept morning session does not protect a different evening session on that date. If meaning or consent is unclear, ask one clarification; do not assume broader permission.\nIf feedback is ambiguous, conflicts with constraints or kept work, or requires changing another date without permission, return one essential clarification in week.clarification, all dates empty, changedDates empty and a concise conflict explanation in reply. The previous usable plan will remain intact. Do not use onboarding recovery or generate a different dated week. review.context, when present, is the single unresolved request/question; the new feedback answers or corrects it. Once resolved, do not retain a planning chat history.\nreply briefly describes actual changes (or why nothing changed), not a second plan or extra prescriptions. duration estimates must be based on the resulting saved prescriptions; never change estimates to conceal a time conflict. lastingPreference is null by default: one-off week changes do not change future preferences. Only if the athlete explicitly says 'from now on', 'going forward', 'future weeks' or 'always', copy a short exact substring containing that request into lastingPreference. Retain only distribution/timing preferences, never new goals, constraints or medical facts in that field. Do not weaken retained availability/limitations. These preferences will be disclosed in the overview and used for future planning. Existing preferences are context, never immutable constraints; the latest explicit correction wins. Before revising, resolve the feedback into scope in this SAME response: list only dates with authorized changes, each with changeSessions containing the original zero-based session indices that may change. Do not list kept dates. A broad day change includes all original sessions; an empty changeSessions list only authorizes additions while preserving existing sessions. If Monday morning stays but Monday evening changes, include Monday with only the evening index; do not omit Monday just because its morning is kept. All other days/sessions must survive exactly, including focus, quantities and order. Each changed day needs evidence: a short exact substring of feedback or unresolved context.feedback supporting that permission, not a quote from the system or saved plan. Default to keeping work. Interpret intent rather than matching keywords: "keep Monday short by halving it" requests change, "do not leave Tuesday unchanged" requests change, and "keep Monday exactly unchanged and halve it" conflicts. Inherit unresolved scope on a clarification answer; a mention or praise never overrides a prior keep, but an explicit later correction can. If meaning conflicts or remains ambiguous, scope null, one clarification, no changed dates or work. Server checks enforce this interpretation; it is not a tool or second request. Return the strict review schema.`;
  const payload = JSON.parse(body.input);
  payload.preservation = reviewProtections(input.review, input.dates);
  body.input = JSON.stringify(payload);
  body.instructions +=
    '\nThe server independently enforces preservation derived from explicit athlete keeps. preservation lists locked dates, original session indices and original activity indices; it does not grant permission to edit anything else. Never use a keep quote as permission. If preservation.unresolved or the requested changes conflict with a lock, return the existing clarification shape instead of silently dropping the keep. For replace-X/keep-the-rest feedback, change only the named exercise work; all other protected prescriptions must remain exact, even inside an editable session.';
  body.text.format.schema = providerSchema(reviewSchema);
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized) > weeklyLimits.inputBytes)
    throw new OnboardingError(422, 'planning_context_limit');
  return {
    body: serialized,
    reserveMicro: provider.cost({
      input: Buffer.byteLength(serialized),
      output: weeklyLimits.outputTokens,
      cached: 0,
      cacheWrite: 0,
    }),
  };
}
export function checkReview(raw: unknown, input: PlanningInput): ReviewResult {
  if (!valid(raw) || !input.review) throw new OnboardingError(422, 'invalid_plan');
  const { review } = input,
    value = raw as Output;
  if (
    value.lastingPreference &&
    (!review.feedback.includes(value.lastingPreference) ||
      !/\b(from now on|going forward|future weeks|always)\b/i.test(value.lastingPreference))
  )
    throw new OnboardingError(422, 'invalid_feedback');
  if (value.lastingPreference && (input.preferences?.length ?? 0) >= 6)
    throw new OnboardingError(409, 'preference_limit');
  const checked = checkWeek(value.week, {
    ...input,
    outline: undefined,
    savedDays: undefined,
    draftReview: true,
  });
  if (checked.outline.clarification) {
    if (value.scope !== null || value.changedDates.length || value.lastingPreference)
      throw new OnboardingError(422, 'invalid_plan');
    return {
      week: null,
      reply: value.reply,
      question: checked.outline.clarification.question,
      lastingPreference: null,
    };
  }
  if (checked.outline.coverage.length) throw new OnboardingError(422, 'catalog_coverage');
  checkResolvedScope(value.scope, review, input.dates, checked.details, checked.outline);
  for (const date of input.dates) {
    const old = review.days.find((d) => d.date === date)!,
      next = checked.details.find((d) => d.date === date)!;
    const oldOutline = review.outline.days.find((d) => d.date === date)!,
      newOutline = checked.outline.days.find((d) => d.date === date)!;
    const changed =
      !isDeepStrictEqual(old.sessions, next.sessions) || !isDeepStrictEqual(oldOutline, newOutline);
    const work = (day: Detail) => day.sessions.map(({ estimatedMinutes, ...session }) => session);
    if (changed && isDeepStrictEqual(work(old), work(next)))
      throw new OnboardingError(422, 'invalid_plan');
    if (changed !== value.changedDates.includes(date))
      throw new OnboardingError(422, 'invalid_plan');
    // No catalog metadata is regenerated for untouched days during publication.
    if (!changed) checked.details[checked.details.indexOf(next)] = old;
  }
  if (value.changedDates.some((d) => !input.dates.includes(d)))
    throw new OnboardingError(422, 'invalid_plan');
  return {
    week: checked,
    reply: value.reply,
    question: null,
    lastingPreference: value.lastingPreference,
  };
}
