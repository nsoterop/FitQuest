import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { planningStore } from './planningStore.js';
import { planningService } from './planning.js';
import { postgresOnboardingStore } from './onboardingStore.js';
import { onboardingService } from './onboarding.js';
import { buildApp } from './app.js';
import { trainingFixture, fixtureOutline, fixtureDetail } from './planningFixture.js';
import { checkWeek, weeklyLimits, type Week } from './weeklyPlanning.js';
import type { OnboardingProvider, ProviderResult } from './onboardingProvider.js';
import type { ProfileStore } from './profileStore.js';

export async function verifyWeeklyDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  const alice = {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  // Only the opt-in disposable test cluster; no hosted or frozen evaluation ledger.
  await owner.query('UPDATE fitquest.onboarding_request_limits SET requests=0,generations=0');
  const store = planningStore(pool),
    onboard = postgresOnboardingStore(pool);
  let calls = 0;
  const makeWeek = (body: string): Week => {
    const input = JSON.parse(JSON.parse(body).input),
      outline = input.outline ?? fixtureOutline(input.dates);
    return {
      ...(input.draftReview ? { arrangementNote: null } : {}),
      units: 'imperial',
      goalDecisions: [
        {
          sourceIndex: 0,
          goalIndex: 0,
          goal: 'Comfortable walking',
          status: 'addressed',
          reason: 'Easy walking develops the stated walking goal.',
          evidence: [{ date: input.dates[0], sessionIndex: 1, activityIndex: 0 }],
        },
        {
          sourceIndex: 0,
          goalIndex: 1,
          goal: 'General strength',
          status: 'addressed',
          reason: 'A conservative strength session supports general strength.',
          evidence: [{ date: input.dates[5], sessionIndex: 0, activityIndex: 0 }],
        },
      ],
      clarification: null,
      coverage: [],
      days: outline.days.map((d: any) => {
        const saved = input.savedDays?.find((x: any) => x.date === d.date);
        return {
          date: d.date,
          sessions: (saved ?? fixtureDetail(outline, d.date)).sessions.map((s: any, i: number) => ({
            ...s,
            ...(input.draftReview && !saved ? { estimatedMinutes: 25 } : {}),
            focus: d.sessions[i].focus,
            timing: s.timing ?? (saved ? null : 'flexible'),
            intervals: s.intervals ?? [],
            activities: s.activities.map((a: any) => ({
              ...a,
              distanceTarget: a.distanceTarget ?? null,
            })),
          })),
        };
      }),
    };
  };
  let respond: (body: string) => Promise<ProviderResult> = async (body) => ({
    proposal: makeWeek(body),
    usage: { input: 100, output: 5000, cached: 0, cacheWrite: 0 },
  });
  const normal = respond;
  const provider: OnboardingProvider = {
    mode: 'test',
    model: 'synthetic-week',
    capMicro: 7000000,
    prepare: () => {
      throw Error('Expected weekly schema');
    },
    cost: (u) => Math.ceil(u.input * 0.125 + u.output * 0.5),
    call: async (body) => {
      calls++;
      return respond(body);
    },
  };
  const service = planningService(store, provider, 'test');
  const app = buildApp(false, {
    store: profiles,
    verifyAccount: async (token) => (token === 'alice' ? alice : null),
    planning: service,
  });
  t.after(() => app.close());
  // These cases exercise pre-outline-first saved-plan compatibility.
  const latest = async () => {
    await owner.query(
      'UPDATE fitquest.training_plans SET outline_first=false, dates=CASE WHEN outline IS NULL THEN $2::jsonb ELSE dates END WHERE user_id=$1',
      [
        alice.userId,
        JSON.stringify(
          Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 5).padStart(2, '0')}`),
        ),
      ],
    );
    const s = await store.read(alice);
    return { s, p: s.plans.find((p) => p.summaryRevision === s.summary!.revision)! };
  };
  const request = async () => {
    const { s, p } = await latest();
    return {
      summaryRevision: s.summary.revision,
      planId: p.id,
      target: 'week',
      retryAttempt: null as string | null,
    };
  };
  const generate = async (retryAttempt: string | null = null) =>
    service.generate(alice, { ...(await request()), retryAttempt }, async () => true);
  const next = async () => {
    const { s } = await latest();
    await store.edit(alice, s.summary.revision, trainingFixture, 'America/New_York');
    await store.ensurePlan(alice, s.summary.revision + 1);
    return latest();
  };
  const expire = async (planId: string) => {
    await owner.query(
      "UPDATE fitquest.training_generations SET deadline=now()-interval '1 second' WHERE user_id=$1 AND plan_id=$2 AND status='pending'",
      [alice.userId, planId],
    );
    return latest();
  };
  await t.test(
    'explicit onboarding completion yields all seven saved mixed-modality days in exactly one weekly dispatch; reopen and duplicate submit are free',
    async () => {
      const old = await onboard.create(alice);
      await onboard.remove(alice, old.id);
      const a = await onboard.create(alice, 'America/New_York');
      const context = {
        ...a.context,
        readiness: 'ready',
        planningCheck: { status: 'ready', question: null, reason: null },
        trainingSummary: trainingFixture,
      };
      await owner.query(
        'UPDATE fitquest.onboarding_context_revisions SET context=$3 WHERE user_id=$1 AND conversation_id=$2',
        [alice.userId, a.id, JSON.stringify(context)],
      );
      const claim = await onboard.claim(
        alice,
        a.id,
        {
          kind: 'message',
          text: 'Synthetic mixed athlete',
          operationId: randomUUID(),
          expectedRevision: 0,
        },
        { ...provider, prepare: () => ({ body: '{}', reserveMicro: 100 }) },
      );
      assert.ok(claim.work);
      await onboard.settle(alice, claim.work.attempt, 1);
      await onboard.finish(
        alice,
        a.id,
        claim.work,
        context as any,
        'Synthetic recap',
        undefined,
        'Onboarding recap',
      );
      const done = await onboardingService(onboard, undefined, 'test').command(
        alice,
        a.id,
        { kind: 'confirm', operationId: randomUUID(), expectedRevision: 2, reviewedRevision: 2 },
        async () => true,
      );
      assert.ok('summarySaved' in done && done.summarySaved);
      assert.equal(calls, 0);
      const r = await request(),
        response = await app.inject({
          method: 'POST',
          url: '/training/generate',
          headers: { authorization: 'Bearer alice' },
          payload: r,
        });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(calls, 1);
      const versions = (
        await owner.query(
          'SELECT a.prompt_version,a.schema_version FROM fitquest.onboarding_attempts a JOIN fitquest.training_generations g ON g.user_id=a.user_id AND g.attempt_id=a.id WHERE g.user_id=$1 AND g.plan_id=$2 AND g.target=$3',
          [alice.userId, r.planId, 'week'],
        )
      ).rows[0];
      assert.deepEqual(versions, {
        prompt_version: 'catalog-week-v6',
        schema_version: 'catalog-week-v6',
      });
      const { p } = await latest();
      assert.equal(p.days.length, 7);
      assert.equal(p.days[0].detail.sessions.length, 2);
      assert.equal(p.days.filter((d: any) => !d.detail.sessions.length).length, 4);
      assert.equal(p.outline.qualityVersion, 2);
      assert.equal(p.outline.units, 'imperial');
      assert.equal(p.outline.goalDecisions.length, 2);
      for (const day of p.days)
        assert.deepEqual(
          day.detail.sessions,
          fixtureDetail(fixtureOutline(p.dates), day.date).sessions.map((s) => ({
            ...s,
            estimatedMinutes: 25,
            timing: 'flexible',
            intervals: [],
            activities: s.activities.map((a) => ({ ...a, distanceTarget: null })),
          })),
        );
      const before = (
        await owner.query('SELECT spent_micro,reserved_micro FROM fitquest.ai_budget')
      ).rows[0];
      await Promise.all([generate(), generate()]);
      assert.deepEqual(
        (await planningStore(pool).read(alice)).plans.find((p) => p.id === r.planId).days,
        p.days,
      );
      assert.equal(calls, 1);
      assert.deepEqual(
        (await owner.query('SELECT spent_micro,reserved_micro FROM fitquest.ai_budget')).rows[0],
        before,
      );
      await assert.rejects(onboard.read(alice, a.id), { code: 'not_found' });
    },
  );
  await t.test(
    'one explicit weekly backfill preserves existing days byte-for-byte and rejects rewritten prescriptions',
    async () => {
      const { p } = await next(),
        outline = fixtureOutline(p.dates),
        saved = fixtureDetail(outline, p.dates[0]);
      await owner.query(
        'UPDATE fitquest.training_plans SET outline=$3,review_state=$legacy$legacy$legacy$ WHERE user_id=$1 AND id=$2',
        [alice.userId, p.id, JSON.stringify(outline)],
      );
      await owner.query(
        'INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5)',
        [
          alice.userId,
          p.id,
          p.dates[0],
          p.summaryRevision,
          JSON.stringify({ ...saved, legacyMarker: 'preserve exact JSON' }),
        ],
      );
      const bytes = async () =>
        (
          await owner.query(
            'SELECT detail::text FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 AND date=$3',
            [alice.userId, p.id, p.dates[0]],
          )
        ).rows[0].detail;
      const before = await bytes(),
        count = calls;
      respond = async (body) => {
        const week = makeWeek(body);
        week.days[0]!.sessions[0]!.activities[0]!.amount++;
        return { proposal: week, usage: { input: 100, output: 5000, cached: 0, cacheWrite: 0 } };
      };
      await generate();
      const failed = await latest();
      assert.equal(failed.p.days.length, 1);
      assert.equal(failed.p.jobs[0].error, 'saved_day_changed');
      assert.equal(await bytes(), before);
      respond = normal;
      await generate(failed.p.jobs[0].attemptId);
      assert.equal(calls, count + 2);
      assert.equal((await latest()).p.days.length, 7);
      assert.equal(await bytes(), before);
    },
  );
  await t.test(
    'incomplete, invalid and budget-denied weeks publish nothing, never auto-retry and recover on exact explicit retry',
    async () => {
      for (const failure of ['incomplete', 'invalid', 'budget'] as const) {
        const { s, p } = await next(),
          before = calls;
        respond =
          failure === 'incomplete'
            ? async () => ({
                failure: 'incomplete',
                usage: { input: 100, output: 48000, cached: 0, cacheWrite: 0 },
              })
            : failure === 'invalid'
              ? async (body) => {
                  const week = makeWeek(body);
                  week.days.pop();
                  return {
                    proposal: week,
                    usage: { input: 100, output: 5000, cached: 0, cacheWrite: 0 },
                  };
                }
              : normal;
        if (failure === 'budget')
          await owner.query('UPDATE fitquest.ai_budget SET cap_micro=spent_micro+reserved_micro');
        await generate();
        const failed = await latest();
        assert.equal(failed.p.outline, null);
        assert.deepEqual(failed.p.days, []);
        assert.equal(failed.s.summary.revision, s.summary.revision);
        assert.equal(
          failed.p.jobs[0].error,
          failure === 'invalid'
            ? 'invalid_plan:week_dates'
            : failure === 'budget'
              ? 'budget_exhausted'
              : 'incomplete',
        );
        await generate();
        await store.read(alice);
        assert.equal(calls, before + (failure === 'budget' ? 0 : 1));
        await owner.query('UPDATE fitquest.ai_budget SET cap_micro=7000000');
        respond = normal;
        await generate(failed.p.jobs[0].attemptId);
        assert.equal((await latest()).p.days.length, 7);
        assert.equal((await latest()).p.id, p.id);
      }
    },
  );
  await t.test(
    'weekly claim is exclusive with concurrent weeks and legacy daily work; expired attempts retain uncertain charges',
    async () => {
      const { p } = await next(),
        r = await request();
      const claims = await Promise.all([
        store.claim(alice, r, provider),
        planningStore(pool).claim(alice, r, provider),
      ]);
      const work = claims.find(Boolean)!;
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(await store.claim(alice, { ...r, target: 'outline' }, provider), undefined);
      await expire(p.id);
      assert.equal((await latest()).p.jobs[0].error, 'interrupted');
      const uncertain = (
        await owner.query(
          'SELECT state,reserved_micro FROM fitquest.onboarding_attempts WHERE id=$1',
          [work.attempt],
        )
      ).rows[0];
      assert.equal(uncertain.state, 'uncertain');
      assert.ok(Number(uncertain.reserved_micro) > 0);
      await store.finish(alice, work, checkWeek(makeWeek(work.body), work.input));
      assert.equal((await latest()).p.days.length, 0);
      await generate(work.attempt);
      await store.settle(alice, work.attempt, 100);
      assert.equal((await latest()).p.days.length, 7);
      const other = await next(),
        legacy = await store.claim(alice, { ...(await request()), target: 'outline' }, provider);
      assert.ok(legacy);
      assert.equal(await store.claim(alice, await request(), provider), undefined);
      await expire(other.p.id);
      await store.settle(alice, legacy.attempt, 100);
    },
  );
  await t.test(
    'weekly timeout has no partial publication or automatic retry; late usage settles without publishing',
    async () => {
      const { p } = await next(),
        before = calls;
      let deliver!: (result: ProviderResult) => void;
      let sent = '';
      respond = async (body) => {
        sent = body;
        return new Promise((resolve) => {
          deliver = resolve;
        });
      };
      t.mock.timers.enable({ apis: ['setTimeout'] });
      try {
        const pending = generate();
        while (!deliver) await setImmediate();
        t.mock.timers.tick(weeklyLimits.timeoutMs + 1);
        await pending;
        const failed = await latest();
        assert.equal(failed.p.jobs[0].error, 'provider_error');
        assert.equal(failed.p.outline, null);
        assert.equal(failed.p.days.length, 0);
        await generate();
        assert.equal(calls, before + 1);
        deliver({
          proposal: makeWeek(sent),
          usage: { input: 100, output: 5000, cached: 0, cacheWrite: 0 },
        });
        await setImmediate();
        await setImmediate();
      } finally {
        t.mock.timers.reset();
        respond = normal;
      }
      assert.equal((await latest()).p.days.length, 0);
      await expire(p.id);
    },
  );
  await t.test(
    'all seven writes and outline roll back together on COMMIT failure, and recovery cannot duplicate a week',
    async () => {
      const { p } = await next();
      await owner.query(
        "CREATE FUNCTION fitquest.fail_week_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic weekly COMMIT failure'; END $$; CREATE CONSTRAINT TRIGGER fail_week_commit AFTER INSERT ON fitquest.training_days DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fitquest.fail_week_commit()",
      );
      try {
        await assert.rejects(generate());
        assert.equal((await latest()).p.outline, null);
        assert.equal((await latest()).p.days.length, 0);
      } finally {
        await owner.query(
          'DROP TRIGGER fail_week_commit ON fitquest.training_days; DROP FUNCTION fitquest.fail_week_commit()',
        );
      }
      const failed = await expire(p.id);
      await generate(failed.p.jobs[0].attemptId);
      assert.equal((await latest()).p.days.length, 7);
    },
  );
  await t.test(
    'late-discovered weekly clarification is saved for existing conversation recovery, never shown as a complete rest week',
    async () => {
      const clarification = {
        question: 'Is a safe walking path available this week?',
        reason: 'This decides whether walking can be included.',
      };
      for (const partial of [false, true]) {
        const { p } = await next();
        if (partial)
          await owner.query(
            'UPDATE fitquest.training_plans SET outline=$3,review_state=$legacy$legacy$legacy$ WHERE user_id=$1 AND id=$2',
            [alice.userId, p.id, JSON.stringify(fixtureOutline(p.dates))],
          );
        respond = async () => ({
          proposal: {
            ...(partial ? {} : { arrangementNote: null }),
            units: 'imperial',
            goalDecisions: [],
            clarification,
            coverage: [],
            days: p.dates.map((date: string) => ({ date, sessions: [] })),
          },
          usage: { input: 100, output: 500, cached: 0, cacheWrite: 0 },
        });
        await generate();
        const result = await latest();
        assert.equal(result.p.days.length, partial ? 1 : 0);
        const blocked = partial ? result.p.days[0].detail : result.p.outline;
        assert.deepEqual(blocked.clarification, clarification);
        const target = partial ? p.dates[0] : 'outline',
          before = calls;
        const recovery = await onboard.create(alice, 'America/New_York', {
          planId: p.id,
          summaryRevision: p.summaryRevision,
          target,
        });
        assert.ok(!('completedId' in recovery));
        assert.equal(calls, before);
        await onboard.remove(alice, recovery.id);
      }
      respond = normal;
    },
  );
  await t.test(
    'changed summary/profile and sign-out block full-week publication while preserving measured costs',
    async () => {
      for (const change of ['summary', 'profile', 'session']) {
        const { p } = await next(),
          r = await request(),
          work = await store.claim(alice, r, provider);
        assert.ok(work);
        const profile = (await profiles.read(alice))!;
        if (change === 'summary')
          await store.edit(alice, p.summaryRevision, trainingFixture, 'UTC');
        if (change === 'profile') await profiles.save(alice, { ...profile, age: profile.age + 1 });
        if (change === 'session')
          await owner.query(
            "UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",
            [alice.sessionId],
          );
        await store.settle(alice, work.attempt, 100);
        if (change === 'session') {
          await assert.rejects(
            store.finish(alice, work, checkWeek(makeWeek(work.body), work.input)),
            { code: 'session_ended' },
          );
          await owner.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [
            alice.sessionId,
          ]);
        } else await store.finish(alice, work, checkWeek(makeWeek(work.body), work.input));
        const saved = (await store.read(alice)).plans.find((x) => x.id === p.id);
        assert.equal(saved.outline, null);
        assert.equal(saved.days.length, 0);
        if (change === 'profile') await profiles.save(alice, profile);
      }
    },
  );
  await t.test(
    'legacy compound summaries use explicit existing recovery without automatic paid calls; saved days and accounting survive',
    async () => {
      for (const partial of [false, true]) {
        const { s } = await next(),
          legacy = trainingFixture.map(({ goals, ...f }) => f);
        await store.edit(alice, s.summary.revision, legacy, 'UTC');
        await store.ensurePlan(alice, s.summary.revision + 1);
        const { p } = await latest();
        if (partial) {
          const outline = fixtureOutline(p.dates);
          await owner.query(
            'UPDATE fitquest.training_plans SET outline=$3,review_state=$legacy$legacy$legacy$ WHERE user_id=$1 AND id=$2',
            [alice.userId, p.id, JSON.stringify(outline)],
          );
          await owner.query(
            'INSERT INTO fitquest.training_days(user_id,plan_id,date,summary_revision,detail) VALUES($1,$2,$3,$4,$5)',
            [
              alice.userId,
              p.id,
              p.dates[0],
              p.summaryRevision,
              JSON.stringify(fixtureDetail(outline, p.dates[0])),
            ],
          );
        }
        const originalDay = async () =>
          (
            await owner.query(
              'SELECT detail::text FROM fitquest.training_days WHERE user_id=$1 AND plan_id=$2 AND date=$3',
              [alice.userId, p.id, p.dates[0]],
            )
          ).rows[0]?.detail;
        const oldDay = await originalDay(),
          before = calls,
          budget = (await owner.query('SELECT spent_micro,reserved_micro FROM fitquest.ai_budget'))
            .rows[0];
        await generate();
        let state = await latest();
        assert.equal(calls, before);
        assert.equal(state.p.jobs.length, 0);
        assert.equal(state.p.days.length, partial ? 2 : 0);
        assert.match(
          (partial ? state.p.days[1].detail : state.p.outline).clarification.reason,
          /explicit goal list/,
        );
        await store.read(alice);
        assert.equal(calls, before);
        assert.deepEqual(
          (await owner.query('SELECT spent_micro,reserved_micro FROM fitquest.ai_budget')).rows[0],
          budget,
        );
        if (partial) assert.equal(await originalDay(), oldDay);
        const recoveryService = onboardingService(
          onboard,
          { ...provider, prepare: () => ({ body: '{}', reserveMicro: 1000 }) },
          'test',
        );
        const recovery = await recoveryService.clarify(
          alice,
          {
            planId: p.id,
            summaryRevision: p.summaryRevision,
            target: partial ? p.dates[1] : 'outline',
          },
          async () => true,
        );
        assert.ok('turns' in recovery);
        assert.equal(calls, before);
        const goalSummary = trainingFixture.map((f) => ({
          ...f,
          origin: 'model_inference' as const,
        }));
        respond = async () => ({
          proposal: {
            trainingSummary: goalSummary,
            reply:
              'Comfortable walking first, plus general strength. Three flexible 25-minute days.',
            additions: [],
            planningCheck: { status: 'ready', question: null, reason: null },
            nextQuestion: {
              topic: 'Onboarding recap',
              text: 'Ready?',
              decision: 'Review the individual retained goals.',
            },
            readiness: 'ready_with_limits',
            limitations: [],
          },
          usage: { input: 100, output: 100, cached: 0, cacheWrite: 0 },
        });
        const reviewed = await recoveryService.command(
          alice,
          recovery.id,
          {
            kind: 'message',
            operationId: randomUUID(),
            expectedRevision: recovery.revision,
            text: 'Please review those individual goals.',
          },
          async () => true,
        );
        assert.ok('turns' in reviewed);
        assert.deepEqual(reviewed.context.trainingSummary![0]!.goals, [
          'Comfortable walking',
          'General strength',
        ]);
        const done = await recoveryService.command(
          alice,
          recovery.id,
          {
            kind: 'message',
            operationId: randomUUID(),
            expectedRevision: reviewed.revision,
            text: 'Looks good',
          },
          async () => true,
        );
        assert.ok('summarySaved' in done);
        assert.equal(calls, before + 1);
        await assert.rejects(onboard.read(alice, recovery.id), { code: 'not_found' });
        respond = normal;
        await generate();
        state = await latest();
        assert.equal(state.p.days.length, 7);
        assert.equal(calls, before + 2);
        assert.deepEqual(state.s.summary.document[0].goals, [
          'Comfortable walking',
          'General strength',
        ]);
        if (partial) assert.equal(await originalDay(), oldDay);
      }
    },
  );
  await t.test('editing goal prose cannot silently retain stale planner identities', async () => {
    const { s, p } = await latest(),
      oldDays = structuredClone(p.days),
      changed = structuredClone(s.summary.document);
    changed[0].text = 'Comfortable walking first, and learning to juggle.';
    await store.edit(alice, s.summary.revision, changed, 'UTC');
    const result = await store.read(alice);
    assert.equal(result.summary.document[0].goals, undefined);
    assert.deepEqual(result.plans.find((x) => x.id === p.id).days, oldDays);
  });
}
