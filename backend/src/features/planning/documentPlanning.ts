import { athleteDataPolicy } from '../../ai/athleteDataPolicy.js';
import { progressRules, stableProgress } from '../weekly-planning/progressContext.js';
import { Ajv } from 'ajv';
import {
  documentPlanVersion,
  validSavedDocument,
  type NutritionDocumentPlan,
} from '../../shared/documentPlanContract.js';
import { intakeAnswers } from '../onboarding/fixedIntake.js';
import { OnboardingError } from '../onboarding/onboardingError.js';
import { CompleteValidationError } from './planDiagnostics.js';
import type { PlanningInput } from './planningDomain.js';
import type { OnboardingProvider } from '../../ai/onboardingProvider.js';
import { weeklyLimits } from './weeklyPlanning.js';
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
export const documentWireName = 'document_result_v1';
const nullableNumber = { anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] };
export const dailyNutritionSchema = object({
  version: { type: 'integer', enum: [1] },
  status: { type: 'string', enum: ['available', 'unavailable'] },
  caloriesKcal: nullableNumber,
  proteinGrams: nullableNumber,
  carbohydrateGrams: nullableNumber,
  fatGrams: nullableNumber,
  rationale: { anyOf: [text(600), { type: 'null' }] },
});
export const nutritionRequest =
  'I also want you to return an object with macronutrient targets based on my body profile and goals. These targets should be whatever levels would best help me achieve all my goals.';
export const documentSchema = object({
  nutrition: dailyNutritionSchema,
  days: {
    type: 'array',
    minItems: 7,
    maxItems: 7,
    items: object({
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      sessions: {
        type: 'array',
        maxItems: 12,
        items: object({
          title: text(160),
          goal: text(600),
          timing: { anyOf: [text(600), { type: 'null' }] },
          durationMinutes: object({
            min: { type: 'number', minimum: 1, maximum: 1440 },
            max: { type: 'number', minimum: 1, maximum: 1440 },
          }),
          optional: { type: 'boolean' },
          exercises: {
            type: 'array',
            minItems: 1,
            maxItems: 64,
            items: object({
              exercise: text(160),
              prescription: text(1800),
              loggingMode: { type: 'string', enum: ['weighted_reps', 'reps', 'completion'] },
            }),
          },
        }),
      },
    }),
  },
});
// Transport envelope only. Saved document versions and legacy readers are unchanged.
export const documentResultSchema = object({
  version: { type: 'integer', enum: [1] },
  result: {
    anyOf: [
      object({ kind: { type: 'string', enum: ['plan'] }, plan: documentSchema }),
      object({
        kind: { type: 'string', enum: ['unavailable'] },
        reason: { type: 'string', enum: ['out_of_scope', 'unable'] },
      }),
    ],
  },
});
type DocumentResult = {
  version: 1;
  result:
    | { kind: 'plan'; plan: NutritionDocumentPlan }
    | { kind: 'unavailable'; reason: 'out_of_scope' | 'unable' };
};
const validateResult = new Ajv({ strict: true }).compile<DocumentResult>(documentResultSchema);
export function checkDocumentResult(value: unknown, input: PlanningInput): NutritionDocumentPlan {
  if (!validateResult(value))
    throw new CompleteValidationError('invalid_document', { stage: 'schema', rule: 'shape' });
  if (value.result.kind === 'unavailable')
    throw new OnboardingError(
      422,
      value.result.reason === 'out_of_scope' ? 'plan_out_of_scope' : 'plan_unable',
    );
  return checkDocument(value.result.plan, input);
}
export const loggingInstruction =
  'For each exercise row, add loggingMode: weighted_reps for a prescription accurately logged with weight, sets and reps; reps for sets and reps without weight; completion for everything else or ambiguous/composite work. Choose from the actual prescription, not its name alone. This selects only the logging layout; keep activities and prescriptions unrestricted.';
const validate = new Ajv({ strict: true }).compile<NutritionDocumentPlan>(documentSchema);
export const documentCoachingInstructions =
  "I want you to build a plan for the week to help me achieve my goals. First give the high level plan, then after that, create a workout/exercise list for each session. For the high level plan, return a list with days of the week until Sunday, with each day's session(s) underneath it, the goal for each session and the rough time to complete the session.";
