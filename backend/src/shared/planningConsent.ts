// Shared disclosure; permission is stored and checked by the server, never inferred from intake.
export const planningConsentVersion = 'openai-workout-nutrition-v1' as const;
export const planningConsentScope = 'weekly-workout-nutrition-profile' as const;
export const recurringConsentVersion = 'openai-recurring-week-v2' as const;
export const recurringConsentScope = 'profile-history-sunday-21-planning' as const;
export type PlanningConsent = {
  version: typeof planningConsentVersion | typeof recurringConsentVersion;
  scope: typeof planningConsentScope | typeof recurringConsentScope;
  granted: boolean;
  revision: number;
  updatedAt: string;
};
export const planningDisclosure =
  'Share your saved age, height, weight and self-reported gender, plus intake answers (goals, activity, equipment, preferences, limitations) and revision feedback, with OpenAI for workouts and nutrition estimates? No account name, email or IDs are sent; avoid identifying details in answers. Gender is not confirmed physiology. Targets are estimates, not medical advice. API data is not used for training by default. Abuse logs may retain content for up to 30 days, or longer for legal/safety reasons; our organization controls are unverified. You can decline or withdraw here before future requests; data already sent is unaffected. Saved plans and manual food logging stay available.';
export const recurringDisclosure =
  planningDisclosure +
  ' This also permits ongoing use of your actual workout results, session notes (including health or pain feedback), body-weight history and saved intake/profile. After you accept your first plan, OpenAI will prepare one upcoming Monday–Sunday draft each Sunday at 9 PM in your saved timezone, even when the app is closed, within the existing AI allowance. Review and accept each new week. Missing logs remain unknown; uncertain or failed requests are not automatically retried. Withdraw in Account → Sharing permission to stop future dispatch; a request already sent may finish. A previously explicit scheduling pause stays paused.';
export const planningPolicyUrl = 'https://developers.openai.com/api/docs/guides/your-data';
export function validPlanningConsent(v: unknown): v is PlanningConsent {
  const c = v as PlanningConsent;
  return (
    !!c &&
    typeof c === 'object' &&
    Object.keys(c).length === 5 &&
    ((c.version === planningConsentVersion && c.scope === planningConsentScope) ||
      (c.version === recurringConsentVersion && c.scope === recurringConsentScope)) &&
    typeof c.granted === 'boolean' &&
    Number.isSafeInteger(c.revision) &&
    c.revision > 0 &&
    typeof c.updatedAt === 'string' &&
    Number.isFinite(Date.parse(c.updatedAt))
  );
}
export const hasPlanningConsent = (v: unknown): v is PlanningConsent & { granted: true } =>
  validPlanningConsent(v) && v.granted;
export const hasRecurringPlanningConsent = (v: unknown) =>
  hasPlanningConsent(v) && v.version === recurringConsentVersion;
