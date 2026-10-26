import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from '../../features/account/profileStore.js';
import { journalStore } from '../../features/journal/journalStore.js';
import { planningStore } from '../../features/planning/planningStore.js';
import { intakeSummary } from '../../features/onboarding/fixedIntake.js';
import {
  documentFixture,
  rowDocumentFixture,
  nutritionDocumentFixture,
  journalDocumentFixture,
} from './documentPlanFixture.js';
import { trainingTestResetStatements } from './trainingTestReset.js';
import type { JournalCommand } from '../../shared/journalContract.js';
export async function verifyJournalDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  const store = journalStore(pool);
  async function fresh(version = 'document-week-v4') {
    const a = { userId: randomUUID(), sessionId: randomUUID() };
    await owner.query('INSERT INTO auth.users VALUES($1)', [a.userId]);
    await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
      a.sessionId,
      a.userId,
    ]);
    await profiles.save(a, {
      firstName: 'Synthetic',
      lastName: 'Journal',
      age: 30,
      height: { value: 68, unit: 'in' },
      weight: { value: 155, unit: 'lb' },
      gender: 'Unspecified',
    });
    await owner.query(
      "INSERT INTO fitquest.training_summaries(user_id,revision,document,time_zone) VALUES($1,1,$2,'UTC')",
      [
        a.userId,
        JSON.stringify(
          intakeSummary({
            version: 1,
            answers: ['Strength', 'Walking', 'Dumbbells', 'Flexible', 'None'],
          }),
        ),
      ],
    );
    const plan = (await planningStore(pool).ensurePlan(a, 1)).plans[0]!;
    const dates = plan.dates;
    const document = (
      version === 'document-week-v1'
        ? documentFixture
        : version === 'document-week-v2'
          ? rowDocumentFixture
          : version === 'document-week-v3'
            ? nutritionDocumentFixture
            : journalDocumentFixture
    )(dates);
    const history = [
      { revision: 1, schemaVersion: version, acceptedAt: '2026-10-05T12:00:00Z', plan: document },
    ];
    await owner.query(
      "UPDATE fitquest.training_plans SET schema_version=$3,document_plan=$4,document_history=$5,review_revision=1,review_state='accepted',accepted_at=now() WHERE user_id=$1 AND id=$2",
      [a.userId, plan.id, version, document, JSON.stringify(history)],
    );
    const cmd: JournalCommand = {
      operationId: randomUUID(),
      kind: 'begin',
      source: { planId: plan.id, revision: 1, date: dates[0]!, sessionIndex: 0 },
      repeat: false,
      title: 'Forged title ignored',
      performedDate: '2026-10-05',
      timeZone: 'America/New_York',
    };
    return { a, plan, document, history, cmd };
  }
  await t.test(
    'v2 notes and confirmation roundtrip with receipts; a v1 save cannot erase them',
    async () => {
      const f = await fresh(),
        receipt = await store.command(f.a, f.cmd),
        j = await store.read(f.a, receipt.journalId);
      const doc = {
        ...j.document,
        version: 2 as const,
        results: j.document.results.map((r) => ({
          ...r,
          notes: 'Synthetic exercise feedback',
          groups: r.groups.map((g) => ({ ...g, sets: 1, confirmed: false })),
        })),
      };
      const command = {
        operationId: randomUUID(),
        kind: 'save' as const,
        journalId: j.id,
        expectedRevision: j.revision,
        document: doc,
      };
      const saved = await store.command(f.a, command);
      assert.deepEqual(await store.command(f.a, command), saved);
      assert.equal(
        (await store.read(f.a, j.id)).document.results[0]!.notes,
        'Synthetic exercise feedback',
      );
      await assert.rejects(
        store.command(f.a, {
          operationId: randomUUID(),
          kind: 'save',
          journalId: j.id,
          expectedRevision: saved.revision,
          document: j.document,
        }),
        { code: 'journal_client_update_required' },
      );
      assert.equal((await store.read(f.a, j.id)).revision, saved.revision);
    },
  );
  await t.test(
    'session action state uses actual input and latest exact occurrence, without exposing notes or values',
    async () => {
      const f = await fresh(),
        other = await fresh();
      assert.equal((await store.sessionStates(f.a, f.plan.id, 1)).sessions.length, 0);
      const receipt = await store.command(f.a, f.cmd);
      const j = await store.read(f.a, receipt.journalId);
      const initial = (await store.sessionStates(f.a, f.plan.id, 1)).sessions[0]!;
      assert.equal(initial.hasWork, false);
      assert.equal(initial.finished, false);
      await store.command(f.a, {
        operationId: randomUUID(),
        kind: 'save',
        journalId: j.id,
        expectedRevision: j.revision,
        document: { ...j.document, notes: 'Synthetic private note' },
      });
      const state = await store.sessionStates(f.a, f.plan.id, 1);
      assert.equal(state.sessions[0]!.hasWork, true);
      assert(!JSON.stringify(state).includes('Synthetic private note'));
      assert.equal((await store.sessionStates(f.a, f.plan.id, 2)).sessions.length, 0);
      await assert.rejects(store.sessionStates(other.a, f.plan.id, 1), {
        code: 'journal_source_unavailable',
      });
      await store.command(f.a, { ...f.cmd, operationId: randomUUID(), repeat: true });
      assert.equal((await store.sessionStates(f.a, f.plan.id, 1)).sessions[0]!.hasWork, false);
    },
  );
  await t.test(
    'completion is explicit, source-scoped, deduplicated and updated by reopening',
    async () => {
      const f = await fresh(),
        other = await fresh();
      const empty = { planId: f.plan.id, revision: 1, sessions: [] };
      assert.deepEqual(await store.completedSessions(f.a, f.plan.id, 1), empty);
      const receipt = await store.command(f.a, f.cmd);
      let j = await store.read(f.a, receipt.journalId);
      const save = async (outcome: typeof j.document.outcome) => {
        await store.command(f.a, {
          operationId: randomUUID(),
          kind: 'save',
          journalId: j.id,
          expectedRevision: j.revision,
          document: { ...j.document, outcome },
        });
        j = await store.read(f.a, j.id);
      };
      for (const outcome of ['in_progress', 'partial', 'skipped'] as const) {
        await save(outcome);
        assert.deepEqual(await store.completedSessions(f.a, f.plan.id, 1), empty);
      }
      await save('completed');
      const done = { ...empty, sessions: [{ date: f.plan.dates[0], sessionIndex: 0 }] };
      assert.deepEqual(await store.completedSessions(f.a, f.plan.id, 1), done);
      assert.deepEqual(await store.completedSessions(f.a, f.plan.id, 2), { ...empty, revision: 2 });
      assert.deepEqual(await store.completedSessions(other.a, other.plan.id, 1), {
        planId: other.plan.id,
        revision: 1,
        sessions: [],
      });
      await assert.rejects(store.completedSessions(other.a, f.plan.id, 1), {
        code: 'journal_source_unavailable',
      });
      assert.throws(() => store.completedSessions(f.a, f.plan.id, 0), { code: 'invalid_request' });
      await save('in_progress');
      assert.deepEqual(await store.completedSessions(f.a, f.plan.id, 1), empty);
      await save('completed');
      const repeated = await store.command(f.a, {
        ...f.cmd,
        operationId: randomUUID(),
        repeat: true,
      });
      // An unfinished repeat doesn't erase a completed occurrence.
      assert.deepEqual(await store.completedSessions(f.a, f.plan.id, 1), done);
      const repeat = await store.read(f.a, repeated.journalId);
      await store.command(f.a, {
        operationId: randomUUID(),
        kind: 'save',
        journalId: repeat.id,
        expectedRevision: repeat.revision,
        document: { ...repeat.document, outcome: 'completed' },
      });
      assert.deepEqual(await store.completedSessions(f.a, f.plan.id, 1), done);
      // Completion reads aren't capped by the paginated history page.
      for (let i = 0; i < 51; i++)
        await store.command(f.a, { ...f.cmd, operationId: randomUUID(), source: null });
      assert.equal((await store.list(f.a)).items.length, 50);
      assert.deepEqual(await store.completedSessions(f.a, f.plan.id, 1), done);
      await owner.query('DELETE FROM auth.sessions WHERE id=$1', [f.a.sessionId]);
      await assert.rejects(store.completedSessions(f.a, f.plan.id, 1), { code: 'session_ended' });
    },
  );
  await t.test(
    'journal captures exact accepted history and app IDs; no AI/ledger, repeat only deliberately, snapshots survive reordering and exact reset',
    async () => {
      const f = await fresh();
      const ledger = async () =>
          (
            await owner.query(
              'SELECT to_jsonb(a) AS v FROM fitquest.onboarding_attempts a ORDER BY user_id,id',
            )
          ).rows,
        budget = async () => (await owner.query('SELECT * FROM fitquest.ai_budget')).rows;
      const before = await ledger(),
        beforeBudget = await budget();
      const [r, r2] = await Promise.all([store.command(f.a, f.cmd), store.command(f.a, f.cmd)]);
      assert.deepEqual(r, r2);
      const j = await store.read(f.a, r.journalId);
      assert.equal(j.document.title, 'Skill and strength');
      assert(
        j.document.results.every(
          (x) =>
            x.completed === null &&
            x.groups.every((g) => g.weight === null && g.sets === null && g.reps === null),
        ),
      );
      assert.equal(j.snapshot.exercises[1]!.mode, 'weighted_reps');
      assert.equal(j.snapshot.exercises[4]!.mode, 'reps');
      assert.equal(
        (await store.command(f.a, { ...f.cmd, operationId: randomUUID() })).journalId,
        j.id,
      );
      assert.notEqual(
        (await store.command(f.a, { ...f.cmd, operationId: randomUUID(), repeat: true })).journalId,
        j.id,
      );
      const revised = structuredClone(f.document);
      revised.days[0]!.sessions.reverse();
      await owner.query(
        "UPDATE fitquest.training_plans SET document_plan=$3,review_revision=2,review_state='draft',accepted_at=NULL WHERE user_id=$1 AND id=$2",
        [f.a.userId, f.plan.id, revised],
      );
      assert.deepEqual((await store.read(f.a, j.id)).snapshot, j.snapshot);
      await assert.rejects(
        store.command(f.a, {
          ...f.cmd,
          operationId: randomUUID(),
          source: { ...f.cmd.source!, revision: 2 },
        }),
        { code: 'journal_source_unavailable' },
      );
      const snapshot = (
        await owner.query(
          'SELECT to_jsonb(j) AS v FROM fitquest.workout_journals j WHERE user_id=$1 ORDER BY id',
          [f.a.userId],
        )
      ).rows;
      const receipts = (
        await owner.query(
          'SELECT to_jsonb(j) AS v FROM fitquest.workout_journal_operations j WHERE user_id=$1 ORDER BY id',
          [f.a.userId],
        )
      ).rows;
      const c = await owner.connect();
      try {
        await c.query('BEGIN');
        await c.query('SET CONSTRAINTS ALL DEFERRED');
        for (const sql of trainingTestResetStatements) await c.query(sql, [f.a.userId]);
        await c.query('COMMIT');
      } finally {
        c.release();
      }
      assert.deepEqual(
        (
          await owner.query(
            'SELECT to_jsonb(j) AS v FROM fitquest.workout_journals j WHERE user_id=$1 ORDER BY id',
            [f.a.userId],
          )
        ).rows,
        snapshot,
      );
      assert.deepEqual(
        (
          await owner.query(
            'SELECT to_jsonb(j) AS v FROM fitquest.workout_journal_operations j WHERE user_id=$1 ORDER BY id',
            [f.a.userId],
          )
        ).rows,
        receipts,
      );
      assert.equal((await store.list(f.a)).items.length, 2);
      assert.deepEqual(await store.readOperation(f.a, r.id), r);
      assert.deepEqual((await store.read(f.a, j.id)).snapshot, j.snapshot);
      const d = structuredClone(j.document);
      d.notes = 'Private journal note never sent to a provider';
      d.results[1]!.groups[0]!.weight = 0;
      d.outcome = 'partial';
      await store.command(f.a, {
        operationId: randomUUID(),
        kind: 'save',
        journalId: j.id,
        expectedRevision: 1,
        document: d,
      });
      assert.deepEqual(await ledger(), before);
      assert.deepEqual(await budget(), beforeBudget);
    },
  );
  await t.test(
    'journal saves blank versus zero, differing groups, retained mode data, explicit outcomes and actual dates; idempotency, stale edits and ownership',
    async () => {
      const f = await fresh(),
        other = await fresh(),
        r = await store.command(f.a, f.cmd),
        j = await store.read(f.a, r.journalId),
        d = structuredClone(j.document);
      const row = d.results[1]!;
      Object.assign(row.groups[0]!, { weight: 0, sets: 2, reps: 8 });
      row.groups.push({
        id: randomUUID(),
        weight: 35,
        sets: 1,
        reps: 6,
        unit: 'lb',
        removed: false,
      });
      row.mode = 'completion';
      row.completed = true;
      d.outcome = 'completed';
      d.performedDate = '2026-10-06';
      const cmd: JournalCommand = {
        operationId: randomUUID(),
        kind: 'save',
        journalId: j.id,
        expectedRevision: 1,
        document: d,
      };
      const receipt = await store.command(f.a, cmd);
      assert.deepEqual(await store.command(f.a, cmd), receipt);
      const after = await store.read(f.a, j.id);
      assert.equal(after.document.results[1]!.groups[0]!.weight, 0);
      assert.equal(after.document.results[0]!.completed, null);
      assert.equal(after.document.performedDate, '2026-10-06');
      assert.equal(after.snapshot.source!.date, f.cmd.source!.date);
      await assert.rejects(store.command(f.a, { ...cmd, document: { ...d, notes: 'changed' } }), {
        code: 'operation_conflict',
      });
      await assert.rejects(store.command(f.a, { ...cmd, operationId: randomUUID() }), {
        code: 'journal_changed',
      });
      await assert.rejects(store.command(other.a, { ...cmd, operationId: randomUUID() }), {
        code: 'journal_missing',
      });
      await assert.rejects(store.read(other.a, j.id), { code: 'journal_missing' });
      await assert.rejects(store.readOperation(other.a, receipt.id), {
        code: 'journal_operation_missing',
      });
      d.outcome = 'skipped';
      await store.command(f.a, {
        ...cmd,
        operationId: randomUUID(),
        expectedRevision: 2,
        document: d,
      });
      d.outcome = 'in_progress';
      d.results[1]!.mode = 'weighted_reps';
      d.results[1]!.groups[1]!.removed = true;
      await store.command(f.a, {
        ...cmd,
        operationId: randomUUID(),
        expectedRevision: 3,
        document: d,
      });
      const reopened = await store.read(f.a, j.id);
      assert.equal(reopened.document.results[1]!.groups[1]!.reps, 6);
      assert.equal(reopened.document.results[1]!.completed, true);
      const lost = structuredClone(d);
      lost.results.pop();
      await assert.rejects(
        store.command(f.a, {
          ...cmd,
          operationId: randomUUID(),
          expectedRevision: 4,
          document: lost,
        }),
        { code: 'journal_identity_changed' },
      );
      for (const role of ['anon', 'authenticated', 'service_role'])
        for (const table of ['workout_journals', 'workout_journal_operations'])
          assert.equal(
            (
              await owner.query("SELECT has_table_privilege($1,$2,'SELECT') AS ok", [
                role,
                'fitquest.' + table,
              ])
            ).rows[0].ok,
            false,
          );
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('fitquest.user_id',$1,true)", [other.a.userId]);
        assert.equal(
          (await c.query('SELECT * FROM fitquest.workout_journals WHERE id=$1', [j.id])).rowCount,
          0,
        );
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
      assert.equal(
        (
          await owner.query(
            "SELECT has_column_privilege('fitquest_app','fitquest.workout_journals','snapshot','UPDATE') AS ok",
          )
        ).rows[0].ok,
        false,
      );
      await owner.query('DELETE FROM auth.sessions WHERE id=$1', [f.a.sessionId]);
      await assert.rejects(store.read(f.a, j.id), { code: 'session_ended' });
    },
  );
  await t.test(
    'legacy v1-v3 prescriptions remain exact without parsing; unplanned activities and all history remain independent',
    async () => {
      for (const version of ['document-week-v1', 'document-week-v2', 'document-week-v3']) {
        const f = await fresh(version),
          r = await store.command(f.a, f.cmd),
          j = await store.read(f.a, r.journalId);
        assert.deepEqual(j.snapshot.session, f.document.days[0]!.sessions[0]);
        if (version === 'document-week-v1') {
          assert.equal(j.document.results.length, 0);
          assert.match(j.snapshot.workoutMarkdown!, /Crab reach/);
        } else assert(j.document.results.every((r) => r.mode === 'completion'));
        const unplanned = await store.command(f.a, {
          ...f.cmd,
          operationId: randomUUID(),
          source: null,
          title: 'Named tennis practice',
        });
        const x = await store.read(f.a, unplanned.journalId);
        x.document.results.push({
          id: randomUUID(),
          name: 'Serve practice',
          mode: 'completion',
          groups: [
            { id: randomUUID(), weight: null, sets: null, reps: null, unit: 'lb', removed: false },
          ],
          completed: true,
          removed: false,
        });
        await store.command(f.a, {
          operationId: randomUUID(),
          kind: 'save',
          journalId: x.id,
          expectedRevision: 1,
          document: x.document,
        });
        assert.equal((await store.list(f.a)).items.length, 2);
      }
    },
  );
  await t.test('journal mutation and receipt commit atomically under failures', async () => {
    const f = await fresh();
    await owner.query(
      `CREATE FUNCTION fitquest.fail_journal_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;CREATE CONSTRAINT TRIGGER fail_journal_test AFTER INSERT ON fitquest.workout_journal_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.user_id='${f.a.userId}'::uuid) EXECUTE FUNCTION fitquest.fail_journal_test();`,
    );
    try {
      await assert.rejects(store.command(f.a, f.cmd));
      assert.equal((await store.list(f.a)).items.length, 0);
      await assert.rejects(store.readOperation(f.a, f.cmd.operationId), {
        code: 'journal_operation_missing',
      });
    } finally {
      await owner.query(
        'DROP TRIGGER fail_journal_test ON fitquest.workout_journal_operations;DROP FUNCTION fitquest.fail_journal_test()',
      );
    }
    await store.command(f.a, f.cmd);
    assert.equal((await store.list(f.a)).items.length, 1);
  });
}
