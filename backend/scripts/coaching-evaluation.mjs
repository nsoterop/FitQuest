// Explicit, one-stage-at-a-time synthetic evaluation against the existing hosted ledger.
// No initialization, retry loop, owner content access, Auth writes or hosted schema changes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, appendFile, open } from 'node:fs/promises';
import { createPool } from '../dist/profileStore.js';
import { configuredProvider, promptVersion } from '../dist/onboardingProvider.js';
import { evaluateModelInput } from '../dist/onboardingEvaluation.js';
import { emptyContext, consistentReply, applyProposal } from '../dist/onboardingDomain.js';
import { renderOnboardingReply } from '../dist/onboardingReply.js';
import { prepareWeek, checkWeek, weeklyLimits } from '../dist/weeklyPlanning.js';
import { prepareReview, checkReview } from '../dist/planReview.js';
import { coachingCases, distributedReport } from '../dist/coachingCases.js';
const stage = process.argv[2];
assert.ok(
  ['onboarding', 'onboarding-repair', 'distributed', 'review', 'review-repair', 'single'].includes(
    stage,
  ),
);
assert.equal(process.env.FITQUEST_COACHING_EVAL_APPROVED, 'true');
const directory = new URL('../.ai-evaluation/', import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
const output = new URL('coaching-v1-results.jsonl', directory);
const records = (
  await readFile(output, 'utf8').catch((e) => {
    if (e.code !== 'ENOENT') throw e;
    return '';
  })
)
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((s) => JSON.parse(s));
assert.ok(
  !records.some((r) => r.stage === stage),
  'Inspect existing stage; no automatic paid rerun',
);
assert.ok(
  !records.some(
    (r) =>
      r.event === 'reservation' &&
      !records.some((x) => x.event === 'result' && x.stage === r.stage),
  ),
  'An earlier outcome is uncertain; stop paid calls',
);
const lock = await open(new URL('coaching-v1.lock', directory), 'wx', 0o600);
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.username, 'fitquest_app.wqvxddvihlobnalxpzow');
assert.equal(url.searchParams.get('sslmode'), 'verify-full');
assert.ok(url.hostname.endsWith('.supabase.com'));
const provider = configuredProvider({ ...process.env, ONBOARDING_AI_ENABLED: 'true' });
assert.ok(provider);
assert.equal(provider.capMicro, 7000000);
assert.equal(promptVersion, 'onboarding-v12');
const model = {
  context: emptyContext(),
  sources: {},
  recent: [],
  knownProfileFields: ['first name', 'last name', 'height', 'age', 'weight', 'gender'],
};
let input,
  prepared,
  validator,
  version,
  timeout = weeklyLimits.timeoutMs;
if (stage.startsWith('onboarding')) {
  model.sources.m1 = distributedReport;
  model.context.items.push({
    id: 'raw-m1',
    topic: 'Athlete report',
    value: distributedReport,
    quote: distributedReport,
    source: 'm1',
    origin: 'user_report',
    review: 'unreviewed',
    supersedes: null,
    recordedAt: '2026-10-04T00:00:00Z',
  });
  model.recent.push({ role: 'user', source: 'm1', text: distributedReport });
  prepared = provider.prepare(model);
  version = promptVersion;
  timeout = 30000;
  input = model;
} else {
  input = structuredClone(coachingCases[stage === 'single' ? 'single' : 'distributed']);
  if (stage !== 'single') {
    const onboarding = records.findLast(
      (r) => r.stage.startsWith('onboarding') && r.event === 'result' && !r.failure,
    );
    assert.ok(onboarding && !onboarding.failure);
    input.summary = onboarding.raw.trainingSummary;
  }
  if (stage.startsWith('review')) {
    const prior = records.find((r) => r.stage === 'distributed' && r.event === 'result');
    assert.ok(prior && !prior.failure);
    const saved = checkWeek(prior.raw, prior.input);
    input = {
      ...prior.input,
      review: {
        feedback:
          'Keep Monday morning and Saturday exactly as they are. Keep Wednesday morning manageable by shortening the walk. In both strength sessions, replace hands-elevated push-ups with suitable work using only the clear floor; I do not have a raised support. Keep all other strength exercises unchanged. This is for this week only.',
        context: null,
        outline: saved.outline,
        days: saved.details,
      },
    };
    prepared = prepareReview(provider, input);
    validator = (v) => checkReview(v, input);
    version = 'catalog-review-v2';
  } else {
    prepared = prepareWeek(provider, input);
    validator = (v) => checkWeek(v, input);
    version = 'catalog-week-v5';
  }
}
const previous = records
  .filter((r) => r.event === 'reservation')
  .reduce((sum, r) => sum + r.reservedMicro, 0);
assert.ok(
  previous + prepared.reserveMicro <= 150000,
  'Batch maximum reservation ceiling would be exceeded',
);
assert.ok(
  records.filter((r) => r.event === 'reservation').length < 5,
  'Maximum five dispatches including the inspected onboarding repair',
);
const pool = createPool(url.toString());
let raw, diagnostic;
try {
  await appendFile(
    output,
    JSON.stringify({
      event: 'reservation',
      stage,
      reservedMicro: prepared.reserveMicro,
      requestBytes: Buffer.byteLength(prepared.body),
      requestSha256: createHash('sha256').update(prepared.body).digest('hex'),
      maximumBatchMicro: 150000,
      version,
      at: new Date().toISOString(),
    }) + '\n',
    { mode: 0o600 },
  );
  const observed = {
    ...provider,
    prepare: () => prepared,
    call: async (body, signal) => {
      const result = await provider.call(body, signal);
      raw = result.proposal;
      diagnostic = result.diagnostic;
      return result;
    },
  };
  const result = await evaluateModelInput(
    pool,
    observed,
    model,
    stage,
    'Inspect actual output for fidelity, coherent workload, goal coverage, constraints and protected work.',
    version,
    validator,
    timeout,
  );
  const rendered =
    stage.startsWith('onboarding') && result.proposal
      ? renderOnboardingReply(
          consistentReply(
            applyProposal(model.context, result.proposal, model.sources, new Date().toISOString()),
            result.proposal,
          ),
        )
      : undefined;
  await appendFile(
    output,
    JSON.stringify({ event: 'result', stage, input, ...result, raw, diagnostic, rendered }) + '\n',
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      stage,
      attempt: result.attempt,
      requestBytes: Buffer.byteLength(prepared.body),
      cumulativeReservedMicro: previous + prepared.reserveMicro,
      reservedMicro: prepared.reserveMicro,
      accountedMicro: result.accountedMicro,
      failure: result.failure,
      diagnostic,
      latencyMs: result.latencyMs,
    }),
  );
  assert.equal(result.failure, undefined, 'Inspect failure; no automatic retry');
} finally {
  await pool.end();
  await lock.close();
  const { unlink } = await import('node:fs/promises');
  await unlink(new URL('coaching-v1.lock', directory));
}
