import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts'))
        return next(specifier + '.ts', context);
      throw error;
    }
  },
});
const { journalSourceKey, editedDocument, acknowledgeJournal } =
  await import('../src/features/journal/journalEdits.ts');
function fixture() {
  const document = {
    version: 1,
    title: 'Synthetic',
    performedDate: '2026-10-04',
    timeZone: 'UTC',
    outcome: 'in_progress',
    notes: '',
    results: [
      {
        id: randomUUID(),
        name: 'Practice',
        mode: 'weighted_reps',
        completed: null,
        removed: false,
        groups: [
          { id: randomUUID(), weight: null, sets: null, reps: null, unit: 'lb', removed: false },
        ],
      },
    ],
  };
  const source = { planId: randomUUID(), revision: 2, date: '2026-10-04', sessionIndex: 1 };
  const journal = { id: randomUUID(), revision: 1, document, snapshot: { source } };
  return {
    key: journal.id,
    journal,
    source,
    document: structuredClone(document),
    pending: null,
    fields: {},
    dirty: false,
    savedAt: 1,
  };
}
test('reproduces JSONB key-order lookup loss; exact semantic source identity excludes other sessions and revisions', () => {
  const a = fixture().source,
    b = { date: a.date, sessionIndex: a.sessionIndex, revision: a.revision, planId: a.planId };
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  assert.equal(journalSourceKey(a), journalSourceKey(b));
  for (const patch of [
    { revision: 3 },
    { sessionIndex: 2 },
    { date: '2026-10-05' },
    { planId: randomUUID() },
  ])
    assert.notEqual(journalSourceKey(a), journalSourceKey({ ...a, ...patch }));
});
test('raw partial/invalid numbers remain local, blank differs from explicit zero and valid fields compile without mutation', () => {
  const d = fixture(),
    r = d.document.results[0],
    g = r.groups[0],
    key = `${r.id}:${g.id}:weight`;
  for (const v of ['.', '12.', '-1', 'NaN', 'Infinity']) {
    d.fields[key] = v;
    assert.equal(editedDocument(d), null);
    assert.equal(d.fields[key], v);
  }
  d.fields[key] = '0';
  assert.equal(editedDocument(d).results[0].groups[0].weight, 0);
  d.fields[key] = '';
  assert.equal(editedDocument(d).results[0].groups[0].weight, null);
  d.fields[key] = '12.5';
  assert.equal(editedDocument(d).results[0].groups[0].weight, 12.5);
  assert.equal(g.weight, null);
});
test('an old acknowledged save advances the revision without replacing newer raw edits, notes or pending finish intent', () => {
  const sent = fixture(),
    newer = {
      ...sent,
      dirty: true,
      fields: { raw: '12.' },
      document: { ...sent.document, notes: 'newer note' },
    };
  const saved = { ...sent.journal, revision: 2 };
  const merged = acknowledgeJournal(sent, newer, saved);
  assert.equal(merged.journal.revision, 2);
  assert.deepEqual(merged.fields, { raw: '12.' });
  assert.equal(merged.document.notes, 'newer note');
  assert.equal(merged.dirty, true);
  assert.equal(merged.pending, null);
  const clean = acknowledgeJournal(sent, sent, saved);
  assert.equal(clean.dirty, false);
  assert.deepEqual(clean.fields, {});
});

test('replayed durable commands cannot replace edits already persisted before relaunch', () => {
  const d = fixture();
  d.pending = {
    kind: 'save',
    operationId: randomUUID(),
    journalId: d.journal.id,
    expectedRevision: 1,
    document: structuredClone(d.document),
  };
  d.document.notes = 'Newer note persisted while the request was in flight';
  d.dirty = true;
  const saved = { ...d.journal, revision: 2, document: structuredClone(d.pending.document) };
  const merged = acknowledgeJournal(d, d, saved);
  assert.equal(merged.document.notes, d.document.notes);
  assert.equal(merged.dirty, true);
  assert.equal(merged.pending, null);
  assert.equal(merged.journal.revision, 2);
  assert.equal(merged.baseline.notes, '');
});
