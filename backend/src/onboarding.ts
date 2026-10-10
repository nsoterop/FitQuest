import { intakeQuestions, intakeDisclosure } from './fixedIntake.js';
import { renderOnboardingReply } from './onboardingReply.js';
import type { Account } from './auth.js';
import {
  applyProposal,
  consistentReply,
  disclosure,
  disclosureVersion,
  limits,
  opening,
  completionReply,
  OnboardingError,
  type Command,
} from './onboardingDomain.js';
import {
  validateProposal,
  type OnboardingProvider,
  type ProviderResult,
} from './onboardingProvider.js';
import {
  completedConversation,
  type Conversation,
  type OnboardingStore,
} from './onboardingStore.js';

export function onboardingService(
  store: OnboardingStore,
  provider?: OnboardingProvider,
  environment = process.env.NODE_ENV,
) {
  if (provider?.mode === 'test' && environment === 'production')
    throw new Error('Test AI is not allowed in production.');
  const present = (conversation: Conversation) => ({
    ...conversation,
    confirmableRevision: conversation.confirmableRevision ?? null,
    generationEnabled: !!provider,
    opening,
    disclosure,
    disclosureVersion,
    ...(conversation.context.intake
      ? {
          intakeQuestions,
          disclosure: intakeDisclosure,
          disclosureVersion: 'fixed-intake-v1',
          generationEnabled: false,
        }
      : {}),
  });
  const completionReceipt = async (account: Account, id: string) => {
    if (!(await store.removeCompleted(account, id)))
      throw new OnboardingError(409, 'revision_conflict');
    return { id, deleted: true as const, summarySaved: true as const, message: completionReply };
  };
  const presentStored = async (account: Account, conversation: Conversation) => {
    if (!completedConversation(conversation)) return present(conversation);
    if (!(await store.removeCompleted(account, conversation.id)))
      throw new OnboardingError(409, 'revision_conflict');
    return {
      id: conversation.id,
      deleted: true as const,
      summarySaved: true as const,
      message: completionReply,
    };
  };
  return {
    create: async (account: Account, timeZone?: string, intakeVersion?: 1) =>
      present(await store.create(account, timeZone, undefined, intakeVersion)),
    async clarify(
      account: Account,
      recovery: import('./onboardingDomain.js').RecoveryRequest,
      authorize: () => Promise<boolean>,
    ) {
      const conversation = await store.create(account, undefined, recovery);
      if ('completedId' in conversation)
        return {
          id: conversation.completedId,
          deleted: true as const,
          summarySaved: true as const,
          message: completionReply,
        };
      if (conversation.turns.length) return present(conversation);
      // Stable operation ID prevents duplicate assessment charges across lost responses/reopens.
      return this.command(
        account,
        conversation.id,
        { kind: 'assess', operationId: conversation.id, expectedRevision: conversation.revision },
        authorize,
      );
    },
    read: async (account: Account, id: string) => {
      try {
        return await presentStored(account, await store.read(account, id));
      } catch (error) {
        if (error instanceof OnboardingError && error.code === 'not_found')
          return completionReceipt(account, id);
        throw error;
      }
    },
    remove: (account: Account, id: string) => store.remove(account, id),
    async command(
      account: Account,
      id: string,
      command: Command,
      authorize: () => Promise<boolean>,
    ) {
      let claimed;
      try {
        claimed = await store.claim(account, id, command, provider);
      } catch (error) {
        // Only the retained summary for this exact account/conversation proves a
        // lost confirmation completed. Never infer success from absence alone.
        if (
          command.kind === 'confirm' &&
          error instanceof OnboardingError &&
          error.code === 'not_found'
        )
          return completionReceipt(account, id);
        throw error;
      }
      const presentOperation = async (conversation: Conversation) => {
        const result = await presentStored(account, conversation);
        return 'deleted' in result
          ? result
          : { ...result, operationResult: await store.operation(account, id, command.operationId) };
      };
      if (!claimed.work || !provider) return presentOperation(claimed.conversation);
      const work = claimed.work;
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout>;
      const timedOut = new Promise<ProviderResult>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve({ failure: 'provider_error', diagnostic: { transport: 'aborted' } });
        }, 30000);
      });
      // Settlement is attached to the provider result itself, even when a deadline wins the race.
      const request = Promise.resolve()
        .then(() => provider.call(work.body, controller.signal))
        .catch((): ProviderResult => ({ failure: 'provider_error' }))
        .then(async (result) => {
          await store.settle(
            account,
            work.attempt,
            result.usage ? provider.cost(result.usage) : null,
            result.diagnostic,
          );
          return result;
        });
      let result: ProviderResult;
      try {
        result = await Promise.race([request, timedOut]);
      } finally {
        clearTimeout(timeout!);
      }
      if (controller.signal.aborted)
        await store.settle(account, work.attempt, null, { transport: 'aborted' });
      if (!(await authorize())) throw new OnboardingError(401, 'session_ended');
      let context;
      let reply;
      let questionTopic;
      let failure = result.failure;
      if (!failure) {
        try {
          const proposal = validateProposal(result.proposal, provider.mode === 'openai');
          context = applyProposal(
            claimed.conversation.context,
            proposal,
            work.sources,
            new Date().toISOString(),
          );
          const display = consistentReply(context, proposal);
          reply = renderOnboardingReply(display);
          questionTopic = display.nextQuestion?.topic;
          if (reply.length > 3000) throw new OnboardingError(422, 'invalid_model_output');
        } catch {
          context = undefined;
          reply = undefined;
          questionTopic = undefined;
          failure = 'incomplete';
        }
      }
      return presentOperation(
        await store.finish(account, id, work, context, reply, failure, questionTopic),
      );
    },
  };
}
export type OnboardingService = ReturnType<typeof onboardingService>;
const uuid = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
};
const base = {
  operationId: uuid,
  expectedRevision: { type: 'integer', minimum: 0, maximum: limits.operations },
  timeZone: { type: 'string', minLength: 1, maxLength: 80 },
};
const text = (maximum: number) => ({
  type: 'string',
  minLength: 1,
  maxLength: maximum,
  pattern: '\\S',
});
export const idSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
};
export const commandSchema = {
  oneOf: [
    ['message', { text: text(limits.message) }],
    ['retry', { turnId: uuid }],
    ['skip', { topic: text(80) }],
    [
      'edit',
      { itemId: { anyOf: [{ type: 'null' }, text(20)] }, topic: text(80), value: text(4000) },
    ],
    ['confirm', { reviewedRevision: { type: 'integer', minimum: 0, maximum: limits.operations } }],
  ].map(([kind, fields]) => ({
    type: 'object',
    additionalProperties: false,
    required: ['operationId', 'expectedRevision', 'kind', ...Object.keys(fields as object)],
    properties: { ...base, kind: { const: kind }, ...(fields as object) },
  })),
};
