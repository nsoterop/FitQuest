import { createHash } from 'node:crypto';

export const limits = { message: 4000, items: 80, contextBytes: 32000, inputBytes: 24000, output: 2000, turns: 100, operations: 240, deadlineMs: 35000 };
export const disclosureVersion = 'onboarding-adults-v1';
export const opening = 'What would you like to improve, and what would progress look like for you? You can skip anything or review your understanding at any time.';
export const disclosure = 'AI conversation is not activated yet. When enabled, relevant profile facts, messages and your evolving understanding will be sent to OpenAI. FitQuest keeps this conversation and its revisions until you delete them. Deletion leaves your profile and account intact. Provider retention and infrastructure backups are separate; store:false does not mean zero retention. AI onboarding is for adults 18 and older; account and profile access remain available to others. No training plan or medical clearance is produced.';

export type Item = { id: string; topic: string; value: string; origin: 'profile' | 'user_report' | 'model_inference' | 'assumption' | 'unknown';
  review: 'unreviewed' | 'confirmed' | 'disputed'; source: string; quote: string; supersedes: string | null; recordedAt: string };
export type Context = { items: Item[]; skipped: string[]; readiness: 'needs_clarification' | 'ready_with_limits' | 'ready'; limitations: string[] };
export const emptyContext = (): Context => ({ items: [], skipped: [], readiness: 'needs_clarification', limitations: ['This understanding is based on reports, not independent verification or medical clearance.'] });
export type Command = { operationId: string; expectedRevision: number } & (
  { kind: 'message'; text: string } | { kind: 'retry'; turnId: string } |
  { kind: 'skip'; topic: string } | { kind: 'edit'; itemId: string | null; topic: string; value: string } |
  { kind: 'confirm'; reviewedRevision: number });
export class OnboardingError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Idempotency excludes the optimistic revision: an identical operation survives a lost response.
export const commandDigest = ({ expectedRevision: _revision, ...payload }: Command) => digest(payload);
export function bounded(context: Context): Context {
  if (context.items.length > limits.items || Buffer.byteLength(JSON.stringify(context)) > limits.contextBytes || context.skipped.length > 30) {
    throw new OnboardingError(422, 'context_limit');
  }
  return context;
}
export type ModelProposal = { reply: string; additions: { topic: string; value: string; origin: 'user_report' | 'model_inference' | 'assumption' | 'unknown'; source: string; quote: string }[];
  nextQuestion: { topic: string; text: string; decision: string } | null;
  readiness: Context['readiness']; limitations: string[] };
export const proposalSchema = {
  type: 'object', additionalProperties: false, required: ['reply', 'additions', 'nextQuestion', 'readiness', 'limitations'],
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 2400, pattern: '\\S' },
    additions: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false,
      required: ['topic', 'value', 'origin', 'source', 'quote'], properties: {
        topic: { type: 'string', minLength: 1, maxLength: 80 }, value: { type: 'string', minLength: 1, maxLength: 1000 },
        origin: { type: 'string', enum: ['user_report', 'model_inference', 'assumption', 'unknown'] },
        source: { type: 'string', maxLength: 20 }, quote: { type: 'string', maxLength: 1000 },
      } } },
    nextQuestion: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['topic', 'text', 'decision'],
      properties: { topic: { type: 'string', minLength: 1, maxLength: 80 }, text: { type: 'string', minLength: 1, maxLength: 500 }, decision: { type: 'string', minLength: 1, maxLength: 300 } } }] },
    readiness: { type: 'string', enum: ['needs_clarification', 'ready_with_limits', 'ready'] },
    limitations: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 300 } },
  },
} as const;

export type ModelInput = { context: Context; sources: Record<string, string>; recent: { role: 'user' | 'assistant'; text: string; source?: string }[]; knownProfileFields: string[] };
export function applyProposal(context: Context, proposal: ModelProposal, sources: Record<string, string>, now: string): Context {
  const next = structuredClone(context);
  const seen = new Set(next.items.map(x => `${x.origin}:${x.value}:${x.source}`));
  for (const proposed of proposal.additions) {
    const sourceText = sources[proposed.source];
    if (!sourceText || !proposed.quote || !sourceText.includes(proposed.quote)) throw new OnboardingError(422, 'invalid_evidence');
    // A model's paraphrase must never become an athlete's factual wording. For a report,
    // retain the verified original quote instead. Declared inferences stay inferences.
    const item = proposed.origin === 'user_report' && !proposed.quote.includes(proposed.value)
      ? { ...proposed, value: proposed.quote } : proposed;
    const key = `${item.origin}:${item.value}:${item.source}`;
    if (!seen.has(key)) next.items.push({ ...item, id: `i${next.items.length + 1}`, review: 'unreviewed', supersedes: null, recordedAt: now });
    seen.add(key);
  }
  if (proposal.nextQuestion && (next.skipped.some(x => x.toLowerCase() === proposal.nextQuestion!.topic.toLowerCase()) ||
      ['first name', 'last name', 'height', 'age', 'weight', 'gender'].includes(proposal.nextQuestion.topic.toLowerCase()))) {
    throw new OnboardingError(422, 'repeated_known_topic');
  }
  // Readiness never hides recorded uncertainty; it never gates confirmation.
  next.readiness = proposal.readiness;
  next.limitations = [...new Set([...next.limitations, ...proposal.limitations])];
  if (next.items.some(x => x.origin === 'unknown' || x.review === 'disputed') && next.readiness === 'ready') next.readiness = 'ready_with_limits';
  return bounded(next);
}
