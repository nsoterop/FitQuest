import {foodLibraryStore} from './foodLibraryStore.js';
import {foodStore} from './foodStore.js';
import {foodService} from './food.js';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { buildApp } from './app.js';
import { createPool, postgresProfileStore } from './profileStore.js';
import { supabaseVerifier } from './auth.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import { onboardingService } from './onboarding.js';
import { configuredProvider } from './onboardingProvider.js';

const { DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Backend database and Supabase configuration are required.');
}
try {
  const authUrl = new URL(SUPABASE_URL);
  const databaseUrl = new URL(DATABASE_URL);
  if (authUrl.protocol !== 'https:' || authUrl.username || authUrl.password ||
      !SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') ||
      !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
      !(databaseUrl.username === 'fitquest_app' || databaseUrl.username.startsWith('fitquest_app.')) ||
      (process.env.NODE_ENV === 'production' && databaseUrl.searchParams.get('sslmode') !== 'verify-full')) {
    throw new Error();
  }
} catch { throw new Error('Use HTTPS Supabase Auth, a publishable key, and the restricted TLS database role.'); }
const pool = createPool(DATABASE_URL);
const provider=configuredProvider(process.env);
const app = buildApp({ redact: ['req.headers.authorization', 'req.headers.cookie', 'err'] }, {
  store: postgresProfileStore(pool), verifyAccount: supabaseVerifier(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY),
  library:foodLibraryStore(pool),
  food:foodService(foodStore(pool),provider),
  planning:planningService(planningStore(pool),provider),
  onboarding: onboardingService(postgresOnboardingStore(pool), provider),
});
app.addHook('onClose', async () => pool.end());
const port = Number(process.env.PORT ?? '10000');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}

try {
  await app.listen({ host: '0.0.0.0', port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
