import type { Prescription } from './planningDomain.js';
import { invalidPlan } from './planningValidation.js';

const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const index = (maximum: number) => ({ type: 'integer', minimum: 0, maximum });
export const unitsSchema = { type: 'string', enum: ['imperial', 'metric'] };
export type Units = 'imperial' | 'metric';
export type DistanceTarget = { value: number; unit: 'm' | 'km' | 'mi' | 'yd' };
export const distanceSchema = {
  anyOf: [
    { type: 'null' },
    object({
      value: { type: 'number', exclusiveMinimum: 0, maximum: 50000 },
      unit: { type: 'string', enum: ['m', 'km', 'mi', 'yd'] },
    }),
  ],
};
export const timingSchema = {
  anyOf: [{ type: 'null' }, { type: 'string', enum: ['morning', 'midday', 'evening', 'flexible'] }],
};
export type Timing = 'morning' | 'midday' | 'evening' | 'flexible' | null;
export type Interval = {
  workIndex: number;
  recoveryIndex: number;
  recoveries: 'between' | 'after_each';
};
export const intervalsSchema = {
  type: 'array',
  maxItems: 7,
  items: object({
    workIndex: index(13),
    recoveryIndex: index(14),
    recoveries: { type: 'string', enum: ['between', 'after_each'] },
  }),
};
export type GoalDecision = {
  sourceIndex: number;
  goalIndex?: number;
  goal: string;
  status: 'addressed' | 'introductory' | 'deferred';
  reason: string;
  evidence: { date: string; sessionIndex: number; activityIndex: number }[];
};
export const goalsSchema = {
  type: 'array',
  maxItems: 24,
  items: object({
    sourceIndex: index(11),
    goalIndex: index(23),
    goal: { type: 'string', minLength: 1, maxLength: 150 },
    status: { type: 'string', enum: ['addressed', 'introductory', 'deferred'] },
    reason: { type: 'string', minLength: 8, maxLength: 350 },
    evidence: {
      type: 'array',
      maxItems: 7,
      items: object({
        date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        sessionIndex: index(2),
        activityIndex: index(14),
      }),
    },
  }),
};
export const metersPerUnit = { m: 1, km: 1000, mi: 1609.344, yd: 0.9144 } as const;
export function checkSessionQuality(session: {
  activities: Prescription[];
  intervals?: Interval[];
}) {
  for (const [index, a] of session.activities.entries()) {
    if (a.measure !== 'meters' && !Number.isInteger(a.amount)) invalidPlan('quantity', index);
    if (
      a.repRange &&
      (a.measure !== 'repetitions' ||
        a.repRange.min >= a.repRange.max ||
        a.amount !== a.repRange.min)
    )
      invalidPlan('rep_range', index);
    if (a.rir != null && (a.measure !== 'repetitions' || a.phase === 'cooldown'))
      invalidPlan('rir', index);
    if (a.distanceTarget) {
      if (
        a.measure !== 'meters' ||
        Math.abs(a.amount - a.distanceTarget.value * metersPerUnit[a.distanceTarget.unit]) > 1e-6
      )
        invalidPlan('distance_conversion', index);
    }
  }
  const used = new Set<number>();
  for (const [index, pair] of (session.intervals ?? []).entries()) {
    const work = session.activities[pair.workIndex],
      recovery = session.activities[pair.recoveryIndex];
    if (
      !work ||
      !recovery ||
      pair.recoveryIndex !== pair.workIndex + 1 ||
      used.has(pair.workIndex) ||
      used.has(pair.recoveryIndex)
    )
      invalidPlan('interval_order', index);
    if (!work || !recovery) continue;
    if (
      work.sets < 2 ||
      recovery.sets !== work.sets - (pair.recoveries === 'between' ? 1 : 0) ||
      work.phase !== recovery.phase ||
      work.restSeconds !== 0 ||
      recovery.restSeconds !== 0 ||
      recovery.effort !== 'easy'
    )
      invalidPlan('interval_prescription', index);
    used.add(pair.workIndex);
    used.add(pair.recoveryIndex);
  }
}
export const planningQualityInstructions = `Scheduling fidelity: availability is what CAN fit; preferred distribution is what the athlete WANTS. Distinguish a per-session cap from a total-day cap, and examples from requirements. Do not silently convert multiple available slots into a requirement, or a short session cap into one daily session. Honor a preference for separate purposeful sessions when feasible, distributing an appropriate total workload rather than duplicating it to fill slots. Preserve single-session and flexible preferences. Use timing morning/midday/evening/flexible, never invent exact clock times. Null timing is only for unchanged legacy saved sessions without timing. If a material ambiguity prevents a suitable plan, use the existing single clarification, not an extra intake checklist.
Goal coverage: Return exactly one goalDecisions entry for EVERY supplied expectedGoals entry. Copy sourceIndex, goalIndex and goal text EXACTLY. These identities were fixed before this request; do not rename, combine, substitute or omit any. Multiple goals may legitimately reference the same work. The summary text retains priorities and context for those goals. Each addressed or introductory goal needs evidence pointing to at least one specific MAIN, non-recovery prescription (date, zero-based sessionIndex/activityIndex), and a short reason explaining how that work serves it. A label or generic promise alone is not coverage. Different goals may share coherent work; no fixed goal-to-exercise mapping or workout-per-goal quota. Use deferred only with a specific summary/catalog constraint and a bounded next step for revisiting it, no vague or indefinite blanket deferral. Consider speed/agility explicitly when stated: check experience, space, skill and catalog constraints; use a suitable introductory approach or grounded deferral, never automatic maximal sprints. Check total weekly load, recovery spacing and each session's purpose together before returning. Do not imply prescribed sessions were completed.
Strength targets: use repRange {min,max} for an appropriate repetition range and amount equal to min; use null for exact targets and all non-repetition activities. rir is a conservative target of 0–5 repetitions in reserve only for repetition work outside the cooldown phase; use null for all cooldown prescriptions and non-repetition work. Prefer a useful rep range and submaximal RIR for adjustable strength work; do not apply RIR to walking, holds or counts. Echo absent legacy fields as null, never invent changed meaning.
Units: preferredUnits is the app default (miles/pounds), not an athlete report; honor an explicit different preference in the summary. Return the selected units. Choose practical quantities in those units at generation time: e.g. distanceTarget 2 mi has canonical amount 3218.688 meters. Every new meter prescription MUST have distanceTarget; all other measures have null. Canonical amount must equal value times m=1, km=1000, mi=1609.344, yd=0.9144. Use readable precise meters or yards for short sprints, not tiny mile fractions. Never round a stored distance to a different quantity. Preserve catalog load conventions and canonical kg; no guessed weights.
Intervals: flat activities remain ordered. For explicitly alternating active work/recovery, add an intervals entry linking adjacent workIndex then recoveryIndex, with work sets equal rounds and recovery sets rounds-1 for between or rounds for after_each. Both use the same phase, zero restSeconds (no double-counted rest), recovery effort easy. Use passive restSeconds instead when no active recovery activity is prescribed. Do not invent alternation from unrelated flat rows, merge warmup/cooldown/recovery that share an ID, or make optional work mandatory. Keep continuous same-purpose work in one prescription rather than fragmenting it into repeated tiny rows. Echo legacy saved sessions without new meaning: null timing, empty intervals and null distanceTarget for fields absent there. Existing canonical quantities, phases, sets, order and loads remain exact.`;