export const documentDisplayInstructions =
  "Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and ordered exercises. Rest days have empty session lists. Each exercise row has a free-text exercise name and a concise free-text prescription. Preserve essential sets, reps, load, time, distance, units, intervals, recovery, per-side/per-round meaning, effort and superset or mixed-work relationships as applicable. Keep essential execution and safety instructions in the relevant prescription. Use plain text, not Markdown, for rows. Do not repeat session goals or introductions in rows. Omit unrequested general weekly commentary; never attach a weekly approach to the first or any other session. Return only the provided display schema.";
export function documentPrompt(answers: string[], dates: string[]) {
  return `I want you to come up with a workout plan for me. My goals are: ${answers[0]}. My current activity is: ${answers[1]}. My available equipment is: ${answers[2]}. My training preferences are: ${answers[3]}. My limitations are: ${answers[4]}.

${documentCoachingInstructions}

The week is Monday, ${dates[0]}, through Sunday, ${dates[6]}, inclusive.

${documentDisplayInstructions}`;
}
export function prepareDocument(provider: OnboardingProvider, input: PlanningInput) {
  const answers = intakeAnswers(input.summary);
  if (!answers) throw new OnboardingError(409, 'summary_needs_correction');
  const p = input.profile;
  const fact = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const instructions = [
    athleteDataPolicy,
    documentCoachingInstructions,
    documentDisplayInstructions,
    'Return envelope version 1 with result.kind plan and the complete document in result.plan. If the request is unrelated to FitQuest training and supported nutrition, return result.kind unavailable with reason out_of_scope. If a suitable plan cannot be provided, use reason unable. Do not invent sessions or hide an unrelated answer in exercise text to satisfy the schema. These outcomes contain no free-text explanation.',
    'Use exactly the supplied Monday–Sunday dates in order. Gender is self-reported, not confirmed physiological data. Do not invent missing facts.',
    nutritionRequest,
    'Return daily estimated nutrition in the nutrition object: caloriesKcal in kcal, proteinGrams, carbohydrateGrams and fatGrams in grams; version 1. Use status available with values and at most a short rationale or assumptions. If suitable targets cannot be provided, use status unavailable, null nutrient values and a short reason. Do not force numeric advice.',
    loggingInstruction,
    ...(input.progress ? [progressRules] : []),
    ...(input.documentReview
      ? [
          'Revise the saved week according to the athlete feedback. Preserve the work they ask to keep and return the complete updated week.',
        ]
      : []),
  ].join('\n\n');
  const data = {
    answers: {
      goals: answers[0],
      currentActivity: answers[1],
      equipment: answers[2],
      preferences: answers[3],
      limitations: answers[4],
    },
    dates: input.dates,
    profile: {
      age: fact(p.age),
      heightInches: fact(p.heightInches),
      weightLb: fact(p.weightLb),
      gender: p.gender || null,
    },
    ...(input.progress ? { progress: input.progress } : {}),
    ...(input.documentReview ? { review: input.documentReview } : {}),
  };
  const body = JSON.stringify({
    model: provider.model,
    store: false,
    stream: false,
    truncation: 'disabled',
    service_tier: 'default',
    reasoning: { effort: 'low' },
    max_output_tokens: weeklyLimits.outputTokens,
    instructions,
    input: stableProgress(data),
    text: {
      format: {
        type: 'json_schema',
        name: documentWireName,
        strict: true,
        schema: documentResultSchema,
      },
    },
  });
  if (Buffer.byteLength(body) > weeklyLimits.inputBytes)
    throw new OnboardingError(422, 'planning_context_limit');
  return {
    body,
    reserveMicro: provider.cost({
      input: Buffer.byteLength(body),
      output: weeklyLimits.outputTokens,
      cached: 0,
      cacheWrite: 0,
    }),
  };
}
export function checkDocument(value: unknown, input: PlanningInput): NutritionDocumentPlan {
  if (!validate(value))
    throw new CompleteValidationError('invalid_document', { stage: 'schema', rule: 'shape' });
  if (!validSavedDocument(value, input.dates, documentPlanVersion))
    throw new CompleteValidationError('invalid_document', { stage: 'structure', rule: 'overview' });
  if (Buffer.byteLength(JSON.stringify(value)) > weeklyLimits.responseBytes)
    throw new CompleteValidationError('invalid_document', { stage: 'integrity', rule: 'size' });
  return value;
}
export { documentPlanVersion };
