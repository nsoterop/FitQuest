// Shared decision rule for onboarding and planning. Uncertainty alone is not a blocker.
export const planningReadinessInstructions = `A planning blocker is a missing answer that changes whether any suitable catalog-backed plan can be offered. Known restrictions, adequately described mild discomfort, no limitations reported, general uncertainty disclaimers, unverified inference and optional unknowns are NOT blockers. Use already supplied answers and conservative suitable choices; do not require clearance, diagnoses or exhaustive screening. Ask only a specific indispensable unanswered question, explaining the decision it changes. Honor skips and requests to stop. If an indispensable answer is declined, explain the specific constraint and allow leaving; never repeat the question or claim a usable plan is ready. Preserve the actual restriction and any relevant clarification in the compact summary, retaining reported/inferred/unknown distinctions.`;
export type PlanningCheck = {
  status: 'ready' | 'question' | 'unavailable';
  question: string | null;
  reason: string | null;
};
const text = { type: 'string', minLength: 8, maxLength: 350, pattern: '\\S' };
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
export const planningCheckSchema = {
  anyOf: [
    object({
      status: { type: 'string', enum: ['ready'] },
      question: { type: 'null' },
      reason: { type: 'null' },
    }),
    object({ status: { type: 'string', enum: ['question'] }, question: text, reason: text }),
    object({
      status: { type: 'string', enum: ['unavailable'] },
      question: { type: 'null' },
      reason: text,
    }),
  ],
};
export const clarificationSchema = object({ question: text, reason: text });
export type Clarification = { question: string; reason: string };
export const informationCoverage = (coverage: string[]) =>
  coverage.some((code) => code !== 'missing_catalog_coverage');
