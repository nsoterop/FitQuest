import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertWeight,
  weightNumber,
  weightEntry,
  weightText,
} from '../src/features/account/weightUnits.ts';
test('weight display converts physical values consistently without changing source text or unfinished input units', () => {
  assert.equal(convertWeight(1, 'lb', 'kg'), 0.45359237);
  assert.equal(weightNumber(145, 'lb', 'kg'), '65.77');
  assert.equal(weightNumber(20, 'kg', 'lb'), '44.09');
  assert.deepEqual(weightEntry('12.', 'lb', 'kg'), { value: '12.', unit: 'lb' });
  assert.deepEqual(weightEntry('', 'lb', 'kg'), { value: '', unit: 'kg' });
  assert.deepEqual(weightEntry('20–30', 'lb', 'kg'), { value: '9.07–13.61', unit: 'kg' });
  const original = '3 x 8 at 20 lb per hand; rest 60 seconds. 5 minutes easy movement.';
  assert.equal(
    weightText(original, 'kg'),
    '3 x 8 at 9.07 kg per hand; rest 60 seconds. 5 minutes easy movement.',
  );
  assert.equal(weightText(original, 'lb'), original);
  assert.equal(weightText('1,000 lb sled, 8 reps', 'kg'), '453.59 kg sled, 8 reps');
  assert.equal(weightText('Use 10 kg or 20 lb; 8 reps.', 'kg'), 'Use 10 kg or 9.07 kg; 8 reps.');
});
