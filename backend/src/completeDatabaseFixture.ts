import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from './profileStore.js';
import type { OnboardingProvider } from './onboardingProvider.js';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { onboardingService } from './onboarding.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import {
  completeFixture,
  completeOutlineFixture,
  unitWireFixture,
  syntheticAnswers,
} from './completePlanFixture.js';
import { encodeCompleteWire } from './completePlanWire.js';
import { planOverview } from './shared/completePlanContract.js';
export async function verifyCompleteDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  const a = { userId: randomUUID(), sessionId: randomUUID() },
    b = { userId: randomUUID(), sessionId: randomUUID() };
  for (const x of [a, b]) {
    await owner.query('INSERT INTO auth.users(id) VALUES($1)', [x.userId]);
    await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
      x.sessionId,
      x.userId,
    ]);
    await profiles.save(x, {
      firstName: 'Synthetic',
      lastName: 'Complete',
      age: 30,
      height: { value: 68, unit: 'in' },
      weight: { value: 155, unit: 'lb' },
      gender: 'Unspecified',
    });
  }
  let calls = 0,
    mode = 'valid',
    changed = false;
  let savedBody = '';
  const provider: OnboardingProvider = {
    mode: 'test',
    model: 'mock-complete',
    capMicro: 7000000,
    prepare() {
      throw Error('No intake calls');
    },
    cost: () => 10,
    call: async (body) => {
      calls++;
      savedBody = body;
      const req = JSON.parse(body);
      assert.equal(req.reasoning.effort, 'low');
      const start = /\d{4}-\d{2}-\d{2}/.exec(req.input)![0]!;
      const dates = Array.from({ length: 7 }, (_, i) =>
        new Date(Date.parse(start + 'T12:00Z') + i * 86400000).toISOString().slice(0, 10),
      );
      if (!req.text) {
        assert(!req.input.includes('Exercise catalog:'));
        return {
          ...(['refused', 'incomplete', 'provider_error'].includes(mode)
            ? { failure: mode as 'refused' }
            : { rawText: completeOutlineFixture(unitWireFixture(dates, changed).expected) }),
          usage: { input: 10, output: 10, cached: 0, cacheWrite: 0 },
        };
      }
      assert.equal(req.text.format.name, 'complete_week_units_v2');
      const plan = completeFixture(dates);
      if (mode === 'tracking') {
        const e = plan.days[0]!.sessions[0]!.blocks[0]!.exercises[0]!;
        e.activityId = 'FQ-ACT-00148';
        e.target = { kind: 'repetitions', reps: { min: 5, max: 5 } };
      }
      if (mode === 'lookup')
        plan.days[0]!.sessions[0]!.blocks[0]!.exercises[0]!.activityId = 'FQ-ACT-99999';
      if (changed) plan.days[1]!.sessions[0]!.durationMinutes = { min: 15, max: 20 };
      return {
        ...(['refused', 'incomplete', 'provider_error'].includes(mode)
          ? { failure: mode as 'refused' }
          : {
              proposal:
                mode === 'unavailable'
                  ? {
                      result: {
                        kind: 'unavailable',
                        reason: 'Synthetic catalog gap prevents the requested update.',
                      },
                    }
                  : mode === 'invalid'
                    ? { result: { kind: 'plan' } }
                    : mode === 'valid'
                      ? unitWireFixture(dates, changed).wire
                      : encodeCompleteWire({ result: { kind: 'plan', plan } }),
            }),
        usage: { input: 10, output: 10, cached: 0, cacheWrite: 0 },
        diagnostic: { httpStatus: 200, requestId: `req_synthetic_${calls}` },
      };
    },
  };
  const store = planningStore(pool),
    service = planningService(store, provider, 'test'),
    intake = onboardingService(postgresOnboardingStore(pool), provider, 'test');
  let plan: any;
  const budget = async () => (await owner.query('SELECT * FROM fitquest.ai_budget')).rows;
  const saved = async () =>
    (
      await owner.query(
        'SELECT complete_plan,review_revision,review_state,accepted_at FROM fitquest.training_plans WHERE user_id=$1',
        [a.userId],
      )
    ).rows[0];
  await t.test(
    'legacy complete-week fixture retains free intake and the original reader/generation path',
    async () => {
      const before = await budget();
      let c = await intake.create(a, 'America/New_York', 1);
      for (const [index, value] of syntheticAnswers.entries()) {
        const next = await intake.command(
          a,
          c.id,
          {
            kind: 'edit',
            topic: `intake:${index}`,
            itemId: null,
            value,
            operationId: randomUUID(),
            expectedRevision: c.revision,
          },
          async () => true,
        );
        assert(!('deleted' in next));
        c = next;
      }
      await intake.command(
        a,
        c.id,
        {
          kind: 'confirm',
          reviewedRevision: c.revision,
          expectedRevision: c.revision,
          operationId: randomUUID(),
        },
        async () => true,
      );
      assert.equal(calls, 0);
      assert.deepEqual(await budget(), before);
      assert.equal((await store.read(a)).plans[0]!.schemaVersion, 'document-week-v4');
      await owner.query(
        "UPDATE fitquest.training_plans SET schema_version='complete-week-v1' WHERE user_id=$1",
        [a.userId],
      );
      plan = (await store.read(a)).plans[0];
      assert.equal(plan.schemaVersion, 'complete-week-v1');
      assert.equal(plan.outlineFirst, false);
      assert.equal(plan.completeReady, false);
      assert.equal(plan.dates.length, 7);
    },
  );
  await t.test(
    'refusal, incomplete, unavailable and invalid initial output are distinct; only explicit retries dispatch',
    async () => {
      const r = {
        summaryRevision: plan.summaryRevision,
        planId: plan.id,
        target: 'week',
        retryAttempt: null as string | null,
      };
      for (const kind of [
        'refused',
        'incomplete',
        'unavailable',
        'invalid',
        'tracking',
        'lookup',
      ]) {
        mode = kind;
        const n = calls;
        await service.generate(a, r, async () => true);
        plan = (await store.read(a)).plans[0];
        assert.equal(calls, n + (kind === 'unavailable' ? 2 : 1));
        assert.equal(plan.completeReady, false);
        assert.equal((await saved()).complete_plan, null);
        assert.equal(
          plan.jobs[0].error,
          kind === 'unavailable'
            ? 'plan_unavailable'
            : kind === 'invalid'
              ? 'invalid_plan:week_schema'
              : ['tracking', 'lookup'].includes(kind)
                ? 'catalog_coverage'
                : kind,
        );
        await service.generate(a, r, async () => true);
        assert.equal(calls, n + (kind === 'unavailable' ? 2 : 1));
        r.retryAttempt = plan.jobs[0].attemptId;
      }
      const diagnostics = (
        await owner.query(
          'SELECT d.*,a.provider_diagnostic FROM fitquest.plan_validation_diagnostics d JOIN fitquest.onboarding_attempts a ON a.user_id=d.user_id AND a.id=d.attempt_id WHERE d.user_id=$1 ORDER BY d.created_at',
          [a.userId],
        )
      ).rows;
      assert.equal(diagnostics.length, 3);
      assert.equal(new Set(diagnostics.map((d) => d.attempt_id)).size, 3);
      assert.deepEqual(
        diagnostics.map((d) => d.diagnostic.rule),
        ['shape', 'tracking', 'lookup'],
      );
      assert(
        diagnostics.every(
          (d) =>
            d.provider_diagnostic.httpStatus === 200 &&
            d.provider_diagnostic.requestId.startsWith('req_synthetic_'),
        ),
      );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('fitquest.user_id',$1,true)", [b.userId]);
        assert.equal(
          (
            await client.query(
              'SELECT count(*)::int AS n FROM fitquest.plan_validation_diagnostics',
            )
          ).rows[0].n,
          0,
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      assert(!JSON.stringify(await store.read(a)).includes('diagnostic'));
      assert.equal(
        (
          await owner.query(
            'SELECT count(*)::int AS n FROM fitquest.plan_validation_diagnostics WHERE user_id=$1',
            [b.userId],
          )
        ).rows[0].n,
        0,
      );
      mode = 'valid';
      const n = calls;
      await Promise.all([
        service.generate(a, r, async () => true),
        service.generate(a, r, async () => true),
      ]);
      plan = (await store.read(a)).plans[0];
      assert.equal(calls, n + 1);
      assert.equal(plan.completeReady, true);
      assert.equal(plan.completePlan, null);
      assert.deepEqual(plan.activityNames, {});
      assert.equal(plan.reviewState, 'draft');
      assert.equal(plan.planRevision, 1);
      assert(!JSON.stringify(plan).includes('activityId'));
      assert.deepEqual(plan.overview, planOverview((await saved()).complete_plan));
      assert.equal((await saved()).complete_plan.days.length, 7);
      assert.deepEqual((await saved()).complete_plan, unitWireFixture(plan.dates).expected);
      assert(syntheticAnswers.every((answer) => JSON.parse(savedBody).input.includes(answer)));
      await assert.rejects(
        service.generate(b, r, async () => true),
        { code: 'summary_required' },
      );
      assert.equal((await store.read(b)).plans.length, 0);
    },
  );
  await t.test(
    'acceptance is concurrent/idempotent, revision checked, free and reveals the exact saved object',
    async () => {
      const r = {
        planId: plan.id,
        summaryRevision: plan.summaryRevision,
        planRevision: plan.planRevision,
      };
      const before = await budget(),
        n = calls,
        canonical = (await saved()).complete_plan;
      await assert.rejects(store.accept(b, r), { code: 'not_found' });
      await assert.rejects(store.accept(a, { ...r, planRevision: 0 }), { code: 'plan_changed' });
      await Promise.all([store.accept(a, r), store.accept(a, r)]);
      plan = (await store.read(a)).plans[0];
      assert.equal(plan.reviewState, 'accepted');
      assert.deepEqual(plan.completePlan, canonical);
      assert(plan.acceptedAt);
      const stamp = plan.acceptedAt;
      await store.accept(a, r);
      plan = (await store.read(a)).plans[0];
      assert.deepEqual(plan.acceptedAt, stamp);
      assert.equal(calls, n);
      assert.deepEqual(await budget(), before);
      await assert.rejects(
        service.generate(
          a,
          { ...r, target: 'week', confirmOutline: true, retryAttempt: null },
          async () => true,
        ),
        { code: 'review_unavailable' },
      );
      assert.equal(calls, n);
    },
  );
  await t.test(
    'older canonical seconds remain unchanged on persisted reads and free reopen',
    async () => {
      const old = await saved(),
        legacy = structuredClone(old.complete_plan),
        n = calls,
        before = await budget();
      legacy.days[0].sessions[0].blocks[0].exercises[0].target = {
        kind: 'duration',
        seconds: { min: 2, max: 2 },
      };
      await owner.query('UPDATE fitquest.training_plans SET complete_plan=$2 WHERE user_id=$1', [
        a.userId,
        JSON.stringify(legacy),
      ]);
      try {
        const reopened = (await store.read(a)).plans[0]!;
        assert.deepEqual(reopened.completePlan, legacy);
        await store.accept(a, {
          planId: plan.id,
          summaryRevision: plan.summaryRevision,
          planRevision: plan.planRevision,
        });
        assert.deepEqual((await store.read(a)).plans[0]!.completePlan, legacy);
        assert.equal(calls, n);
        assert.deepEqual(await budget(), before);
      } finally {
        await owner.query('UPDATE fitquest.training_plans SET complete_plan=$2 WHERE user_id=$1', [
          a.userId,
          JSON.stringify(old.complete_plan),
        ]);
      }
    },
  );
  await t.test(
    'failed complete revisions preserve usable work; successful revisions hide details until free acceptance',
    async () => {
      const r = {
        planId: plan.id,
        summaryRevision: plan.summaryRevision,
        planRevision: plan.planRevision,
        feedback: 'Make Tuesday shorter. Keep Monday unchanged.',
        retryAttempt: null as string | null,
      };
      const old = await saved();
      changed = true;
      mode = 'invalid';
      await service.review(a, r, async () => true);
      assert.deepEqual(await saved(), old);
      plan = (await store.read(a)).plans[0];
      const job = plan.jobs.find((j: any) => j.target === 'review:1');
      r.retryAttempt = job.attemptId;
      mode = 'unavailable';
      await service.review(a, r, async () => true);
      assert.deepEqual(await saved(), old);
      plan = (await store.read(a)).plans[0];
      r.retryAttempt = plan.jobs.find((j: any) => j.target === 'review:1').attemptId;
      mode = 'valid';
      changed = true;
      const n = calls;
      await Promise.all([
        service.review(a, r, async () => true),
        service.review(a, r, async () => true),
      ]);
      assert.equal(calls, n + 1);
      plan = (await store.read(a)).plans[0];
      assert.equal(plan.planRevision, 2);
      assert.equal(plan.reviewState, 'draft');
      assert.equal(plan.completePlan, null);
      assert.equal(plan.acceptedAt, null);
      assert.deepEqual(plan.overview.days[0], planOverview(old.complete_plan).days[0]);
      await service.review(a, r, async () => true);
      assert.equal(calls, n + 1);
      await assert.rejects(store.accept(a, { ...r, planRevision: 1 }), { code: 'plan_changed' });
      const before = await budget();
      await store.accept(a, { ...r, planRevision: 2 });
      await store.read(a);
      assert.deepEqual(await budget(), before);
      assert.equal(calls, n + 1);
    },
  );
  await t.test(
    'diagnostic database failure preserves the failed revision, usable plan and independently settled attempt',
    async () => {
      const old = await saved(),
        n = calls;
      mode = 'tracking';
      await owner.query(
        `CREATE FUNCTION fitquest.fail_diagnostic_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic diagnostic storage failure'; END $$; CREATE TRIGGER fail_diagnostic_test BEFORE INSERT ON fitquest.plan_validation_diagnostics FOR EACH ROW EXECUTE FUNCTION fitquest.fail_diagnostic_test();`,
      );
      try {
        await service.review(
          a,
          {
            planId: plan.id,
            summaryRevision: plan.summaryRevision,
            planRevision: 2,
            feedback: 'Keep the entire week unchanged.',
            retryAttempt: null,
          },
          async () => true,
        );
      } finally {
        await owner.query(
          'DROP TRIGGER fail_diagnostic_test ON fitquest.plan_validation_diagnostics; DROP FUNCTION fitquest.fail_diagnostic_test()',
        );
      }
      assert.equal(calls, n + 2);
      assert.deepEqual(await saved(), old);
      const current = (await store.read(a)).plans[0]!,
        job = current.jobs.find((j: any) => j.target === 'review:2');
      assert.equal(job.error, 'catalog_coverage');
      assert.equal(
        (
          await owner.query(
            'SELECT state FROM fitquest.onboarding_attempts WHERE user_id=$1 AND id=$2',
            [a.userId, job.attemptId],
          )
        ).rows[0].state,
        'settled',
      );
      assert.equal(
        (
          await owner.query(
            'SELECT count(*)::int AS n FROM fitquest.plan_validation_diagnostics WHERE user_id=$1 AND attempt_id=$2',
            [a.userId, job.attemptId],
          )
        ).rows[0].n,
        0,
      );
      mode = 'valid';
    },
  );
  await t.test(
    'deferred publication failure rolls back the complete object, revision and generation receipt together',
    async () => {
      const old = await saved(),
        retryAttempt = (await store.read(a)).plans[0]!.jobs.find(
          (j: any) => j.target === 'review:2',
        )!.attemptId;
      await owner.query(
        `CREATE FUNCTION fitquest.fail_complete_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic commit failure'; END $$; CREATE CONSTRAINT TRIGGER fail_complete_test AFTER UPDATE ON fitquest.training_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.user_id='${a.userId}'::uuid AND NEW.review_revision>2) EXECUTE FUNCTION fitquest.fail_complete_test();`,
      );
      try {
        await assert.rejects(
          service.review(
            a,
            {
              planId: plan.id,
              summaryRevision: plan.summaryRevision,
              planRevision: 2,
              feedback: 'Keep the entire week unchanged.',
              retryAttempt,
            },
            async () => true,
          ),
        );
        assert.deepEqual(await saved(), old);
      } finally {
        await owner.query(
          'DROP TRIGGER fail_complete_test ON fitquest.training_plans; DROP FUNCTION fitquest.fail_complete_test()',
        );
      }
      const attempts = (
        await owner.query('SELECT state FROM fitquest.onboarding_attempts WHERE user_id=$1', [
          a.userId,
        ])
      ).rows;
      assert(attempts.length > 0 && attempts.every((r) => r.state === 'settled'));
    },
  );
}
