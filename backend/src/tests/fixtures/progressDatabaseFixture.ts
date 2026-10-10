import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from '../../features/account/profileStore.js';
import { planningStore } from '../../features/planning/planningStore.js';
import { planningService } from '../../features/planning/planning.js';
import { planDates } from '../../features/planning/trainingSummary.js';
import { intakeSummary } from '../../features/onboarding/fixedIntake.js';
import { journalDocumentFixture } from './documentPlanFixture.js';
import { planningConsentVersion, planningConsentScope } from '../../shared/planningConsent.js';
import { historyConsentVersion, historyConsentScope } from '../../shared/progressConsent.js';
import {
  captureProgress,
  shiftDate,
  nextWeekDates,
} from '../../features/weekly-planning/progressContext.js';
import { journalStore } from '../../features/journal/journalStore.js';
import { weightStore } from '../../features/weight/weightStore.js';
import type { OnboardingProvider } from '../../ai/onboardingProvider.js';
export async function verifyProgressDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  const store = planningStore(pool),
    now = new Date(),
    dates = planDates('America/New_York', now),
    upcoming = nextWeekDates('America/New_York', now),
    permission = {
      version: historyConsentVersion,
      scope: historyConsentScope,
      granted: true,
      expectedRevision: 0,
    };
  const answers = [
    'Strength, endurance and abs',
    'Lift and run',
    'Dumbbells, cable machine',
    'Multiple sessions when useful',
    'Tender elbow; avoid aggravating it',
  ];
  async function fresh() {
    const a = { userId: randomUUID(), sessionId: randomUUID() };
    await owner.query('INSERT INTO auth.users VALUES($1)', [a.userId]);
    await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
      a.sessionId,
      a.userId,
    ]);
    await profiles.save(a, {
      firstName: 'Private',
      lastName: 'Identity',
      age: 30,
      height: { value: 68, unit: 'in' },
      weight: { value: 155, unit: 'lb' },
      gender: 'Unspecified',
    });
    await owner.query(
      "INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone) VALUES($1,1,$2,'America/New_York')",
      [a.userId, JSON.stringify(intakeSummary({ version: 1, answers }))],
    );
    const p = (await store.ensurePlan(a, 1)).plans[0];
    const document = journalDocumentFixture(dates);
    await owner.query(
      'UPDATE fitquest.training_plans SET document_plan=$2,review_revision=1 WHERE user_id=$1',
      [a.userId, JSON.stringify(document)],
    );
    await store.accept(a, { planId: p.id, summaryRevision: 1, planRevision: 1 });
    await store.consent(a, {
      version: planningConsentVersion,
      scope: planningConsentScope,
      granted: true,
      expectedRevision: 0,
    });
    return { a, p, document };
  }
  const journal = journalStore(pool),
    weights = weightStore(pool);
  async function log(a: any, date: string, notes: string) {
    const receipt = await journal.command(a, {
      kind: 'begin',
      operationId: randomUUID(),
      source: null,
      repeat: false,
      title: 'Actual mixed session',
      performedDate: date,
      timeZone: 'America/New_York',
    });
    const row = await journal.read(a, receipt.journalId);
    await journal.command(a, {
      kind: 'save',
      operationId: randomUUID(),
      journalId: row.id,
      expectedRevision: row.revision,
      document: {
        ...row.document,
        outcome: 'partial',
        notes,
        results: [
          {
            id: randomUUID(),
            name: 'Dumbbell squat',
            mode: 'weighted_reps',
            completed: null,
            removed: false,
            groups: [
              { id: randomUUID(), sets: 3, reps: 8, weight: 140, unit: 'lb', removed: false },
            ],
          },
          {
            id: randomUUID(),
            name: 'Push-up',
            mode: 'reps',
            completed: null,
            removed: false,
            groups: [
              { id: randomUUID(), sets: 2, reps: 10, weight: null, unit: 'lb', removed: false },
            ],
          },
          {
            id: randomUUID(),
            name: 'Easy movement',
            mode: 'completion',
            completed: true,
            removed: false,
            groups: [
              {
                id: randomUUID(),
                sets: null,
                reps: null,
                weight: null,
                unit: 'lb',
                removed: false,
              },
            ],
          },
        ],
      },
    });
    return journal.read(a, row.id);
  }
  function mock() {
    const bodies: string[] = [];
    let fail = false;
    const provider: OnboardingProvider = {
      mode: 'test',
      model: 'gpt-6.1-sol',
      capMicro: 7000000,
      prepare() {
        throw Error('No extra AI call');
      },
      cost: (u) => (u.input + u.output ? 10 : 0),
      call: async (body) => {
        bodies.push(body);
        return fail
          ? { failure: 'provider_error' }
          : {
              proposal: {
                version: 1,
                result: { kind: 'plan', plan: journalDocumentFixture(upcoming) },
              },
              usage: { input: 10, output: 10, cached: 0, cacheWrite: 0 },
            };
      },
    };
    return {
      bodies,
      provider,
      service: planningService(store, provider, 'test'),
      fail: () => {
        fail = true;
      },
      succeed: () => {
        fail = false;
      },
    };
  }
  await t.test(
    'next-week consent, faithful frozen history, one dispatch, duplicate reopen and date-isolated acceptance',
    async () => {
      const f = await fresh(),
        other = await fresh(),
        m = mock(),
        op = {
          operationId: randomUUID(),
          changes: 'Travel Tuesday; keep useful separate sessions',
        };
      await assert.rejects(store.ensureNextWeek(f.a, op), { code: 'history_consent_required' });
      await store.historyConsent(f.a, { ...permission, granted: false });
      await assert.rejects(store.ensureNextWeek(f.a, op), { code: 'history_consent_required' });
      await store.historyConsent(f.a, { ...permission, expectedRevision: 1 });
      assert.equal((await store.read(other.a)).historyConsent, null);
      const recorded = await log(
        f.a,
        dates[0]!,
        'Cable substitution; load basis unknown. Elbow discomfort, stopped early.',
      );
      await log(f.a, shiftDate(dates[0]!, -7), 'Older evidence, different machine.');
      await weights.command(f.a, {
        operationId: randomUUID(),
        kind: 'save',
        entryId: null,
        expectedRevision: null,
        measurement: { value: 70.125, unit: 'kg', date: dates[0]!, timeZone: 'UTC' },
      });
      const [a, b] = await Promise.all([
        store.ensureNextWeek(f.a, op),
        store.ensureNextWeek(f.a, { ...op, operationId: randomUUID() }),
      ]);
      assert.equal(a.nextPlanId, b.nextPlanId);
      assert.equal(a.summary!.revision, 1);
      assert.equal(a.plans.length, 2);
      const id = a.nextPlanId;
      assert.equal((await store.ensureNextWeek(f.a, op, new Date('2027-01-02'))).nextPlanId, id);
      const hidden = a.plans.find((p) => p.id === id)!;
      assert(!JSON.stringify(hidden).includes('Elbow discomfort'));
      assert(!JSON.stringify(hidden).includes('prescribedReference'));
      const r = { planId: id, summaryRevision: 1, target: 'week', retryAttempt: null };
      await assert.rejects(
        m.service.generate(other.a, r, async () => true),
        { code: 'not_found' },
      );
      await journal.command(f.a, {
        kind: 'save',
        operationId: randomUUID(),
        journalId: recorded.id,
        expectedRevision: recorded.revision,
        document: { ...recorded.document, notes: 'Late note: still sore' },
      });
      assert.equal((await store.read(f.a)).plans.find((p) => p.id === id)!.contextChanged, true);
      await Promise.all([
        m.service.generate(f.a, r, async () => true),
        m.service.generate(f.a, r, async () => true),
      ]);
      assert.equal(m.bodies.length, 1);
      const req = JSON.parse(m.bodies[0]!);
      assert.deepEqual(req.reasoning, { effort: 'low' });
      assert.equal(req.model, 'gpt-6.1-sol');
      assert.equal(req.max_output_tokens, 48000);
      assert.equal(req.text.format.name, 'document_result_v1');
      assert(answers.every((x) => req.input.includes(x)));
      assert(req.input.includes('Elbow discomfort'));
      assert(!req.input.includes('Late note:'));
      assert(req.input.includes('Older evidence'));
      assert(req.input.includes('70.125'));
      assert(req.input.includes('140'));
      assert(req.instructions.includes('load basis'));
      assert(!req.input.includes(f.a.userId));
      assert(!req.input.includes(recorded.id));
      assert(!req.input.includes('Private'));
      const currentTarget = await store.nutrition(f.a, dates[0]!);
      assert.equal((await store.nutrition(f.a, upcoming[0]!)).target, null);
      await store.accept(f.a, { planId: id, summaryRevision: 1, planRevision: 1 });
      assert.deepEqual(await store.nutrition(f.a, dates[0]!), currentTarget);
      assert.equal((await store.nutrition(f.a, upcoming[0]!)).target!.planId, id);
      assert.equal(
        (await store.read(f.a)).plans.find((p) => p.id === f.p.id)!.reviewState,
        'accepted',
      );
      await m.service.generate(f.a, r, async () => true);
      assert.equal(m.bodies.length, 1);
      await store.historyConsent(f.a, { ...permission, granted: false, expectedRevision: 2 });
      assert.equal((await store.ensureNextWeek(f.a, op)).nextPlanId, id);
      assert.equal((await store.read(f.a)).plans.find((p) => p.id === id)!.reviewState, 'accepted');
      assert.equal(m.bodies.length, 1);
    },
  );
  await t.test(
    'progress retries freeze dates/context; revisions refresh explicitly, preserve accepted history on failure and obey withdrawn permission',
    async () => {
      const f = await fresh(),
        m = mock();
      await store.historyConsent(f.a, permission);
      const next = await store.ensureNextWeek(f.a, { operationId: randomUUID(), changes: '' }),
        id = next.nextPlanId,
        r = { planId: id, summaryRevision: 1, target: 'week', retryAttempt: null as string | null };
      m.fail();
      await m.service.generate(f.a, r, async () => true);
      let p = (await store.read(f.a)).plans.find((p) => p.id === id)!;
      r.retryAttempt = p.jobs[0].attemptId;
      await log(f.a, dates[0]!, 'New feedback after failed request');
      m.succeed();
      await m.service.generate(f.a, r, async () => true);
      assert.equal(m.bodies.length, 2);
      assert.equal(m.bodies[0], m.bodies[1]);
      await store.accept(f.a, { planId: id, summaryRevision: 1, planRevision: 1 });
      const target = await store.nutrition(f.a, upcoming[0]!);
      const review = {
        planId: id,
        summaryRevision: 1,
        planRevision: 1,
        feedback: 'Include my new feedback; keep the sessions.',
        retryAttempt: null as string | null,
      };
      m.fail();
      await m.service.review(f.a, review, async () => true);
      assert(JSON.parse(m.bodies[2]!).input.includes('New feedback'));
      assert.deepEqual(await store.nutrition(f.a, upcoming[0]!), target);
      p = (await store.read(f.a)).plans.find((p) => p.id === id)!;
      review.retryAttempt = p.jobs.find((j: any) => j.target === 'review:1').attemptId;
      m.succeed();
      const work = await store.claimReview(f.a, review, m.provider);
      assert(work);
      await store.historyConsent(f.a, { ...permission, granted: false, expectedRevision: 1 });
      assert.equal(await store.canDispatch(f.a, work), false);
      await store.settle(f.a, work.attempt, 0);
      await store.finish(f.a, work, undefined, 'history_consent_required');
      assert.deepEqual(await store.nutrition(f.a, upcoming[0]!), target);
      await store.historyConsent(f.a, { ...permission, expectedRevision: 2 });
      review.retryAttempt = work.attempt;
      await m.service.review(f.a, review, async () => true);
      assert.equal(m.bodies.length, 4);
      assert.equal(m.bodies[2], m.bodies[3]);
      p = (await store.read(f.a)).plans.find((p) => p.id === id)!;
      assert(p.acceptedDocument);
      assert.equal(p.documentPlan, null);
      await store.accept(f.a, { planId: id, summaryRevision: 1, planRevision: 2 });
      assert.equal(
        (
          await owner.query(
            'SELECT jsonb_array_length(document_history) AS n FROM fitquest.training_plans WHERE id=$1',
            [id],
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await t.test(
    'context bounds preserve all recent notes or fail before dispatch; sparse history uses labeled profile fallback',
    async () => {
      const f = await fresh();
      await store.historyConsent(f.a, permission);
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('fitquest.user_id',$1,true)", [f.a.userId]);
        const s = await captureProgress(
          c,
          f.a.userId,
          upcoming,
          'America/New_York',
          intakeSummary({ version: 1, answers }),
          { age: 30, heightInches: 68, weightLb: 155, gender: 'Unspecified' },
          '',
          now,
        );
        const p = s.input.progress as any;
        assert.equal(p.endingWeek.length, 0);
        assert.equal(p.bodyWeight.source, 'saved profile; measurement date unknown');
        assert.equal(p.bodyWeight.date, undefined);
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
      for (let i = 0; i < 65; i++) await log(f.a, dates[0]!, 'Recent note ' + i);
      await assert.rejects(store.ensureNextWeek(f.a, { operationId: randomUUID(), changes: '' }), {
        code: 'progress_context_limit',
      });
      assert.equal(
        (
          await owner.query(
            'SELECT count(*)::int n FROM fitquest.onboarding_attempts WHERE user_id=$1',
            [f.a.userId],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    'saved weeks paginate without losing current-date access or altering intake; scoped additions keep private RLS',
    async () => {
      const f = await fresh();
      for (let i = 1; i <= 22; i++) {
        const oldDates = dates.map((d) => shiftDate(d, -7 * i)),
          doc = journalDocumentFixture(oldDates);
        await owner.query(
          `INSERT INTO fitquest.training_plans(user_id,id,summary_revision,summary,time_zone,dates,catalog_version,outline_first,schema_version,document_plan,document_history,review_revision,review_state,accepted_at,created_at) VALUES($1,$2,$3,$4,'America/New_York',$5,'synthetic',false,'document-week-v4',$6,$7,1,'accepted',now()-($3::int*interval '1 day'),now()-($3::int*interval '1 day'))`,
          [
            f.a.userId,
            randomUUID(),
            i + 1,
            JSON.stringify(intakeSummary({ version: 1, answers })),
            JSON.stringify(oldDates),
            JSON.stringify(doc),
            JSON.stringify([
              {
                schemaVersion: 'document-week-v4',
                revision: 1,
                acceptedAt: new Date().toISOString(),
                plan: doc,
              },
            ]),
          ],
        );
      }
      const first = await store.read(f.a);
      assert.equal(first.plans[0]!.id, f.p.id);
      assert.equal(first.plans.length, 20);
      assert.equal(first.nextOffset, 20);
      const second = await store.read(f.a, first.nextOffset!);
      assert.equal(second.plans.length, 3);
      assert.equal(second.nextOffset, null);
      assert.equal(new Set([...first.plans, ...second.plans].map((p) => p.id)).size, 23);
      assert.equal(first.summary!.revision, 1);
      for (const table of ['training_plans', 'training_generations', 'profiles']) {
        const r = (
          await owner.query(
            'SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',
            ['fitquest.' + table],
          )
        ).rows[0];
        assert(r.relrowsecurity && r.relforcerowsecurity);
        for (const role of ['anon', 'authenticated', 'service_role'])
          assert.equal(
            (
              await owner.query("SELECT has_table_privilege($1,$2,'SELECT') AS ok", [
                role,
                'fitquest.' + table,
              ])
            ).rows[0].ok,
            false,
          );
      }
    },
  );
}
