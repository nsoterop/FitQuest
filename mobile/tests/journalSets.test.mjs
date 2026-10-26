import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(s, c, n) {
    try {
      return n(s, c);
    } catch (e) {
      if (s.startsWith('.') && !s.endsWith('.ts')) return n(s + '.ts', c);
      throw e;
    }
  },
});
const { editableJournal, loggingFor, confirmSet, suggestion, restoreJournalDraft } =
  await import('../src/features/journal/journalSets.ts');
const { validJournalDocument, resultLogged } =
  await import('../../backend/src/shared/journalContract.ts');
function fixture() {
  const result = {
    id: randomUUID(),
    name: 'Synthetic lift',
    mode: 'weighted_reps',
    groups: [
      { id: randomUUID(), weight: null, sets: null, reps: null, unit: 'lb', removed: false },
    ],
    completed: null,
    removed: false,
  };
  return {
    document: {
      version: 1,
      title: 'Synthetic',
      performedDate: '2026-10-04',
      timeZone: 'UTC',
      outcome: 'in_progress',
      notes: '',
      results: [result],
    },
    snapshot: {
      exercises: [
        {
          id: result.id,
          name: result.name,
          mode: result.mode,
          prescription: '3 × 6–8 at 20 lb per dumbbell; rest 60 seconds.',
        },
      ],
    },
  };
}
test('known recommendations seed rows with blank actuals and confirmation never selects a range point', () => {
  const j = fixture(),
    before = structuredClone(j),
    doc = editableJournal(j, randomUUID),
    r = doc.results[0],
    hint = loggingFor(j, r.id);
  assert(validJournalDocument(doc));
  assert.equal(r.groups.length, 3);
  assert.equal(resultLogged(r), false);
  assert.equal(suggestion(hint, r.groups[0], 'reps'), '6–8');
  assert.equal(confirmSet(r.groups[0], {}, r.id, hint, true), null);
  const fields = { [`${r.id}:${r.groups[0].id}:reps`]: '7' };
  const actual = confirmSet(r.groups[0], fields, r.id, hint, true);
  assert.equal(actual.weight, 20);
  assert.equal(actual.reps, 7);
  assert.equal(actual.confirmed, true);
  assert.equal(r.groups[0].weight, null);
  assert.deepEqual(j, before);
});
test('legacy actual groups expand only when unambiguous and retain original identity, units and total dose in a view copy', () => {
  const j = fixture(),
    g = j.document.results[0].groups[0];
  g.weight = 12.5;
  g.sets = 3;
  g.reps = 8;
  g.unit = 'kg';
  const before = structuredClone(j),
    d = editableJournal(j, randomUUID),
    r = d.results[0];
  assert.equal(r.groups.length, 3);
  assert.equal(r.groups[0].id, g.id);
  assert.equal(
    r.groups.reduce((n, g) => n + g.sets * g.reps, 0),
    24,
  );
  assert(r.groups.every((g) => g.unit === 'kg' && g.weight === 12.5 && g.confirmed));
  assert.deepEqual(j, before);
  g.sets = null;
  assert.equal(editableJournal(j, randomUUID).results[0].groups.length, 1);
  assert.equal(editableJournal(j, randomUUID).results[0].groups[0].sets, null);
});
test('older encrypted drafts retain raw partial numbers and stable pending operations while upgrading set-count meaning', () => {
  const j = fixture(),
    r = j.document.results[0],
    g = r.groups[0],
    key = `${r.id}:${g.id}:`;
  const pending = {
    kind: 'save',
    operationId: randomUUID(),
    document: structuredClone(j.document),
  };
  const d = {
    key: randomUUID(),
    journal: j,
    document: structuredClone(j.document),
    source: null,
    pending,
    fields: { [key + 'sets']: '2', [key + 'weight']: '12.', [key + 'reps']: '8' },
    dirty: true,
    savedAt: 1,
  };
  const before = structuredClone(d),
    restored = restoreJournalDraft(d, randomUUID);
  assert.deepEqual(d, before);
  assert.equal(restored.document.version, 2);
  assert.equal(restored.document.results[0].groups.length, 2);
  assert(restored.document.results[0].groups.every((g) => !g.confirmed && g.reps === 8));
  assert.equal(Object.values(restored.fields).filter((v) => v === '12.').length, 2);
  assert.deepEqual(restored.pending, pending);
  const incomplete = restoreJournalDraft({ ...d, fields: { [key + 'sets']: '2.' } }, randomUUID);
  assert.equal(incomplete.fields[key + 'sets'], '2.');
});
