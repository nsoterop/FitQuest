import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  validJournalDocument,
  validJournalCommand,
  resultLogged,
  type JournalDocument,
} from './shared/journalContract.js';
import { validSavedDocument, documentOverview } from './shared/documentPlanContract.js';
import { journalDocumentFixture, nutritionDocumentFixture } from './documentPlanFixture.js';
const doc = (): JournalDocument => ({
  version: 1,
  title: 'Practice',
  performedDate: '2026-10-04',
  timeZone: 'America/New_York',
  outcome: 'in_progress',
  notes: '',
  results: [
    {
      id: randomUUID(),
      name: 'Any activity',
      mode: 'weighted_reps',
      completed: null,
      removed: false,
      groups: [
        { id: randomUUID(), weight: null, sets: null, reps: null, unit: 'lb', removed: false },
      ],
    },
  ],
});
test('journal validates actual shape and explicit units without enforcing prescribed performance', () => {
  const d = doc(),
    r = d.results[0]!;
  assert(validJournalDocument(d));
  assert(!resultLogged(r));
  r.groups[0]!.weight = 0;
  assert(resultLogged(r));
  for (const weight of [0, 0.25, 10000]) {
    r.groups[0]!.weight = weight;
    assert(validJournalDocument(d));
  }
  for (const bad of [-1, NaN, Infinity]) {
    r.groups[0]!.weight = bad;
    assert.equal(validJournalDocument(d), false);
  }
  r.groups[0]!.weight = null;
  r.groups[0]!.sets = 1.5;
  assert.equal(validJournalDocument(d), false);
  r.groups[0]!.sets = 0;
  assert(validJournalDocument(d));
  r.mode = 'completion';
  assert(!resultLogged(r));
  r.completed = false;
  assert(resultLogged(r));
  r.removed = true;
  assert(!resultLogged(r));
  assert(!validJournalDocument({ ...d, notes: 'x'.repeat(4001) }));
  assert(!validJournalDocument({ ...d, timeZone: 'unknown/time' }));
  assert(!validJournalDocument({ ...d, performedDate: '2026-02-30' }));
  assert(
    !validJournalCommand({
      kind: 'save',
      operationId: randomUUID(),
      journalId: randomUUID(),
      expectedRevision: 1,
      document: d,
      userId: randomUUID(),
    }),
  );
});
test('v4 metadata is a small strict hint, hidden from previews; v3 remains valid unchanged', () => {
  const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${String(5 + i).padStart(2, '0')}`),
    p = journalDocumentFixture(dates),
    legacy = nutritionDocumentFixture(dates);
  assert(validSavedDocument(p, dates, 'document-week-v4'));
  assert(validSavedDocument(legacy, dates, 'document-week-v3'));
  assert(!validSavedDocument(legacy, dates, 'document-week-v4'));
  assert(!JSON.stringify(documentOverview(p)).includes('loggingMode'));
  p.days[0]!.sessions[0]!.exercises[0]!.loggingMode = 'duration' as never;
  assert(!validSavedDocument(p, dates, 'document-week-v4'));
});
