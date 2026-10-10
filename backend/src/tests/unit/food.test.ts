import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  foodTotal,
  foodAverage,
  foodWeek,
  foodToday,
  validFoodDocument,
  type FoodState,
} from '../../shared/foodContract.js';
import { checkFoodCommand } from '../../features/nutrition/foodStore.js';
import { checkFood, prepareFood } from '../../features/nutrition/foodProvider.js';
import { openAIProvider } from '../../ai/onboardingProvider.js';
import { buildApp } from '../../app.js';
import { foodFixture } from '../fixtures/foodFixture.js';

test('food arithmetic preserves decimals, independent calories, null vs zero and explicit complete-day denominators', () => {
  const d = foodFixture();
  d.servings = 1.5;
  assert(validFoodDocument(d));
  assert.equal(foodTotal([d, d], 'calories').value, 370.368);
  assert.equal(foodTotal([d], 'fat').value, 0);
  assert.equal(foodTotal([d], 'carbs').unknown, 1);
  const state: FoodState = {
    dates: foodWeek(d.date),
    today: '2026-10-09',
    days: [{ date: d.date, revision: 1, complete: true }],
    entries: [
      {
        id: randomUUID(),
        revision: 1,
        document: d,
        createdAt: 'x',
        updatedAt: 'x',
        deletedAt: null,
        undoUntil: null,
      },
    ],
  };
  assert.deepEqual(foodAverage(state, 'carbs'), { value: null, days: 0, estimated: false });
  assert.equal(foodAverage(state, 'protein').days, 1);
  assert.equal(foodAverage(state, 'fat').value, 0);
  state.days[0]!.complete = false;
  assert.equal(foodAverage(state, 'protein').days, 0);
  state.days[0]!.complete = true;
  state.entries[0]!.deletedAt = 'x';
  assert.equal(foodAverage(state, 'fat').days, 0);
});
test('food date, captured timezone and calendar validation handles midnight, DST, leap day and full week', () => {
  assert.equal(foodToday('America/New_York', new Date('2026-03-08T06:59:00Z')), '2026-03-08');
  assert.equal(foodToday('America/New_York', new Date('2026-11-01T06:01:00Z')), '2026-11-01');
  assert.equal(foodToday('America/Los_Angeles', new Date('2026-10-09T01:00:00Z')), '2026-10-08');
  assert.deepEqual(foodWeek('2027-01-01'), [
    '2026-12-28',
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
  ]);
  for (const change of [
    { date: '2026-02-29' },
    { timeZone: 'invalid' },
    { time: '25:10' },
    { servings: NaN },
    { servings: 0 },
  ])
    assert(!validFoodDocument({ ...foodFixture(), ...change }));
});
test('bounded food candidates retain hypothetical intent, question and unknown portions; request uses current provider once', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-09T12:00:00Z') });
  let calls = 0;
  const provider = openAIProvider(
    {
      key: 'synthetic',
      model: 'gpt-6.1-sol',
      capMicro: 7000000,
      inputRate: 2,
      cachedRate: 0.1,
      cacheWriteRate: 2.5,
      outputRate: 10,
    },
    async () => {
      calls++;
      return new Response(
        JSON.stringify({
          status: 'completed',
          usage: { input_tokens: 100, output_tokens: 30 },
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    intent: 'planned',
                    question: null,
                    document: foodFixture(),
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    },
  );
  const input = {
    message: 'I might have this tomorrow',
    date: '2026-10-09',
    timeZone: 'America/New_York',
    context: [],
  };
  const request = prepareFood(provider, input);
  const body = JSON.parse(request.body);
  assert.equal(body.model, 'gpt-6.1-sol');
  assert.equal(body.reasoning.effort, 'low');
  assert.equal(body.max_output_tokens, 2000);
  assert.equal(JSON.parse(body.input).message, input.message);
  assert(!request.body.includes('activityId'));
  assert(!request.body.includes('userId'));
  const result = await provider.call(request.body, new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(checkFood(result.proposal, input.date, input.timeZone).intent, 'planned');
  assert.equal(
    checkFood(
      { intent: 'unclear', question: 'How much did you eat?', document: null },
      input.date,
      input.timeZone,
    ).document,
    null,
  );
  assert.throws(() =>
    checkFood(
      { intent: 'consumed', question: null, document: { ...foodFixture(), date: '2026-10-10' } },
      input.date,
      input.timeZone,
    ),
  );
});
test('food commands reject injected identity, arbitrary writes, missing explicit consumption and invalid nutrient provenance', () => {
  const cmd = {
    operationId: randomUUID(),
    kind: 'save',
    document: foodFixture(),
    entryId: null,
    expectedRevision: null,
    candidateOperation: null,
    confirmConsumed: true,
  };
  assert.equal(checkFoodCommand(cmd), cmd);
  for (const change of [
    { userId: randomUUID() },
    { confirmConsumed: false },
    { kind: 'sql' },
    { expectedRevision: 0 },
  ])
    assert.throws(() => checkFoodCommand({ ...cmd, ...change }));
  const d = foodFixture();
  d.items[0]!.nutrients.protein = { value: null, source: 'supplied' };
  assert(!validFoodDocument(d));
});
test('food routes authenticate before parsing private payload and never cache or echo it', async () => {
  const app = buildApp();
  try {
    for (const path of ['/food?date=2026-10-09&timeZone=UTC', '/food/operations/' + randomUUID()]) {
      const r = await app.inject({ method: 'GET', url: path });
      assert.equal(r.statusCode, 401);
      assert.equal(r.headers['cache-control'], 'no-store');
    }
    const r = await app.inject({
      method: 'POST',
      url: '/food/commands',
      payload: { message: 'private food' },
    });
    assert.equal(r.statusCode, 401);
    assert(!r.body.includes('private food'));
  } finally {
    await app.close();
  }
});
