// Synthetic test data only. Shared by persistence and rendered-flow regressions.
import { Ajv } from 'ajv';
import type { PlanningInput } from '../../features/planning/planningDomain.js';
import { expectedGoals } from '../../features/planning/trainingSummary.js';
import { fixturePrescription } from './planningFixture.js';
import type { Week } from '../../features/planning/weeklyPlanning.js';

export function plainDetailReply(input: PlanningInput): Week {
  const first = input.outline!.days.find((d) => d.sessions.length)!;
  return {
    clarification: null,
    coverage: [],
    arrangementNote: null,
    units: 'imperial',
    goalDecisions: expectedGoals(input.summary).map((g) => ({
      ...g,
      status: 'addressed',
      reason: 'Walking and strength practice support the synthetic reported goals.',
      evidence: [{ date: first.date, sessionIndex: 0, activityIndex: 1 }],
    })),
    days: input.outline!.days.map((d) => ({
      date: d.date,
      sessions: d.sessions.map((s) => ({
        focus: s.focus,
        timing: s.timing,
        estimatedMinutes: Math.round(
          s.plain!.durationRange!.min +
            (s.plain!.durationRange!.max - s.plain!.durationRange!.min) / 2,
        ),
        intervals: [],
        activities: [
          {
            ...fixturePrescription('FQ-ACT-00148', 'meters'),
            phase: 'warmup',
            amount: 804.672,
            restSeconds: 0,
            distanceTarget: { value: 0.5, unit: 'mi' },
            repRange: null,
            rir: null,
          },
          {
            ...fixturePrescription('FQ-ACT-00003', 'repetitions'),
            sets: 2,
            restSeconds: 30,
            distanceTarget: null,
            repRange: { min: 8, max: 12 },
            rir: 3,
          },
          {
            ...fixturePrescription('FQ-ACT-00112', 'repetitions'),
            phase: 'cooldown',
            amount: 8,
            restSeconds: 0,
            distanceTarget: null,
            repRange: null,
            rir: null,
          },
        ],
      })),
    })),
  };
}
export function checkSyntheticWire(body: string, reply: unknown) {
  const request = JSON.parse(body),
    valid = new Ajv().compile(request.text.format.schema);
  if (!valid(reply)) throw Error('Synthetic response does not match actual detail request schema');
}
