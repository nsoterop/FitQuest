export const historyConsentVersion = 'openai-progress-v1' as const;
export const historyConsentScope = 'weekly-workout-weight-history' as const;
export const recurringHistoryConsentVersion = 'openai-progress-recurring-v2' as const;
export const recurringHistoryConsentScope = 'sunday-21-workout-weight-history' as const;
export type HistoryConsent = {
  version: typeof historyConsentVersion | typeof recurringHistoryConsentVersion;
  scope: typeof historyConsentScope | typeof recurringHistoryConsentScope;
  granted: boolean;
  revision: number;
  updatedAt: string;
};
export function validHistoryConsent(v: unknown): v is HistoryConsent {
  const c = v as HistoryConsent;
  return (
    !!c &&
    Object.keys(c).length === 5 &&
    ((c.version === historyConsentVersion && c.scope === historyConsentScope) ||
      (c.version === recurringHistoryConsentVersion && c.scope === recurringHistoryConsentScope)) &&
    typeof c.granted === 'boolean' &&
    Number.isSafeInteger(c.revision) &&
    c.revision > 0 &&
    typeof c.updatedAt === 'string' &&
    Number.isFinite(Date.parse(c.updatedAt))
  );
}
export const hasHistoryConsent = (v: unknown) => validHistoryConsent(v) && v.granted;
export const hasRecurringHistoryConsent = (v: unknown) =>
  validHistoryConsent(v) && v.granted && v.version === recurringHistoryConsentVersion;
export const historyDisclosure =
  'Allow OpenAI to use your saved workout results and session notes (including health or pain feedback), body-weight measurements/history, original goals/intake, body profile and next-week changes to create upcoming workouts and nutrition estimates? Missing results remain unknown. No account name, email or record IDs are sent. You can decline or withdraw before future requests; your logs and accepted plans remain available. Data already sent is unaffected. The same OpenAI retention terms shown for profile sharing apply.';
