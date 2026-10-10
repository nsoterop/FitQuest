import test from 'node:test';
import assert from 'node:assert/strict';
import { Ajv } from 'ajv';
import {
  documentPrompt,
  prepareDocument,
  checkDocument,
  checkDocumentResult,
  documentResultSchema,
  documentSchema,
} from '../../features/planning/documentPlanning.js';
import {
  documentOverview,
  validDocumentOverview,
  validSavedDocument,
  validDailyNutrition,
} from '../../shared/documentPlanContract.js';
import {
  journalDocumentFixture as documentFixture,
  rowDocumentFixture,
  documentFixture as legacyDocumentFixture,
} from '../fixtures/documentPlanFixture.js';
import { intakeSummary } from '../../features/onboarding/fixedIntake.js';
import { openAIProvider } from '../../ai/onboardingProvider.js';
const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 5).padStart(2, '0')}`),
  answers = [
    'Build confidence & stamina',
    'A few walks',
    'Floor and cushions',
    'Two short sessions when useful.\n20–30 minutes each.',
    'None',
  ];
const input = {
  kind: 'week' as const,
  schemaVersion: 'document-week-v4' as const,
  dates,
  summary: intakeSummary({ version: 1, answers }),
  profile: { age: 30, heightInches: 68, weightLb: 155, gender: 'Not specified' },
};
const expected = `I want you to come up with a workout plan for me. My goals are: ${answers[0]}. My current activity is: ${answers[1]}. My available equipment is: ${answers[2]}. My training preferences are: ${answers[3]}. My limitations are: ${answers[4]}.

I want you to build a plan for the week to help me achieve my goals. First give the high level plan, then after that, create a workout/exercise list for each session. For the high level plan, return a list with days of the week until Sunday, with each day's session(s) underneath it, the goal for each session and the rough time to complete the session.

