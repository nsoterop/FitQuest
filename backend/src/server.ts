import { weeklyScheduler } from './features/weekly-planning/weeklyScheduler.js';
import { weightStore } from './features/weight/weightStore.js';
import { journalStore } from './features/journal/journalStore.js';
import { foodLibraryStore } from './features/nutrition/foodLibraryStore.js';
import { foodStore } from './features/nutrition/foodStore.js';
import { foodService } from './features/nutrition/food.js';
import { planningStore } from './features/planning/planningStore.js';
import { planningService } from './features/planning/planning.js';
import { buildApp } from './app.js';
import { createPool, postgresProfileStore } from './features/account/profileStore.js';
import { supabaseVerifier } from './features/account/auth.js';
import { postgresOnboardingStore } from './features/onboarding/onboardingStore.js';
import { onboardingService } from './features/onboarding/onboarding.js';
import { configuredProvider } from './ai/onboardingProvider.js';

const { DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Backend database and Supabase configuration are required.');
}
try {
  const authUrl = new URL(SUPABASE_URL);
  const databaseUrl = new URL(DATABASE_URL);
  if (
    authUrl.protocol !== 'https:' ||
    authUrl.username ||
    authUrl.password ||
    !SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') ||
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !(
      databaseUrl.username === 'fitquest_app' || databaseUrl.username.startsWith('fitquest_app.')
    ) ||
    (process.env.NODE_ENV === 'production' &&
      databaseUrl.searchParams.get('sslmode') !== 'verify-full')
  ) {
    throw new Error();
  }
} catch {
  throw new Error(
    'Use HTTPS Supabase Auth, a publishable key, and the restricted TLS database role.',
  );
}
const pool = createPool(DATABASE_URL);
const provider = configuredProvider(process.env);
const app = buildApp(
  { redact: ['req.headers.authorization', 'req.headers.cookie', 'err'] },
  {
    store: postgresProfileStore(pool),
    verifyAccount: supabaseVerifier(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY),
    weight: weightStore(pool),
    journal: journalStore(pool),
    library: foodLibraryStore(pool),
    food: foodService(foodStore(pool), provider),
    planning: planningService(planningStore(pool), provider),
    onboarding: onboardingService(postgresOnboardingStore(pool), provider),
  },
);
let scheduler: ReturnType<typeof weeklyScheduler> | undefined;
app.addHook('onClose', async () => {
  await scheduler?.stop();
  await pool.end();
});
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
  if (process.env.NODE_ENV === 'production')
    scheduler = weeklyScheduler(pool, provider, () =>
      app.log.error('Weekly scheduling check failed; saved work retained.'),
    );
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
