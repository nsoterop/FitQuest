import type { FoodDocument } from '../../shared/foodContract.js';
export function foodFixture(): FoodDocument {
  return {
    name: 'Synthetic breakfast',
    meal: 'Breakfast',
    date: '2026-10-08',
    time: '08:15',
    timeZone: 'America/New_York',
    servings: 1,
    items: [
      {
        name: 'Synthetic label',
        portion: '1 container',
        quantity: 1,
        unit: 'container',
        nutrients: {
          calories: { value: 123.456, source: 'supplied' },
          protein: { value: 12.1, source: 'supplied' },
          carbs: { value: null, source: 'unknown' },
          fat: { value: 0, source: 'supplied' },
        },
      },
    ],
    assumptions: [],
  };
}
