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
const { editableJournal, loggingFor, finishVisibleSets, suggestion, restoreJournalDraft } =
  await import('../src/features/journal/journalSets.ts');
const { acknowledgeJournal } = await import('../src/features/journal/journalEdits.ts');
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
test('known recommendations seed rows with blank actuals and Finish never selects a range point', () => {
  const j = fixture(),
    before = structuredClone(j),
    doc = editableJournal(j, randomUUID),
    r = doc.results[0],
    hint = loggingFor(j, r.id);
  assert(validJournalDocument(doc));
  assert.equal(r.groups.length, 3);
  assert.equal(resultLogged(r), false);
  assert.equal(suggestion(hint, r.groups[0], 'reps'), '6–8');
  const draft = { document: doc, journal: j, fields: {}, dirty: true };
  const unresolved = finishVisibleSets(draft);
  assert.equal(unresolved.document.results[0].groups[0].confirmed, false);
  assert.equal(Object.values(unresolved.fields)[0], '6–8');
  const fields = { [`${r.id}:${r.groups[0].id}:reps`]: '7' };
  const finished = finishVisibleSets({ ...draft, fields });
  const actual = finished.document.results[0].groups[0];
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
  const replayed = acknowledgeJournal(restored, restored, {
    ...j,
    revision: 2,
    document: pending.document,
  });
  assert.equal(replayed.document.version, 2);
  assert.equal(replayed.document.results[0].groups.length, 2);
  assert.equal(Object.values(replayed.fields).filter((v) => v === '12.').length, 2);
  assert(replayed.dirty);

  const incomplete = restoreJournalDraft({ ...d, fields: { [key + 'sets']: '2.' } }, randomUUID);
  assert.equal(incomplete.fields[key + 'sets'], '2.');
});

test('saved one-row v2 journals recover recommended rows and nullable hints without changing stored plans or actuals', () => {
  const j = fixture();
  j.document.version = 2;
  j.document.results[0].notes = '';
  Object.assign(j.document.results[0].groups[0], { sets: 1, confirmed: false });
  Object.assign(j.snapshot.exercises[0], {
    prescription: '3 sets × 8–12 reps, load: 20 kg per dumbbell; rest 60 seconds.',
    logging: { version: 1, setCount: null, reps: null, load: null, description: null },
  });
  const before = structuredClone(j),
    d = editableJournal(j, randomUUID),
    hint = loggingFor(j, j.document.results[0].id);
  assert.equal(d.results[0].groups.length, 3);
  assert(
    d.results[0].groups.every(
      (g) => g.unit === 'kg' && g.weight === null && g.reps === null && !g.confirmed,
    ),
  );
  assert.equal(suggestion(hint, d.results[0].groups[0], 'weight'), '20');
  assert.equal(suggestion(hint, d.results[0].groups[0], 'reps'), '8–12');
  assert.deepEqual(j, before);
  j.document.outcome = 'finished';
  assert.equal(editableJournal(j, randomUUID).results[0].groups.length, 1);
  j.document.outcome = 'in_progress';
  const removed = { ...j.document.results[0].groups[0], id: randomUUID(), removed: true };
  j.document.results[0].groups.push(removed);
  assert.equal(editableJournal(j, randomUUID).results[0].groups.length, 2);
});
test('legacy recommendation reader handles explicit common dose notation and keeps unknown or ambiguous loads empty', async () => {
  const { prescriptionHints } = await import('../src/features/journal/prescriptionHints.ts');
  for (const text of [
    '3 sets of 8–12 reps; rest 60 seconds.',
    '3 sets × 8–12 reps, 20 lb per hand.',
    '3 x 8-12 reps @ RPE 7.',
    'Sets: 3; Reps: 8–12; Load: 20 lb.',
  ]) {
    const hint = prescriptionHints(text, 'weighted_reps');
    assert.equal(hint.setCount, 3, text);
    assert.deepEqual(hint.reps, { min: 8, max: 12 }, text);
  }
  const hint = prescriptionHints('3 x 8 reps @ RPE 7; rest 90 seconds.', 'weighted_reps');
  assert.equal(hint.load, null);
  assert.equal(hint.setCount, 3);
  assert.equal(prescriptionHints('3 x AMRAP; rest 60 seconds.', 'reps').setCount, 3);
  for (const text of [
    '3 rounds: 8 reps then 10 reps.',
    'Superset — 3 × 8 at 20 lb.',
    '3 × 8 + 5 reps.',
    'Choose 3 or 4 sets.',
  ])
    assert.equal(prescriptionHints(text, 'weighted_reps').setCount, null, text);
  assert.equal(prescriptionHints('3 sets of 8 reps, 10 lb or 20 lb.', 'weighted_reps').load, null);
});

test('Finish records unchanged exact recommendations, preserves deliberate blanks, removals and unknown load', () => {
  const j = fixture();
  j.snapshot.exercises[0].prescription = '3 sets of 8 reps; RPE 7.';
  const document = editableJournal(j, randomUUID),
    r = document.results[0];
  r.groups[2].removed = true;
  const draft = {
    document,
    journal: j,
    fields: { [`${r.id}:${r.groups[1].id}:reps`]: '' },
    dirty: true,
  };
  const before = structuredClone(draft),
    finished = finishVisibleSets(draft);
  assert.equal(finished.document.results[0].groups[0].reps, 8);
  assert.equal(finished.document.results[0].groups[0].weight, null);
  assert.equal(finished.document.results[0].groups[0].confirmed, true);
  assert.equal(finished.document.results[0].groups[1].reps, null);
  assert.equal(finished.document.results[0].groups[1].confirmed, false);
  assert.equal(finished.document.results[0].groups[2].confirmed, false);
  assert.deepEqual(draft, before);
});
test('alternative counts or loads never become a selected exact recommendation', async () => {
  const { prescriptionHints } = await import('../src/features/journal/prescriptionHints.ts');
  const hint = prescriptionHints('Sets: 3; Reps: 8 or 12; load: 10 or 20 lb.', 'weighted_reps');
  assert.equal(hint.reps, null);
  assert.equal(hint.load, null);
});
test('Finish records the displayed preferred-unit recommendation without rewriting its source or losing incomplete units', () => {
  const j = fixture();
  j.snapshot.exercises[0].prescription = '3 x 8 at 20 lb per dumbbell';
  const doc = editableJournal(j, randomUUID),
    r = doc.results[0],
    before = structuredClone(j);
  const d = { journal: j, document: doc, fields: {} };
  const finished = finishVisibleSets(d, 'kg');
  assert.equal(finished.document.results[0].groups[0].weight, 9.07);
  assert.equal(finished.document.results[0].groups[0].unit, 'kg');
  assert.equal(finished.document.results[0].groups[0].confirmed, true);
  assert.deepEqual(j, before);
  assert.equal(d.document.results[0].groups[0].weight, null);
  const key = `${r.id}:${r.groups[0].id}:weight`;
  const incomplete = finishVisibleSets({ ...d, fields: { [key]: '12.' } }, 'kg');
  assert.equal(incomplete.fields[key], '12.');
  assert.equal(incomplete.document.results[0].groups[0].unit, 'lb');
  assert.equal(incomplete.document.results[0].groups[0].confirmed, false);
});