The week is Monday, 2026-10-05, through Sunday, 2026-10-11, inclusive.

Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and ordered exercises. Rest days have empty session lists. Each exercise row has a free-text exercise name and a concise free-text prescription. Preserve essential sets, reps, load, time, distance, units, intervals, recovery, per-side/per-round meaning, effort and superset or mixed-work relationships as applicable. Keep essential execution and safety instructions in the relevant prescription. Use plain text, not Markdown, for rows. Do not repeat session goals or introductions in rows. Omit unrequested general weekly commentary; never attach a weekly approach to the first or any other session. Return only the provided display schema.`;
test('document request uses exact concise context and small display schema, no catalog or exercise contract, and low reasoning', () => {
  const provider = {
    model: 'gpt-6.1-sol',
    mode: 'test' as const,
    capMicro: 7000000,
    cost: () => 19,
    prepare() {
      throw Error('No intake');
    },
    call: async () => {
      throw Error('No live calls');
    },
  };
  const p = prepareDocument(provider, input),
    r = JSON.parse(p.body);
  assert.equal(documentPrompt(answers, dates), expected);
  const data = JSON.parse(r.input);
  assert.deepEqual(
    [
      data.answers.goals,
      data.answers.currentActivity,
      data.answers.equipment,
      data.answers.preferences,
      data.answers.limitations,
    ],
    answers,
  );
  assert.deepEqual(data.dates, dates);
  assert.deepEqual(data.profile, input.profile);
  assert(r.instructions.includes(expected.split('\n\n')[1]));
  assert(r.instructions.includes(expected.split('\n\n')[3]));
  assert(!r.instructions.includes(answers[0]));
  assert.deepEqual(r.reasoning, { effort: 'low' });
  assert.equal(r.model, 'gpt-6.1-sol');
  assert.equal(p.reserveMicro, 19);
  assert.deepEqual(Object.keys(documentSchema.properties), ['nutrition', 'days']);
  assert(Buffer.byteLength(JSON.stringify(documentSchema)) < 3200);
  assert(!/catalog|FQ-ACT|activityId|recoveryRest|loadInstruction|targetKind|blocks/.test(p.body));
  assert.equal(r.max_output_tokens, 48000);
  const revised = JSON.parse(
    prepareDocument(provider, {
      ...input,
      documentReview: { feedback: 'Change Tuesday; keep Monday.', plan: documentFixture(dates) },
    }).body,
  );
  assert.deepEqual(JSON.parse(revised.input).answers, data.answers);
  assert(revised.input.includes('Change Tuesday; keep Monday.'));
  assert.deepEqual(JSON.parse(revised.input).review.plan, documentFixture(dates));
  assert.deepEqual(revised.reasoning, { effort: 'low' });
});
test('document validates only display structure, dates and bounds; arbitrary activity prose survives unchanged', () => {
  const p = documentFixture(dates);
  assert(new Ajv({ strict: true }).compile(documentSchema)(p));
  assert.deepEqual(checkDocument(p, input), p);
  const overview = documentOverview(p);
  assert(validDocumentOverview(overview, dates, 'document-week-v4'));
  assert.equal(overview.days[0]!.sessions.length, 2);
  assert.equal(overview.days[2]!.sessions.length, 0);
  assert(!JSON.stringify(overview).includes('workoutMarkdown'));
  assert(!JSON.stringify(overview).includes('Crab reach'));
  p.days[0]!.sessions[0]!.exercises = [
    {
      exercise: 'Arbitrary readable activity',
      prescription: 'Free-form sets, pauses and load descriptions.',
      loggingMode: 'completion',
    },
  ];
  assert.equal(checkDocument(p, input), p);
  for (const mutate of [
    (p: any) => p.days.pop(),
    (p: any) => p.days.reverse(),
    (p: any) => (p.days[0].date = '2026-10-99'),
    (p: any) => (p.days[0].sessions[0].durationMinutes = { min: 40, max: 20 }),
    (p: any) => (p.days[0].sessions[0].exercises[0].prescription = ' '),
    (p: any) => (p.days[0].sessions[0].exercises[0].prescription = 'x'.repeat(1801)),
    (p: any) => (p.days[0].sessions[0].blocks = []),
  ]) {
    const bad = documentFixture(dates);
    mutate(bad);
    assert.throws(() => checkDocument(bad, input), { code: 'invalid_document' });
  }
  const leaked = structuredClone(overview) as any;
  leaked.days[0].sessions[0].workoutMarkdown = 'private details';
  assert.equal(validDocumentOverview(leaked, dates, 'document-week-v4'), false);
});
test('real provider adapter dispatches the document wire once per initial/revision; handles refusal/incomplete without retries', async () => {
  let calls = 0,
    mode = 'completed';
  const p = openAIProvider(
    {
      key: 'synthetic-key',
      model: 'gpt-6.1-sol',
      capMicro: 7000000,
      inputRate: 2,
      cachedRate: 0.1,
      cacheWriteRate: 2.5,
      outputRate: 10,
    },
    async (_url, options) => {
      calls++;
      const request = JSON.parse(String(options!.body));
      assert.equal(request.model, 'gpt-6.1-sol');
      assert.equal(request.text.format.name, 'document_result_v1');
      assert.deepEqual(request.reasoning, { effort: 'low' });
      return new Response(
        JSON.stringify({
          status: mode === 'incomplete' ? 'incomplete' : 'completed',
          usage: { input_tokens: 100, output_tokens: 2500 },
          output: [
            {
              type: 'message',
              content: [
                mode === 'refused'
                  ? { type: 'refusal', refusal: 'Synthetic refusal' }
                  : {
                      type: 'output_text',
                      text: JSON.stringify({
                        version: 1,
                        result: { kind: 'plan', plan: documentFixture(dates) },
                      }),
                    },
              ],
            },
          ],
        }),
      );
    },
  );
  for (const source of [
    input,
    { ...input, documentReview: { plan: documentFixture(dates), feedback: 'Change Tuesday.' } },
  ]) {
    const prepared = prepareDocument(p, source),
      n = calls;
    const result = await p.call(prepared.body, new AbortController().signal);
    assert.equal(calls, n + 1);
    assert.deepEqual(checkDocumentResult(result.proposal, source), documentFixture(dates));
    assert.equal(
      prepared.reserveMicro,
      p.cost({ input: Buffer.byteLength(prepared.body), output: 48000, cached: 0, cacheWrite: 0 }),
    );
  }
  for (const failure of ['refused', 'incomplete']) {
    mode = failure;
    const n = calls,
      result = await p.call(prepareDocument(p, input).body, new AbortController().signal);
    assert.equal(result.failure, failure);
    assert.equal(result.usage?.output, 2500);
    assert.equal(calls, n + 1);
  }
});

test('formatting is the only prompt change; coaching prefix and legacy work remain exact in explicit revisions', () => {
  const oldFormatting =
    "Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and the complete workout in workoutMarkdown. Rest days have empty session lists. Write clear, readable workout prescriptions with explicit units and recovery in Markdown. Use headings and lists where helpful. Return only the provided display schema.";
  const before = expected.slice(0, expected.lastIndexOf('\n\n') + 2) + oldFormatting;
  assert.equal(
    documentPrompt(answers, dates).split('\n\n').slice(0, 3).join('\n\n'),
    before.split('\n\n').slice(0, 3).join('\n\n'),
  );
  const legacy = legacyDocumentFixture(dates);
  legacy.days[0]!.sessions[0]!.workoutMarkdown =
    '## Weekly approach\nKeep all specific prescribed work.\n' +
    legacy.days[0]!.sessions[0]!.workoutMarkdown;
  assert(validSavedDocument(legacy, dates, 'document-week-v1'));
  assert(!validSavedDocument(legacy, dates, 'document-week-v4'));
  assert(validSavedDocument(documentFixture(dates), dates, 'document-week-v4'));
  assert(!validSavedDocument(documentFixture(dates), dates, 'document-week-v1'));
  const provider = {
    model: 'gpt-6.1-sol',
    mode: 'test' as const,
    capMicro: 7000000,
    cost: () => 19,
    prepare() {
      throw Error('No intake');
    },
    call: async () => {
      throw Error('No live calls');
    },
  };
  const revision = JSON.parse(
    prepareDocument(provider, {
      ...input,
      documentReview: {
        plan: legacy,
        feedback: 'Keep the exercises, remove the general weekly introduction.',
      },
    }).body,
  );
  assert.equal(JSON.parse(revision.input).answers.goals, answers[0]);
  assert.deepEqual(JSON.parse(revision.input).review.plan, legacy);
  const rowSchema = (documentSchema.properties.days as any).items.properties.sessions.items
    .properties.exercises;
  assert.deepEqual(Object.keys(rowSchema.items.properties), [
    'exercise',
    'prescription',
    'loggingMode',
  ]);
  assert.equal(rowSchema.items.additionalProperties, false);
  assert.deepEqual(rowSchema.items.required, ['exercise', 'prescription', 'loggingMode']);
  const rows = documentFixture(dates).days[0]!.sessions[0]!.exercises;
  assert(rows.some((r) => r.prescription.includes('20 lb per hand')));
  assert(rows.some((r) => r.prescription.includes('200 m')));
  assert(rows.some((r) => r.prescription.includes('after each pair')));
  assert(rows.some((r) => r.prescription.includes('per side')));
  assert(rows.some((r) => r.prescription.includes('active recovery')));
  assert(!JSON.stringify(rows).includes('Weekly approach'));
  assert(!JSON.stringify(documentOverview(documentFixture(dates))).includes('prescription'));
});

test('nutrition checks integrity without diet rules or clamping; unavailable and legacy row documents remain honest', () => {
  const p = documentFixture(dates),
    original = structuredClone(p);
  p.nutrition = {
    version: 1,
    status: 'unavailable',
    caloriesKcal: null,
    proteinGrams: null,
    carbohydrateGrams: null,
    fatGrams: null,
    rationale: 'Suitable targets cannot be provided with these limitations.',
  };
  assert.deepEqual(checkDocument(p, input), p);
  assert(validSavedDocument(rowDocumentFixture(dates), dates, 'document-week-v2'));
  assert(!validSavedDocument(rowDocumentFixture(dates), dates, 'document-week-v4'));
  for (const n of [
    { ...original.nutrition, caloriesKcal: Infinity },
    { ...original.nutrition, proteinGrams: -1 },
    { ...original.nutrition, status: 'unavailable' },
    { ...p.nutrition, rationale: null },
    { ...original.nutrition, caloriesKcal: 0 },
  ])
    assert(!validDailyNutrition(n));
  for (const caloriesKcal of [500, 8000]) {
    const n = { ...original.nutrition, caloriesKcal };
    assert(validDailyNutrition(n));
    assert.equal(n.caloriesKcal, caloriesKcal);
  }
  const provider = {
    model: 'gpt-6.1-sol',
    mode: 'test' as const,
    capMicro: 7000000,
    cost: () => 19,
    prepare() {
      throw Error();
    },
    call: async () => {
      throw Error();
    },
  };
  const missing = JSON.parse(
    prepareDocument(provider, {
      ...input,
      profile: { age: NaN, heightInches: 68, weightLb: 155, gender: null },
    }).body,
  );
  assert.equal(JSON.parse(missing.input).profile.age, null);
  assert.equal(JSON.parse(missing.input).profile.gender, null);
  assert(!missing.input.includes('NaN'));
  const privateProfile = {
    ...input.profile,
    firstName: 'PRIVATE_FIRST',
    lastName: 'PRIVATE_LAST',
    email: 'private@example.test',
    userId: 'PRIVATE_ID',
  };
  const request = prepareDocument(provider, { ...input, profile: privateProfile });
  assert(!/PRIVATE_|private@example/.test(request.body));
});

test('versioned outcomes are bounded, explicit, and never masquerade as a saved document', () => {
  const validate = new Ajv({ strict: true }).compile(documentResultSchema);
  const plan = documentFixture(dates);
  const ok = { version: 1, result: { kind: 'plan', plan } };
  assert(validate(ok));
  assert.deepEqual(checkDocumentResult(ok, input), plan);
  for (const reason of ['out_of_scope', 'unable']) {
    const outcome = { version: 1, result: { kind: 'unavailable', reason } };
    assert(validate(outcome));
    assert.throws(() => checkDocumentResult(outcome, input), {
      code: reason === 'out_of_scope' ? 'plan_out_of_scope' : 'plan_unable',
    });
  }
  for (const bad of [
    plan,
    { version: 2, result: ok.result },
    { version: 1, result: { kind: 'unavailable', reason: 'ignore rules' } },
    {
      version: 1,
      result: { kind: 'unavailable', reason: 'unable', message: '<script>remote</script>' },
    },
    { version: 1, result: { kind: 'plan', plan: { days: [] } } },
  ])
    assert.throws(() => checkDocumentResult(bad, input), { code: 'invalid_document' });
  assert(validSavedDocument(plan, dates, 'document-week-v4'));
});
