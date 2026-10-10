import test from 'node:test';
import assert from 'node:assert/strict';
import { validNutrition, nutritionText } from './nutrition.ts';
const estimate = {
  status: 'estimate',
  calories: 2400,
  proteinGrams: 120,
  carbohydrateGrams: 318,
  fatGrams: 72,
  rationale: 'Maintenance supports mixed training.',
  assumptions: 'Starting estimate with reported inputs.',
  reason: null,
  basis: 'mifflin-st-jeor-v1',
};
test('compact daily nutrition uses kcal/grams, validates energy and preserves absent legacy targets', () => {
  assert(validNutrition(estimate));
  assert(validNutrition(undefined));
  assert.match(nutritionText(estimate), /2400 kcal · Protein 120 g · Carbs 318 g · Fat 72 g/);
  for (const patch of [
    { calories: 0 },
    { calories: Infinity },
    { calories: NaN },
    { proteinGrams: -1 },
    { carbohydrateGrams: 300 },
    { fatGrams: 2.5 },
    { basis: 'unknown' },
    { reason: 'Missing inputs' },
  ])
    assert.equal(validNutrition({ ...estimate, ...patch }), false);
  const deferred = {
    ...estimate,
    status: 'deferred',
    calories: null,
    proteinGrams: null,
    carbohydrateGrams: null,
    fatGrams: null,
    basis: null,
    reason: 'An equation input is still unknown.',
  };
  assert(validNutrition(deferred));
  assert.match(nutritionText(deferred), /deferred.*unknown/);
  assert(!validNutrition({ ...deferred, calories: 2400 }));
});
