// Invented athlete and prescriptions, never owner data or newly observed model output.
import { trainingFixture, fixturePrescription } from './planningFixture.js';
import type { PlanningInput } from '../../features/planning/planningDomain.js';
import type { Week } from '../../features/planning/weeklyPlanning.js';
export const reviewSummary = structuredClone(trainingFixture);
reviewSummary[0] = {
  category: 'goals',
  origin: 'user_report',
  text: 'Comfortable walking, general strength and learning acceleration.',
  goals: ['Comfortable walking', 'General strength', 'Learning acceleration'],
};
reviewSummary[1] = {
  category: 'availability',
  origin: 'user_report',
  text: 'Monday and Tuesday are available. I prefer shorter sessions spread out; 20 minutes per session, 30 minutes per day.',
};
reviewSummary[2] = {
  category: 'equipment',
  origin: 'user_report',
  text: 'Safe level walking path, clear floor and open flat space for introductory acceleration; no partner needed.',
};
export const reviewInput: PlanningInput = {
  kind: 'week',
  draftReview: true,
  qualityVersion: 2,
  summary: reviewSummary,
  profile: { age: 30, heightInches: 68, weightLb: 155 },
  dates: Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 5).padStart(2, '0')}`),
};
export function reviewWeek(input: PlanningInput = reviewInput): Week {
  return {
    arrangementNote:
      'Monday stays a single easy walk. Tuesday initially combines light walking and strength within the session limit; review the preferred split before acceptance.',
    units: 'imperial',
    clarification: null,
    coverage: [],
    goalDecisions: [
      {
        sourceIndex: 0,
        goalIndex: 0,
        goal: 'Comfortable walking',
        status: 'addressed',
        reason: 'Easy walking practices comfortable sustained movement.',
        evidence: [{ date: input.dates[0]!, sessionIndex: 0, activityIndex: 0 }],
      },
      {
        sourceIndex: 0,
        goalIndex: 1,
        goal: 'General strength',
        status: 'introductory',
        reason: 'Conservative bodyweight work introduces general strength.',
        evidence: [{ date: input.dates[1]!, sessionIndex: 0, activityIndex: 1 }],
      },
      {
        sourceIndex: 0,
        goalIndex: 2,
        goal: 'Learning acceleration',
        status: 'deferred',
        reason:
          'First review the introductory week; the requested acceleration can replace some Tuesday walking within the available space and time.',
        evidence: [],
      },
    ],
    days: input.dates.map((date, i) => ({
      date,
      sessions:
        i === 0
          ? [
              {
                focus: 'Easy walking',
                timing: 'morning',
                estimatedMinutes: 15,
                intervals: [],
                activities: [
                  { ...fixturePrescription('FQ-ACT-00148'), amount: 600, distanceTarget: null },
                ],
              },
            ]
          : i === 1
            ? [
                {
                  focus: 'Walking and strength',
                  timing: 'evening',
                  estimatedMinutes: 20,
                  intervals: [],
                  activities: [
                    { ...fixturePrescription('FQ-ACT-00148'), amount: 600, distanceTarget: null },
                    { ...fixturePrescription('FQ-ACT-00003', 'repetitions'), distanceTarget: null },
                  ],
                },
              ]
            : [],
    })),
  };
}
export function revisedWeek(input: PlanningInput = reviewInput): Week {
  const week = reviewWeek(input),
    day = week.days[1]!;
  week.arrangementNote =
    'Monday remains unchanged as requested. Tuesday uses two shorter purposeful sessions within the 30-minute day limit.';
  day.sessions = [
    {
      focus: 'Easy walking',
      timing: 'morning',
      estimatedMinutes: 10,
      intervals: [],
      activities: [{ ...fixturePrescription('FQ-ACT-00148'), amount: 300, distanceTarget: null }],
    },
    {
      focus: 'Introductory acceleration and strength',
      timing: 'evening',
      estimatedMinutes: 15,
      intervals: [],
      activities: [
        {
          ...fixturePrescription('FQ-ACT-00145', 'meters'),
          sets: 3,
          amount: 20,
          restSeconds: 90,
          distanceTarget: { value: 20, unit: 'm' },
          effort: 'moderate',
        },
        { ...fixturePrescription('FQ-ACT-00003', 'repetitions'), distanceTarget: null },
      ],
    },
  ];
  week.goalDecisions![1]!.evidence = [{ date: day.date, sessionIndex: 1, activityIndex: 1 }];
  week.goalDecisions![2] = {
    sourceIndex: 0,
    goalIndex: 2,
    goal: 'Learning acceleration',
    status: 'introductory',
    reason: 'Short moderate accelerations with recovery introduce the reported acceleration goal.',
    evidence: [{ date: day.date, sessionIndex: 1, activityIndex: 0 }],
  };
  return week;
}
export const reviewFeedback =
  'Keep Monday exactly as it is; split Tuesday into shorter sessions and give speed work a place.';

// Explicit simulated model interpretation for invented fixture feedback, not a language parser.
export function fixtureScope(input: PlanningInput, changed = [1]) {
  return input.dates.flatMap((date, i) =>
    changed.includes(i)
      ? [
          {
            date,
            changeSessions: (input.review?.days[i]?.sessions ?? [{}]).map((_, j) => j),
            evidence: (input.review?.feedback ?? reviewFeedback).slice(0, 350),
          },
        ]
      : [],
  );
}
