import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { Pool } from 'pg';
import type { ProfileStore } from './profileStore.js';
import { foodLibraryStore } from './foodLibraryStore.js';
import { foodStore } from './foodStore.js';
import { foodFixture } from './foodFixture.js';
import { foodTotal } from './shared/foodContract.js';
import { libraryFromEntry, type LibraryCommand } from './shared/foodContract.js';
export async function verifyFoodLibraryDatabase(
  t: TestContext,
  owner: Pool,
  pool: Pool,
  profiles: ProfileStore,
) {
  const library = foodLibraryStore(pool),
    food = foodStore(pool);
  async function account() {
    const a = { userId: randomUUID(), sessionId: randomUUID() };
    await owner.query('INSERT INTO auth.users VALUES($1)', [a.userId]);
    await owner.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [
      a.sessionId,
      a.userId,
    ]);
    await profiles.save(a, {
      firstName: 'Synthetic',
      lastName: 'Recipe',
      age: 30,
      height: { value: 68, unit: 'in' },
      weight: { value: 155, unit: 'lb' },
      gender: 'Unspecified',
    });
    return a;
  }
  const create = (): LibraryCommand => ({
    operationId: randomUUID(),
    kind: 'save',
    libraryId: null,
    expectedRevision: null,
    document: { ...libraryFromEntry(foodFixture()), kind: 'recipe', yield: 3 },
  });
  await t.test(
    'library fractional servings use full precision; recipe versions preserve historical entries and free accounting',
    async () => {
      const a = await account(),
        before = (await owner.query('SELECT count(*) FROM fitquest.onboarding_attempts')).rows[0]
          .count;
      const cmd = create();
      const result = await library.command(a, cmd);
      await library.command(a, cmd);
      assert.equal((await library.read(a)).items.length, 1);
      assert.equal((await food.read(a, '2026-10-08', 'UTC')).entries.length, 0);
      const log: LibraryCommand = {
        operationId: randomUUID(),
        kind: 'log',
        libraryId: result.libraryId,
        expectedRevision: 1,
        servings: 0.5,
        date: '2026-10-08',
        time: '12:30',
        timeZone: 'UTC',
        confirmConsumed: true,
      };
      await Promise.all([library.command(a, log), library.command(a, log)]);
      const state = await food.read(a, '2026-10-08', 'UTC');
      assert.equal(state.entries.length, 1);
      const first = state.entries[0]!;
      assert.equal(foodTotal([first.document], 'calories').value, 20.576);
      assert.equal(foodTotal([first.document], 'carbs').unknown, 1);
      assert.equal(first.document.recipe?.revision, 1);
      const recipe = (await library.read(a)).items[0]!;
      recipe.document.ingredients[0]!.amount = 2;
      await library.command(a, {
        operationId: randomUUID(),
        kind: 'save',
        libraryId: recipe.id,
        expectedRevision: 1,
        document: recipe.document,
      });
      await assert.rejects(library.command(a, { ...log, operationId: randomUUID() }), {
        code: 'library_changed',
      });
      await library.command(a, { ...log, operationId: randomUUID(), expectedRevision: 2 });
      const after = await food.read(a, '2026-10-08', 'UTC');
      assert.deepEqual(after.entries.find((e) => e.id === first.id)!.document, first.document);
      assert.equal(
        foodTotal(
          after.entries.map((e) => e.document),
          'calories',
        ).value,
        61.728,
      );
      assert(after.days.every((d) => !d.complete));
      assert.equal(
        (await owner.query('SELECT count(*) FROM fitquest.onboarding_attempts')).rows[0].count,
        before,
      );
      await assert.rejects(
        food.claim(a, {
          operationId: randomUUID(),
          kind: 'save',
          entryId: null,
          expectedRevision: null,
          candidateOperation: null,
          confirmConsumed: true,
          document: first.document,
        }),
        { code: 'food_source_changed' },
      );
    },
  );
  await t.test(
    'saving an owned consumed meal preserves composition and provenance without logging it twice',
    async () => {
      const a = await account(),
        d = foodFixture();
      d.servings = 1.5;
      const saved = await food.claim(a, {
        operationId: randomUUID(),
        kind: 'save',
        document: d,
        entryId: null,
        expectedRevision: null,
        candidateOperation: null,
        confirmConsumed: true,
      });
      const c: LibraryCommand = {
        operationId: randomUUID(),
        kind: 'saveEntry',
        entryId: saved.operation.entryId!,
        expectedRevision: 1,
      };
      const r = await library.command(a, c);
      await library.command(a, c);
      const item = (await library.read(a)).items[0]!;
      assert.deepEqual(item.document, libraryFromEntry(d));
      assert.equal(item.document.defaultServings, 1.5);
      assert.equal((await food.read(a, d.date, 'UTC')).entries.length, 1);
      assert.deepEqual(await library.readOperation(a, c.operationId), r);
      await assert.rejects(library.command(a, { ...c, expectedRevision: 2 }), {
        code: 'operation_conflict',
      });
    },
  );
  await t.test(
    'library RLS and account/session/revision checks prevent cross-user recipes, receipts and stale changes',
    async () => {
      const a = await account(),
        b = await account(),
        cmd = create(),
        r = await library.command(a, cmd);
      assert.equal((await library.read(b)).items.length, 0);
      await assert.rejects(library.readOperation(b, r.id), { code: 'food_operation_missing' });
      await assert.rejects(
        library.command(b, {
          ...create(),
          kind: 'save',
          libraryId: r.libraryId,
          expectedRevision: 1,
          document: libraryFromEntry(foodFixture()),
        }),
        { code: 'library_changed' },
      );
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT set_config('fitquest.user_id',$1,true)", [b.userId]);
        assert.equal(
          (await c.query('SELECT * FROM fitquest.food_library WHERE id=$1', [r.libraryId]))
            .rowCount,
          0,
        );
        await c.query('ROLLBACK');
      } finally {
        c.release();
      }
      for (const role of ['anon', 'authenticated', 'service_role'])
        for (const table of ['food_library', 'food_library_operations'])
          assert.equal(
            (
              await owner.query("SELECT has_table_privilege($1,$2,'SELECT') AS ok", [
                role,
                'fitquest.' + table,
              ])
            ).rows[0].ok,
            false,
          );
      await owner.query('DELETE FROM auth.sessions WHERE id=$1', [a.sessionId]);
      await assert.rejects(library.read(a), { code: 'session_ended' });
    },
  );
  await t.test(
    'library rejects invented AI provenance and rolls back diary log and receipt together',
    async () => {
      const a = await account(),
        doc = libraryFromEntry(foodFixture());
      doc.ingredients[0]!.item.nutrients.protein.source = 'estimated';
      await assert.rejects(
        library.command(a, {
          operationId: randomUUID(),
          kind: 'save',
          libraryId: null,
          expectedRevision: null,
          document: doc,
        }),
        { code: 'food_source_changed' },
      );
      const r = await library.command(a, create());
      const cmd: LibraryCommand = {
        operationId: randomUUID(),
        kind: 'log',
        libraryId: r.libraryId,
        expectedRevision: 1,
        servings: 1.5,
        date: '2026-10-08',
        time: null,
        timeZone: 'UTC',
        confirmConsumed: true,
      };
      await owner.query(
        `CREATE FUNCTION fitquest.fail_library_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$; CREATE CONSTRAINT TRIGGER fail_library_test AFTER INSERT ON fitquest.food_library_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.user_id='${a.userId}'::uuid) EXECUTE FUNCTION fitquest.fail_library_test();`,
      );
      try {
        await assert.rejects(library.command(a, cmd));
        assert.equal((await food.read(a, '2026-10-08', 'UTC')).entries.length, 0);
        await assert.rejects(library.readOperation(a, cmd.operationId), {
          code: 'food_operation_missing',
        });
      } finally {
        await owner.query(
          'DROP TRIGGER fail_library_test ON fitquest.food_library_operations;DROP FUNCTION fitquest.fail_library_test()',
        );
      }
      await library.command(a, cmd);
      assert.equal((await food.read(a, '2026-10-08', 'UTC')).entries.length, 1);
    },
  );
}
