import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  libraryFromEntry,
  libraryFood,
  validLibraryDocument,
  validLibraryCommand,
} from './shared/foodContract.js';
import { foodFixture } from './foodFixture.js';
import { foodTotal, validFoodDocument } from './shared/foodContract.js';
import { buildApp } from './app.js';
test('recipe yield and ingredient scaling retain fractions, zero, unknown and provenance without premature rounding', () => {
  const document = libraryFromEntry(foodFixture());
  document.yield = 3;
  document.ingredients[0]!.amount = 0.5;
  const item = { id: randomUUID(), revision: 2, document };
  const d = libraryFood(item, 1.5, '2026-10-08', null, 'UTC');
  assert(validFoodDocument(d));
  assert(validLibraryDocument(document));
  assert.equal(foodTotal([d], 'calories').value, 30.864);
  assert.equal(foodTotal([d], 'fat').value, 0);
  assert.equal(foodTotal([d], 'carbs').unknown, 1);
  assert.equal(foodTotal([d], 'protein').value, 3.025);
  assert.equal(d.recipe?.revision, 2);
  for (const change of [{ yield: 0 }, { yield: NaN }, { ingredients: [] }, { defaultServings: -1 }])
    assert(!validLibraryDocument({ ...document, ...change }));
  assert(!validFoodDocument({ ...d, recipe: { ...d.recipe, amounts: [] } }));
});
test('library commands reject identity injection, implicit consumption, future-invalid dates and malformed revisions', () => {
  const cmd = {
    operationId: randomUUID(),
    kind: 'log',
    libraryId: randomUUID(),
    expectedRevision: 1,
    servings: 0.5,
    date: '2026-10-08',
    time: null,
    timeZone: 'UTC',
    confirmConsumed: true,
  };
  assert(validLibraryCommand(cmd));
  for (const change of [
    { userId: randomUUID() },
    { confirmConsumed: false },
    { servings: 0 },
    { servings: 0.0001 },
    { date: '2026-02-30' },
    { expectedRevision: 0 },
  ])
    assert(!validLibraryCommand({ ...cmd, ...change }));
});
test('library routes authenticate and suppress private payloads before access', async () => {
  const app = buildApp();
  try {
    for (const [method, url] of [
      ['GET', '/food-library'],
      ['GET', '/food-library/operations/' + randomUUID()],
      ['POST', '/food-library/commands'],
    ] as const) {
      const r = await app.inject({
        method,
        url,
        ...(method === 'POST' ? { payload: { private: 'meal' } } : {}),
      });
      assert.equal(r.statusCode, 401);
      assert.equal(r.headers['cache-control'], 'no-store');
      assert(!r.body.includes('meal'));
    }
  } finally {
    await app.close();
  }
});
