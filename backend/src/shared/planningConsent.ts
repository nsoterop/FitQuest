// Shared disclosure; permission is stored and checked by the server, never inferred from intake.
export const planningConsentVersion = 'openai-workout-nutrition-v1' as const;
export const planningConsentScope = 'weekly-workout-nutrition-profile' as const;
export type PlanningConsent = {
  version: typeof planningConsentVersion;
  scope: typeof planningConsentScope;
  granted: boolean;
  revision: number;
  updatedAt: string;
};
export const planningDisclosure =
  'Share your saved age, height, weight and self-reported gender, plus intake answers (goals, activity, equipment, preferences, limitations) and revision feedback, with OpenAI for workouts and nutrition estimates? No account name, email or IDs are sent; avoid identifying details in answers. Gender is not confirmed physiology. Targets are estimates, not medical advice. API data is not used for training by default. Abuse logs may retain content for up to 30 days, or longer for legal/safety reasons; our organization controls are unverified. You can decline or withdraw here before future requests; data already sent is unaffected. Saved plans and manual food logging stay available.';
export const planningPolicyUrl = 'https://developers.openai.com/api/docs/guides/your-data';
export function validPlanningConsent(v: unknown): v is PlanningConsent {
  const c = v as PlanningConsent;
  return (
    !!c &&
    typeof c === 'object' &&
    Object.keys(c).length === 5 &&
    c.version === planningConsentVersion &&
    c.scope === planningConsentScope &&
    typeof c.granted === 'boolean' &&
    Number.isSafeInteger(c.revision) &&
    c.revision > 0 &&
    typeof c.updatedAt === 'string' &&
    Number.isFinite(Date.parse(c.updatedAt))
  );
}
export const hasPlanningConsent = (v: unknown): v is PlanningConsent & { granted: true } =>
  validPlanningConsent(v) && v.granted;
