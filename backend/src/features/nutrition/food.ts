import type { Account } from '../account/auth.js';
import type { FoodCommand } from '../../shared/foodContract.js';
import { checkFood } from './foodProvider.js';
import type { FoodStore } from './foodStore.js';
import type { OnboardingProvider, ProviderResult } from '../../ai/onboardingProvider.js';
import { OnboardingError } from '../onboarding/onboardingError.js';
export function foodService(
  store: FoodStore,
  provider?: OnboardingProvider,
  environment = process.env.NODE_ENV,
) {
  if (provider?.mode === 'test' && environment === 'production')
    throw Error('Test AI is not allowed in production.');
  return {
    read: store.read,
    readOperation: store.readOperation,
    async command(a: Account, cmd: FoodCommand, authorize: () => Promise<boolean>) {
      const claim = await store.claim(a, cmd, provider);
      if (!claim.work || !provider) return claim.operation;
      const work = claim.work;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<ProviderResult>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({ failure: 'provider_error', diagnostic: { transport: 'aborted' } });
        }, 60000);
      });
      const pending = Promise.resolve()
        .then(() => provider.call(work.body, controller.signal))
        .catch((): ProviderResult => ({ failure: 'provider_error' }))
        .then(async (result) => {
          await store.settle(
            a,
            work.attempt,
            result.usage ? provider.cost(result.usage) : null,
            result.diagnostic,
          );
          return result;
        });
      let result: ProviderResult;
      try {
        result = await Promise.race([timeout, pending]);
      } finally {
        clearTimeout(timer!);
      }
      if (controller.signal.aborted)
        await store.settle(a, work.attempt, null, { transport: 'aborted' });
      if (!(await authorize())) throw new OnboardingError(401, 'session_ended');
      let candidate = null;
      let error: string | null = result.failure ?? null;
      if (!error)
        try {
          candidate = checkFood(result.proposal, work.date, work.timeZone);
        } catch {
          error = 'invalid_food';
        }
      return store.finish(a, cmd.operationId, work.attempt, candidate, error);
    },
  };
}
export type FoodService = ReturnType<typeof foodService>;
