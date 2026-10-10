// Synthetic, disposable PostgreSQL only. No hosted content or provider dispatch.
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { planningStore } from '../../features/planning/planningStore.js';
import { planningService } from '../../features/planning/planning.js';
import { planDates, type TrainingSummary } from '../../features/planning/trainingSummary.js';
import { trainingFixture } from './planningFixture.js';
import { overviewFixture, overviewWorkouts } from './outlinePlanningFixture.js';
import type { OnboardingProvider } from '../../ai/onboardingProvider.js';
import type { ProfileStore } from '../../features/account/profileStore.js';

export async function verifySundayDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  const account = { userId: randomUUID(), sessionId: randomUUID() };
  await owner.query('INSERT INTO auth.users(id) VALUES($1)', [account.userId]);
  await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
    account.sessionId,
    account.userId,
  ]);
  await profiles.save(account, {
    firstName: 'Morgan',
    lastName: 'Synthetic',
    age: 32,
    height: { value: 68, unit: 'in' },
    weight: { value: 155, unit: 'lb' },
    gender: 'Unspecified',
  });
  const summary: TrainingSummary = [
    ...trainingFixture.map((f) =>
      f.category === 'availability'
        ? { ...f, text: 'Morning and evening are available. At most 25 minutes per session.' }
        : f,
    ),
    {
      category: 'nutrition',
      origin: 'user_report',
      text: 'Use male for the energy equation. Maintain my weight. No special dietary needs.',
      nutritionInput: { equationSex: 'male', weightIntent: 'maintain', safety: 'general' },
    },
  ];
  await owner.query(
    "INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone) VALUES($1,1,$2,'America/New_York')",
    [account.userId, JSON.stringify(summary)],
  );
  await owner.query('UPDATE fitquest.ai_budget SET cap_micro=7000000,app_enabled=true');
  const store = planningStore(pool);
  let calls = 0,
    invalid = false;
  const nutrition = {
    status: 'estimate',
    activityFactor: 1.6,
    proteinPerKg: 1.6,
    fatPercent: 30,
    adjustmentPercent: 0,
    rationale: 'Maintenance supports strength and walking with moderate assumed daily activity.',
    reason: null,
  };
  const provider: OnboardingProvider = {
    mode: 'test',
    model: 'mock-sunday',
    capMicro: 7000000,
    prepare: () => {
      throw Error();
    },
    cost: () => 10,
    call: async (body) => {
      calls++;
      const wire = JSON.parse(body),
        input = JSON.parse(wire.input);
      if (wire.text.format.name === 'training_week') {
        const week = overviewWorkouts(input);
        week.goalDecisions[1]!.evidence = [
          { date: input.dates[0], sessionIndex: 1, activityIndex: 0 },
        ];
        return { proposal: week, usage: { input: 10, output: 10, cached: 0, cacheWrite: 0 } };
      }
      const base = overviewFixture(input.dates);
      for (const d of base.days.slice(1)) d.sessions = [];
      const outline = {
        ...base,
        nutrition: {
          ...nutrition,
          proteinPerKg: input.review ? 1.8 : 1.6,
          activityFactor: invalid ? 99 : 1.6,
        },
      };
      return {
        proposal: input.review
          ? {
              outline,
              scope: [],
              nutritionChangeEvidence: 'Increase protein',
              reply: 'Protein is increased; training stays unchanged.',
            }
          : outline,
        usage: { input: 10, output: 10, cached: 0, cacheWrite: 0 },
      };
    },
  };
  const service = planningService(store, provider, 'test');
  const latest = async () => {
    const s = await store.read(account);
    return { s, p: s.plans.find((p) => p.summaryRevision === s.summary.revision)! };
  };
  const generate = async (target: string, retryAttempt: string | null = null) => {
    const { p } = await latest();
    return service.generate(
      account,
      {
        planId: p.id,
        summaryRevision: p.summaryRevision,
        target,
        retryAttempt,
        ...(target === 'week' ? { planRevision: p.planRevision, confirmOutline: true } : {}),
      },
      async () => true,
    );
  };
  await t.test(
    'new full calendar weeks and unchanged legacy partial ranges persist outline, macro review and all details; repeat confirmation and reopen are free',
    async () => {
      for (let weekday = 0; weekday < 7; weekday++) {
        if (weekday) {
          const { s } = await latest();
          await store.edit(account, s.summary.revision, summary, 'America/New_York');
        }
        const { s } = await latest();
        await store.ensurePlan(account, s.summary.revision);
        let { p } = await latest();
        assert.deepEqual(p.dates, planDates('America/New_York'));
        assert.equal(new Date(p.dates.at(-1)).getUTCDay(), 0);
        const dates = planDates('UTC', new Date(Date.UTC(2026, 9, 5 + weekday, 12))).slice(weekday);
        // Saved legacy partial ranges remain readable and unchanged through review/details.
        await owner.query(
          'UPDATE fitquest.training_plans SET dates=$3 WHERE user_id=$1 AND id=$2',
          [account.userId, p.id, JSON.stringify(dates)],
        );
        const before = calls;
        await generate('outline');
        p = (await latest()).p;
        assert.equal(calls, before + 1);
        assert.equal(p.outline.nutrition.status, 'estimate');
        assert.equal(p.outline.days.length, dates.length);
        assert.equal(p.outline.days[0].sessions.length, 2);
        assert.equal(p.days.length, 0);
        const prior = structuredClone(p.outline);
        invalid = true;
        const request = {
          planId: p.id,
          summaryRevision: p.summaryRevision,
          planRevision: p.planRevision,
          feedback: 'Increase protein; keep all training unchanged.',
          retryAttempt: null as string | null,
        };
        await service.review(account, request, async () => true);
        p = (await latest()).p;
        assert.deepEqual(p.outline, prior);
        assert.equal(p.jobs.find((j: any) => j.target === 'review:1').error, 'invalid_plan');
        request.retryAttempt = p.jobs.find((j: any) => j.target === 'review:1').attemptId;
        invalid = false;
        await service.review(account, request, async () => true);
        p = (await latest()).p;
        assert.equal(p.planRevision, 2);
        assert(p.outline.nutrition.proteinGrams > prior.nutrition.proteinGrams);
        assert.deepEqual(p.outline.days, prior.days);
        const checkedNutrition = structuredClone(p.outline.nutrition);
        await generate('week');
        p = (await latest()).p;
        assert.equal(p.reviewState, 'accepted');
        assert.equal(p.days.length, dates.length);
        assert.deepEqual(p.outline.nutrition, checkedNutrition);
        const spent = (await owner.query('SELECT * FROM fitquest.ai_budget')).rows,
          count = calls;
        await generate('week');
        await planningStore(pool).read(account);
        assert.equal(calls, count);
        assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows, spent);
      }
    },
  );
  await t.test(
    'editing reported nutrition prose clears stale structured inputs while existing accepted targets stay readable',
    async () => {
      const { s, p } = await latest(),
        before = structuredClone(p.outline.nutrition),
        changed = structuredClone(summary);
      changed.at(-1)!.text = 'I now prefer gradual weight gain.';
      await store.edit(account, s.summary.revision, changed, 'UTC');
      const next = await store.read(account);
      assert.equal(next.summary.document.at(-1).nutritionInput, undefined);
      assert.deepEqual(next.plans.find((q) => q.id === p.id).outline.nutrition, before);
    },
  );
  await t.test(
    'plain and partial missing-nutrition answers persist through review/reopen; unrelated and fabricated answers cannot fill inputs',
    async () => {
      const original = provider.call;
      let answer: {
          equationSex: 'male' | null;
          weightIntent: 'maintain' | null;
          safety: 'general' | 'unknown';
        } | null = null,
        forged = false;
      provider.call = async (body) => {
        calls++;
        const input = JSON.parse(JSON.parse(body).input),
          base = overviewFixture(input.dates);
        return {
          proposal: input.review
            ? {
                outline: {
                  ...base,
                  nutrition: {
                    ...nutrition,
                    inputReport: answer
                      ? {
                          text: forged ? 'Invented original quote.' : input.review.feedback,
                          inputs: answer,
                        }
                      : null,
                  },
                },
                scope: [],
                nutritionChangeEvidence: null,
                reply:
                  'Your training stays unchanged while reported nutrition inputs are retained.',
              }
            : base,
          usage: { input: 10, output: 10, cached: 0, cacheWrite: 0 },
        };
      };
      const fresh = async () => {
        const { s } = await latest();
        await store.edit(account, s.summary.revision, trainingFixture, 'UTC');
        await store.ensurePlan(account, s.summary.revision + 1);
        await generate('outline');
        return (await latest()).p;
      };
      const revise = async (feedback: string) => {
        const { p } = await latest();
        await service.review(
          account,
          {
            planId: p.id,
            summaryRevision: p.summaryRevision,
            planRevision: p.planRevision,
            feedback,
            retryAttempt: null,
          },
          async () => true,
        );
        return (await latest()).p;
      };
      try {
        let p = await fresh();
        const training = structuredClone(p.outline.days);
        answer = { equationSex: 'male', weightIntent: 'maintain', safety: 'general' };
        p = await revise('Male, maintain, no special circumstances.');
        assert.equal(p.outline.nutrition.status, 'estimate');
        assert.deepEqual(p.outline.days, training);
        const count = calls,
          budget = (await owner.query('SELECT * FROM fitquest.ai_budget')).rows,
          reopened = await planningStore(pool).read(account);
        assert.deepEqual(
          reopened.plans.find((q) => q.id === p.id).outline.nutrition,
          p.outline.nutrition,
        );
        assert.equal(calls, count);
        assert.deepEqual((await owner.query('SELECT * FROM fitquest.ai_budget')).rows, budget);
        p = await fresh();
        answer = { equationSex: 'male', weightIntent: null, safety: 'unknown' };
        p = await revise('Male.');
        assert.equal(p.outline.nutrition.status, 'deferred');
        assert.equal(p.outline.nutrition.reportedContext.equationSex, 'male');
        await planningStore(pool).read(account);
        answer = { equationSex: null, weightIntent: 'maintain', safety: 'unknown' };
        p = await revise('Maintain.');
        assert.equal(p.outline.nutrition.status, 'deferred');
        assert.equal(p.outline.nutrition.reportedContext.equationSex, 'male');
        await planningStore(pool).read(account);
        answer = { equationSex: null, weightIntent: null, safety: 'general' };
        p = await revise('No special circumstances.');
        assert.equal(p.outline.nutrition.status, 'estimate');
        assert.deepEqual(p.outline.days, training);
        p = await fresh();
        const deferred = structuredClone(p.outline.nutrition);
        answer = { equationSex: 'male', weightIntent: 'maintain', safety: 'general' };
        for (const feedback of ['Make Sunday shorter.', 'My gender is male.']) {
          p = await revise(feedback);
          assert.deepEqual(p.outline.nutrition, deferred);
          assert.deepEqual(
            (await planningStore(pool).read(account)).plans.find((q) => q.id === p.id).outline
              .nutrition,
            deferred,
          );
        }
        forged = true;
        p = await revise('Male, maintain, no special circumstances.');
        assert.deepEqual(p.outline.nutrition, deferred);
        assert(p.jobs.some((j: any) => j.error === 'invalid_nutrition'));
      } finally {
        provider.call = original;
      }
    },
  );
}
