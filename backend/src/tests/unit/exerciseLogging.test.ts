import test from 'node:test';
import assert from 'node:assert/strict';
import {
  legacyExerciseLogging,
  validExerciseLogging,
  weightBasisLabel,
} from '../../shared/exerciseLogging.js';
import { legacyLoggingPayload } from '../../features/journal/journalCompatibility.js';
test('narrow legacy hints preserve rep/load ranges and explicit basis; ambiguous/composite prose stays manual', () => {
  const hint = legacyExerciseLogging(
    '3 × 6–8 reps at 20 lb per hand; rest 90 seconds.',
    'weighted_reps',
  );
  assert.equal(hint.setCount, 3);
  assert.deepEqual(hint.reps, { min: 6, max: 8 });
  assert.equal(hint.load?.basis, 'per_hand');
  assert.equal(
    legacyExerciseLogging('3 × 8 at 40 lb; rest 90 seconds.', 'weighted_reps').load?.basis,
    'unspecified',
  );
  assert.equal(
    legacyExerciseLogging('3 × 8 at 40 lb per dumbbell.', 'weighted_reps').load?.basis,
    'per_dumbbell',
  );
  for (const prose of [
    '3 rounds: 8 reps then 10 reps.',
    'Superset — 3 × 8 at 20 lb.',
    '3 × 8 + 5 reps.',
    'Choose a comfortable number of sets.',
  ])
    assert.equal(legacyExerciseLogging(prose, 'weighted_reps').setCount, null);
  assert.equal(legacyExerciseLogging('3 × 8 at 20 kg.', 'completion').load, null);
  assert.equal(weightBasisLabel('barbell_total', 'kg'), 'Total barbell weight (kg)');
  assert(!validExerciseLogging({ ...hint, reps: { min: 12, max: 8 } }));
  assert(
    !validExerciseLogging({ ...hint, load: { min: 20, max: 20, unit: 'lb', basis: 'guessed' } }),
  );
});
test('legacy metadata transport projection preserves source content without changing saved objects', () => {
  const p = {
    days: [
      {
        sessions: [
          {
            exercises: [
              {
                exercise: 'Any movement',
                prescription: 'Original units and guidance.',
                loggingMode: 'reps',
                logging: { version: 1, setCount: null, reps: null, load: null, description: null },
              },
            ],
          },
        ],
      },
    ],
  };
  const before = structuredClone(p),
    projected = legacyLoggingPayload(p) as typeof p;
  assert.deepEqual(p, before);
  assert.equal(
    projected.days[0]!.sessions[0]!.exercises[0]!.prescription,
    'Original units and guidance.',
  );
  assert(!Object.hasOwn(projected.days[0]!.sessions[0]!.exercises[0]!, 'logging'));
});
