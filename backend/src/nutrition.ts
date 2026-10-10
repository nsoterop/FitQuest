import { Ajv } from 'ajv';
import { isDeepStrictEqual } from 'node:util';
import { OnboardingError } from './onboardingError.js';
import type { PlanningInput } from './planningDomain.js';

// Inputs are volunteered/confirmed reports, never inferred from profile gender.
export type NutritionInput = {
  equationSex: 'male' | 'female' | null;
  weightIntent: 'maintain' | 'lose' | 'gain' | null;
  safety: 'general' | 'sensitive' | 'unknown';
};
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const nullable = (schema: unknown) => ({ anyOf: [{ type: 'null' }, schema] });
export const nutritionInputSchema = nullable(
  object({
    equationSex: nullable({ type: 'string', enum: ['male', 'female'] }),
    weightIntent: nullable({ type: 'string', enum: ['maintain', 'lose', 'gain'] }),
    safety: { type: 'string', enum: ['general', 'sensitive', 'unknown'] },
  }),
);
export type NutritionReport = { text: string; inputs: NutritionInput };
export type NutritionProposal = {
  inputReport?: NutritionReport | null;
  status: 'estimate' | 'deferred';
  activityFactor: number | null;
  proteinPerKg: number | null;
  fatPercent: number | null;
  adjustmentPercent: number | null;
  rationale: string;
  reason: string | null;
};
const nutritionProposalBase = object({
  status: { type: 'string', enum: ['estimate', 'deferred'] },
  activityFactor: nullable({ type: 'number', minimum: 1.4, maximum: 2.2 }),
  proteinPerKg: nullable({ type: 'number', minimum: 1.2, maximum: 2 }),
  fatPercent: nullable({ type: 'number', minimum: 20, maximum: 35 }),
  adjustmentPercent: nullable({ type: 'number', minimum: -10, maximum: 5 }),
  rationale: { type: 'string', minLength: 8, maxLength: 250 },
  reason: nullable({ type: 'string', minLength: 8, maxLength: 250 }),
});
export const nutritionProposalSchema = {
  ...nutritionProposalBase,
  properties: {
    ...nutritionProposalBase.properties,
    inputReport: nullable(
      object({
        text: { type: 'string', minLength: 3, maxLength: 350 },
        inputs: nutritionInputSchema.anyOf[1],
      }),
    ),
  },
};
export type Nutrition = {
  reportedContext?: NutritionInput;
  status: 'estimate' | 'deferred';
  calories: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
  rationale: string;
  assumptions: string;
  reason: string | null;
  basis: 'mifflin-st-jeor-v1' | null;
  proposal: NutritionProposal | null;
};
const valid = new Ajv().compile<NutritionProposal>(nutritionProposalSchema);
export const nutritionInstructions = `Include daily nutrition as a starting estimate, not a precise requirement. Use known nutritionInput only; never infer equation sex from gender or weight loss from appearance goals. Choose activityFactor (1.4–2.2) from ordinary daily activity plus this plan's actual workload, proteinPerKg (1.2–2.0), fatPercent (20–35), and adjustmentPercent (maintenance 0; explicit loss -10–0; gain 0–5). The server calculates calories and grams. Briefly explain the goal/training basis and activity assumption. Defer with null numeric inputs and a specific reason for missing/declined inputs, pregnancy/breastfeeding, eating-disorder concerns, medical/treatment diets or other unsuitable context. Nutrition uncertainty must not remove useful training. Review may capture new explicit inputs in inputReport: one exact athlete feedback excerpt plus supported inputs; otherwise null. Reuse earlier reported inputs. No meal plans, supplements or medical clearance.`;
function defer(reason: string): Nutrition {
  return {
    status: 'deferred',
    calories: null,
    proteinGrams: null,
    carbohydrateGrams: null,
    fatGrams: null,
    rationale: 'Training can continue while nutrition targets are deferred.',
    assumptions: 'No automated dietary targets assigned.',
    reason,
    basis: null,
    proposal: null,
  };
}
export function nutritionContext(input: PlanningInput): NutritionInput | undefined {
  const facts = input.summary.filter(
    (f) => f.category === 'nutrition' && f.origin === 'user_report' && f.nutritionInput,
  );
  if (!facts.length) return;
  const unique = <T>(values: T[]) => [...new Set(values)];
  const sex = unique(
    facts.flatMap((f) => (f.nutritionInput!.equationSex ? [f.nutritionInput!.equationSex] : [])),
  );
  const intent = unique(
    facts.flatMap((f) => (f.nutritionInput!.weightIntent ? [f.nutritionInput!.weightIntent] : [])),
  );
  const safety = unique(
    facts.flatMap((f) =>
      f.nutritionInput!.safety !== 'unknown' ? [f.nutritionInput!.safety] : [],
    ),
  );
  if (sex.length > 1 || intent.length > 1) return;
  return {
    equationSex: sex[0] ?? null,
    weightIntent: intent[0] ?? null,
    safety: safety.includes('sensitive') ? 'sensitive' : (safety[0] ?? 'unknown'),
  };
}
export function checkNutrition(raw: unknown, input: PlanningInput): Nutrition {
  if (raw === undefined)
    return defer(
      'Nutrition inputs have not been captured. Review nutrition when you want an estimate.',
    );
  if (!valid(raw)) throw new OnboardingError(422, 'invalid_nutrition');
  const savedContext = input.review?.outline.nutrition?.reportedContext;
  let context = savedContext ?? nutritionContext(input);
  if (raw.inputReport) {
    if (
      !isDeepStrictEqual(raw.inputReport, input.review?.outline.nutrition?.proposal?.inputReport)
    ) {
      const sources = [input.review?.feedback, input.review?.context?.feedback].filter(
        (x): x is string => typeof x === 'string',
      );
      if (!sources.some((s) => s.includes(raw.inputReport!.text)))
        throw new OnboardingError(422, 'invalid_nutrition');
    }
    const reported = raw.inputReport.inputs;
    context = {
      equationSex: reported.equationSex ?? context?.equationSex ?? null,
      weightIntent: reported.weightIntent ?? context?.weightIntent ?? null,
      safety:
        context?.safety === 'sensitive'
          ? 'sensitive'
          : reported.safety === 'unknown'
            ? (context?.safety ?? 'unknown')
            : reported.safety,
    };
  }
  const deferred = (reason: string): Nutrition => ({
    ...defer(reason),
    ...(context ? { reportedContext: context } : {}),
    proposal: raw,
  });
  if (raw.status === 'deferred') {
    if (
      !raw.reason ||
      [raw.activityFactor, raw.proteinPerKg, raw.fatPercent, raw.adjustmentPercent].some(
        (x) => x !== null,
      )
    )
      throw new OnboardingError(422, 'invalid_nutrition');
    return { ...deferred(raw.reason), rationale: raw.rationale };
  }
  if (!context?.equationSex || !context.weightIntent)
    return deferred(
      'A reported sex input for the energy equation and your weight intention are needed. Neither is inferred from gender or appearance goals.',
    );
  if (context.safety !== 'general')
    return deferred(
      'Automated targets are deferred until nutrition suitability is clear; sensitive circumstances need individual professional guidance.',
    );
  const { age, heightInches, weightLb } = input.profile,
    kg = weightLb * 0.45359237,
    cm = heightInches * 2.54,
    bmi = kg / (cm / 100) ** 2;
  // Product boundaries, not diagnostic thresholds or a claim of medical clearance.
  if (
    ![age, kg, cm].every(Number.isFinite) ||
    age < 19 ||
    age > 78 ||
    cm < 120 ||
    cm > 230 ||
    kg < 35 ||
    kg > 250 ||
    bmi < 18.5
  )
    return deferred(
      'Your age or measurements fall outside this general adult estimation scope. Individual nutrition guidance is more appropriate.',
    );
  if (
    raw.reason !== null ||
    [raw.activityFactor, raw.proteinPerKg, raw.fatPercent, raw.adjustmentPercent].some(
      (x) => x === null,
    )
  )
    throw new OnboardingError(422, 'invalid_nutrition');
  const { activityFactor, proteinPerKg, fatPercent, adjustmentPercent } =
    raw as NutritionProposal & {
      activityFactor: number;
      proteinPerKg: number;
      fatPercent: number;
      adjustmentPercent: number;
    };
  if (
    (context.weightIntent === 'maintain' && adjustmentPercent !== 0) ||
    (context.weightIntent === 'lose' && adjustmentPercent > 0) ||
    (context.weightIntent === 'gain' && adjustmentPercent < 0)
  )
    throw new OnboardingError(422, 'invalid_nutrition');
  const resting = 10 * kg + 6.25 * cm - 5 * age + (context.equationSex === 'male' ? 5 : -161),
    maintenance = resting * activityFactor;
  const calories = Math.round((maintenance * (1 + adjustmentPercent / 100)) / 50) * 50;
  if (calories < Math.max(1500, resting) || calories > 5000 || maintenance - calories > 500)
    return deferred(
      'This estimate falls outside the conservative automated range. Review energy needs with a qualified nutrition professional.',
    );
  const proteinGrams = Math.round(kg * proteinPerKg),
    fatGrams = Math.round((calories * fatPercent) / 100 / 9),
    carbohydrateGrams = Math.round((calories - 4 * proteinGrams - 9 * fatGrams) / 4);
  if (
    carbohydrateGrams < 130 ||
    carbohydrateGrams / kg > 10 ||
    Math.abs(4 * proteinGrams + 4 * carbohydrateGrams + 9 * fatGrams - calories) > 5
  )
    throw new OnboardingError(422, 'invalid_nutrition');
  return {
    reportedContext: context,
    status: 'estimate',
    calories,
    proteinGrams,
    carbohydrateGrams,
    fatGrams,
    basis: 'mifflin-st-jeor-v1',
    reason: null,
    proposal: raw,
    rationale: raw.rationale,
    assumptions: `Starting estimate: Mifflin–St Jeor with reported ${context.equationSex} input; activity factor ${activityFactor}, ${adjustmentPercent}% from estimated maintenance. Daily average for these dates; adjust with observed needs.`,
  };
}
// A displayed deferral supplies the conversational topic. A fresh exact report
// may fill missing fields without requiring the athlete to repeat that topic.
function fillsMissingNutrition(next: Nutrition, input: PlanningInput, prior: Nutrition): boolean {
  const report = next.proposal?.inputReport;
  if (
    prior.status !== 'deferred' ||
    !report ||
    !input.review?.feedback.includes(report.text) ||
    isDeepStrictEqual(report, prior.proposal?.inputReport)
  )
    return false;
  const old = prior.reportedContext ?? nutritionContext(input),
    known = old ?? { equationSex: null, weightIntent: null, safety: 'unknown' };
  const words = report.text.toLowerCase();
  let filled = false;
  for (const key of ['equationSex', 'weightIntent', 'safety'] as const) {
    const value = report.inputs[key];
    if (value === null || value === 'unknown') continue;
    if (known[key] !== null && known[key] !== 'unknown') {
      if (value !== known[key]) return false;
      continue;
    }
    // Validate the short answer against the field being filled. A quote alone
    // does not justify invented physiology or an unrelated training instruction.
    const supported =
      key === 'equationSex'
        ? !/\b(?:gender|friend|partner|coach)\b/i.test(words) &&
          new RegExp(`\\b${value}\\b`, 'i').test(words)
        : key === 'weightIntent'
          ? value === 'maintain'
            ? /\b(?:maintain|maintenance|keep (?:my )?(?:current )?weight)(?:[.,;!]|$|\s+(?:my\s+)?(?:current\s+)?weight\b)/i.test(
                words,
              )
            : new RegExp(`\\b${value}(?:[.,;!]|$|\\s+(?:some\\s+)?weight\\b)`, 'i').test(words)
          : value === 'general'
            ? /\b(?:no special (?:dietary |nutrition )?(?:circumstances|needs|requirements)|ordinary dietary needs)\b/i.test(
                words,
              )
            : /\b(?:pregnan|breastfeed|eating disorder|medical diet|treatment diet)/i.test(words);
    if (!supported) return false;
    filled = true;
  }
  return filled;
}
// An unrelated training edit must not silently replace reviewed nutrition. Model
// evidence is an exact athlete quote; it grants nutrition changes, not training changes.
export function preserveNutrition(
  next: Nutrition,
  input: PlanningInput,
  evidence: unknown,
): Nutrition {
  const prior = input.review?.outline.nutrition;
  if (!prior) return next;
  const recovery = fillsMissingNutrition(next, input, prior);
  if ((evidence === null || evidence === undefined) && !recovery) return prior;
  const text = [input.review!.feedback, input.review!.context?.feedback ?? ''].join('\n');
  if (
    evidence != null &&
    (typeof evidence !== 'string' ||
      evidence.length < 3 ||
      evidence.length > 250 ||
      !text.includes(evidence) ||
      (!recovery &&
        !/(nutrition|calori|macro|protein|carb|fat|diet|energy|weight)/i.test(evidence)))
  )
    throw new OnboardingError(422, 'invalid_nutrition');
  // Explicit keeps are independently binding even if a response quotes them
  // as change permission. Keep individual macros while allowing other edits.
  const targets: [string, (keyof Nutrition)[]][] = [
    [
      'nutrition|macros?|diet|targets?',
      ['calories', 'proteinGrams', 'carbohydrateGrams', 'fatGrams', 'reportedContext'],
    ],
    ['calories|energy', ['calories']],
    ['protein', ['proteinGrams']],
    ['carbs?|carbohydrates?', ['carbohydrateGrams']],
    ['fat', ['fatGrams']],
  ];
  for (const [name, fields] of targets) {
    const keep = new RegExp(
      `\\b(?:keep|leave)\\s+(?:(?:my|the|all|daily)\\s+)*(?:${name})\\s+(?:exactly\\s+)?(?:unchanged|the same)|\\b(?:do not|don't)\\s+change\\s+(?:(?:my|the|daily)\\s+)*(?:${name})\\b`,
      'i',
    );
    if (keep.test(text) && fields.some((key) => !isDeepStrictEqual(next[key], prior[key])))
      throw new OnboardingError(422, 'saved_nutrition_changed');
  }
  return isDeepStrictEqual(next, prior) ? prior : next;
}
