import type {
  DocumentPlan,
  RowDocumentPlan,
  NutritionDocumentPlan,
} from '../../shared/documentPlanContract.js';
export function documentFixture(dates: string[]): DocumentPlan {
  return {
    days: dates.map((date, i) => ({
      date,
      sessions: [2, 6].includes(i)
        ? []
        : [
            {
              title: 'Skill and strength',
              goal: 'Build confident movement',
              timing: null,
              durationMinutes: { min: 20, max: 30 },
              optional: false,
              workoutMarkdown:
                '## Warm-up\n- Easy movement for **5 minutes**.\n## Practice\n1. Crab reach: 3 sets of 5–8 per side.\n2. Cushion balance: 2 rounds of 30 seconds.\nRest **45–60 seconds** between sets.\n## Finish\n- Walk easily for 3 minutes.',
            },
            ...(i === 0
              ? [
                  {
                    title: 'Later easy practice',
                    goal: 'Relax and move comfortably',
                    timing: 'Evening',
                    durationMinutes: { min: 10, max: 15 },
                    optional: true,
                    workoutMarkdown:
                      '- Easy dance practice for **10–15 minutes**.\n- Pause for 30 seconds when needed.',
                  },
                ]
              : []),
          ],
    })),
  };
}

export function rowDocumentFixture(dates: string[]): RowDocumentPlan {
  return {
    days: dates.map((date, i) => ({
      date,
      sessions: [2, 6].includes(i)
        ? []
        : [
            {
              title: 'Skill and strength',
              goal: 'Build confident movement',
              timing: null,
              durationMinutes: { min: 20, max: 30 },
              optional: false,
              exercises: [
                { exercise: 'Easy movement', prescription: '5 minutes at an easy pace.' },
                {
                  exercise: 'Dumbbell squat',
                  prescription:
                    '3 × 6–8 reps at 20 lb per hand; 2 reps in reserve. Rest 90 seconds between sets.',
                },
                {
                  exercise: 'Superset A — row + press',
                  prescription:
                    '3 rounds: 8–10 rows per side at 15 lb, then 8 presses at 10 lb per hand. Rest 60–90 seconds after each pair.',
                },
                {
                  exercise: 'Run / walk intervals',
                  prescription:
                    '6 rounds: run 200 m at RPE 7, then walk 100 m for active recovery. Allow 2 minutes easy walking afterward.',
                },
                {
                  exercise: 'Crab reach',
                  prescription:
                    '2 rounds of 5–8 per side; pause 2 seconds at each reach. Rest 30 seconds between rounds.',
                },
                {
                  exercise: 'Cushion balance + catch',
                  prescription:
                    '2 × 30 seconds per side; 5 gentle catches during each hold. Rest 45 seconds between sets.',
                },
              ],
            },
            ...(i === 0
              ? [
                  {
                    title: 'Later easy practice',
                    goal: 'Relax and move comfortably',
                    timing: 'Evening',
                    durationMinutes: { min: 10, max: 15 },
                    optional: true,
                    exercises: [
                      {
                        exercise: 'Easy dance practice',
                        prescription: '10–15 minutes; pause for 30 seconds when needed.',
                      },
                    ],
                  },
                ]
              : []),
          ],
    })),
  };
}

export function nutritionDocumentFixture(dates: string[]): NutritionDocumentPlan {
  return {
    ...rowDocumentFixture(dates),
    nutrition: {
      version: 1,
      status: 'available',
      caloriesKcal: 2350,
      proteinGrams: 140,
      carbohydrateGrams: 290,
      fatGrams: 70,
      rationale:
        'Synthetic estimate balancing training and recovery; adjust with observed results.',
    },
  };
}

export function journalDocumentFixture(dates: string[]): NutritionDocumentPlan {
  const p = nutritionDocumentFixture(dates);
  for (const day of p.days)
    for (const session of day.sessions)
      session.exercises.forEach((e, i) => {
        e.loggingMode = i === 1 ? 'weighted_reps' : i === 4 ? 'reps' : 'completion';
      });
  return p;
}
