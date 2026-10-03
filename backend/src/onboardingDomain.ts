import { OnboardingError } from './onboardingError.js';
import { checkedSummary, summarySchema, type TrainingSummary } from './trainingSummary.js';
import { createHash } from 'node:crypto';

export const limits = { message: 4000, items: 80, contextBytes: 32000, inputBytes: 24000, output: 2000, turns: 100, operations: 240, deadlineMs: 35000 };
export const disclosureVersion = 'onboarding-planning-v2';
export const opening = 'What would you like to improve, and what would progress look like for you?';
export const disclosure = 'AI onboarding is for adults 18+. Relevant profile information, messages and conversation context are shared with OpenAI. Unfinished conversations stay until you finish or delete them. After explicit completion, a concise editable training summary and plans stay private in FitQuest; the transcript and conversation revisions are deleted. Summary and relevant profile facts are sent to OpenAI for catalog-based planning. Provider retention and backups are separate. This is not medical clearance.';
export const recapTopic = 'Onboarding recap';
export const completeTopic = 'Onboarding complete';
export const recapQuestion = 'Does that capture what matters? Reply “Looks good” to finish onboarding, keep a concise editable training summary for planning and delete this conversation, or tell me what to change or add.';
export const completionPendingReply = 'Onboarding complete. Removing this conversation…';
export const completionReply = 'Onboarding finished. Your training summary is saved for planning. The conversation is deleted. Your profile is unchanged.';
// Agreement applies only to the immediately preceding, displayed recap. Added details,
// corrections, ordinary summary requests and model readiness alone never complete onboarding.
export function acceptsRecap(previous: { state: string; questionTopic: string | null } | undefined, text: string) {
  return previous?.state === 'completed' && previous.questionTopic === recapTopic &&
    /^(looks good|yes|yes,? looks good|that[’']?s right|that is right)[.!]?$/i.test(text.trim());
}


export type Item = { id: string; topic: string; value: string; origin: 'profile' | 'user_report' | 'model_inference' | 'assumption' | 'unknown';
  review: 'unreviewed' | 'confirmed' | 'disputed'; source: string; quote: string; supersedes: string | null; recordedAt: string };
export type Context = { trainingSummary?:TrainingSummary; items: Item[]; skipped: string[]; readiness: 'needs_clarification' | 'ready_with_limits' | 'ready'; limitations: string[] };
export const emptyContext = (): Context => ({ items: [], skipped: [], readiness: 'needs_clarification', limitations: ['This understanding is based on reports, not independent verification or medical clearance.'] });
export type Command = { operationId: string; expectedRevision: number; timeZone?:string } & (
  { kind: 'message'; text: string } | { kind: 'retry'; turnId: string } |
  { kind: 'skip'; topic: string } | { kind: 'edit'; itemId: string | null; topic: string; value: string } |
  { kind: 'confirm'; reviewedRevision: number });
export { OnboardingError } from './onboardingError.js';
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Idempotency excludes the optimistic revision: an identical operation survives a lost response.
export const commandDigest = ({ expectedRevision: _revision, ...payload }: Command) => digest(payload);
export function bounded(context: Context): Context {
  if (context.items.length > limits.items || Buffer.byteLength(JSON.stringify(context)) > limits.contextBytes || context.skipped.length > 30) {
    throw new OnboardingError(422, 'context_limit');
  }
  return context;
}
export type ModelProposal = { trainingSummary?:TrainingSummary|null; reply: string; additions: { topic: string; value: string; origin: 'user_report' | 'model_inference' | 'assumption' | 'unknown'; source: string; quote: string }[];
  nextQuestion: { topic: string; text: string; decision: string } | null;
  readiness: Context['readiness']; limitations: string[] };
export const proposalSchema = {
  type: 'object', additionalProperties: false, required: ['reply', 'additions', 'nextQuestion', 'readiness', 'limitations', 'trainingSummary'],
  properties: {
    trainingSummary: {anyOf:[{type:'null'},summarySchema]},
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
  if(proposal.trainingSummary) {
    const summary=checkedSummary(proposal.trainingSummary);
    if(summary.some(f=>f.origin==='user_report'&&!Object.values(sources).some(source=>source.includes(f.text))))throw new OnboardingError(422,'invalid_evidence');
    next.trainingSummary=summary;
  } else {delete next.trainingSummary;}
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
  if (proposal.nextQuestion?.topic === completeTopic) throw new OnboardingError(422, 'invalid_model_output');
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
