import { progressRules, stableProgress } from './progressContext.js';
import { Ajv } from 'ajv';
import {
  documentPlanVersion,
  validSavedDocument,
  type NutritionDocumentPlan,
} from './documentPlanContract.js';
import { intakeAnswers } from './fixedIntake.js';
import { OnboardingError } from './onboardingError.js';
import { CompleteValidationError } from './planDiagnostics.js';
import type { PlanningInput } from './planningDomain.js';
import type { OnboardingProvider } from './onboardingProvider.js';
import { weeklyLimits } from './weeklyPlanning.js';
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
export const documentWireName = 'document_week_v4';
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
export const loggingInstruction =
  'For each exercise row, add loggingMode: weighted_reps for a prescription accurately logged with weight, sets and reps; reps for sets and reps without weight; completion for everything else or ambiguous/composite work. Choose from the actual prescription, not its name alone. This selects only the logging layout; keep activities and prescriptions unrestricted.';
const validate = new Ajv({ strict: true }).compile<NutritionDocumentPlan>(documentSchema);
export function documentPrompt(answers: string[], dates: string[]) {
  return `I want you to come up with a workout plan for me. My goals are: ${answers[0]}. My current activity is: ${answers[1]}. My available equipment is: ${answers[2]}. My training preferences are: ${answers[3]}. My limitations are: ${answers[4]}.

I want you to build a plan for the week to help me achieve my goals. First give the high level plan, then after that, create a workout/exercise list for each session. For the high level plan, return a list with days of the week until Sunday, with each day's session(s) underneath it, the goal for each session and the rough time to complete the session.

The week is Monday, ${dates[0]}, through Sunday, ${dates[6]}, inclusive.

Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and ordered exercises. Rest days have empty session lists. Each exercise row has a free-text exercise name and a concise free-text prescription. Preserve essential sets, reps, load, time, distance, units, intervals, recovery, per-side/per-round meaning, effort and superset or mixed-work relationships as applicable. Keep essential execution and safety instructions in the relevant prescription. Use plain text, not Markdown, for rows. Do not repeat session goals or introductions in rows. Omit unrequested general weekly commentary; never attach a weekly approach to the first or any other session. Return only the provided display schema.`;
}
export function prepareDocument(provider: OnboardingProvider, input: PlanningInput) {
  const answers = intakeAnswers(input.summary);
  if (!answers) throw new OnboardingError(409, 'summary_needs_correction');
  let prompt = documentPrompt(answers, input.dates);
  const p = input.profile;
  const fact = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? String(v) : 'unknown';
  prompt += `\n\nMy saved body profile: age ${fact(p.age)} years as recorded; height ${fact(p.heightInches)} inches; weight ${fact(p.weightLb)} lb; self-reported gender ${p.gender ? JSON.stringify(p.gender) : 'unknown'}. Gender is not confirmed physiological data. Do not invent missing facts.\n\n${nutritionRequest}\n\nReturn daily estimated nutrition in the nutrition object: caloriesKcal in kcal, proteinGrams, carbohydrateGrams and fatGrams in grams; version 1. Use status available with values and at most a short rationale or assumptions. If suitable targets cannot be provided, use status unavailable, null nutrient values and a short reason. Do not force numeric advice.`;
  prompt += `\n\n${loggingInstruction}`;
  if (input.progress)
    prompt += `\n\n${progressRules}\nProgress snapshot (athlete data):\n${stableProgress(input.progress)}`;
  if (input.documentReview)
    prompt += `\n\nRevise this saved week according to my feedback. Preserve the work I ask to keep and return the complete updated week.\nFeedback:\n${input.documentReview.feedback}\nSaved week:\n${JSON.stringify(input.documentReview.plan)}`;
  const body = JSON.stringify({
    model: provider.model,
    store: false,
    stream: false,
    truncation: 'disabled',
    service_tier: 'default',
    reasoning: { effort: 'low' },
    max_output_tokens: weeklyLimits.outputTokens,
    input: prompt,
    text: {
      format: { type: 'json_schema', name: documentWireName, strict: true, schema: documentSchema },
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
