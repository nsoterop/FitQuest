import { describe, expect, it } from 'vitest';
import { ActivitySchema, CommandSchema, ProfileSchema, ResultSchema, SessionSchema, validateSessionTransition, type Session } from './index';
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const profile = { displayName: null, timeZone: 'America/New_York', units: { load: 'lb', distance: 'mi' } };
const strength = { kind: 'strength', id: id(1), observedAt: null, capturedAt: '2026-09-23T15:00:00.000Z', side: 'bilateral', notes: null, source: 'manual', voided: false, repetitions: null, repetitionBasis: 'movement_cycles', load: null, rpe: null, rir: null };
const timed = { kind: 'timed', id: id(2), observedAt: null, capturedAt: '2026-09-23T15:00:00.000Z', side: 'not_applicable', notes: null, source: 'manual', voided: false, duration: null, durationMethod: null };
const activity = { id: id(3), name: 'Practice', variation: { id: id(4), label: 'Standard' }, equipment: null, outcome: 'started', startedAt: null, endedAt: null, results: [strength, timed] };
const session: Session = { id: id(5), origin: 'unplanned', title: null, status: 'started', startedAt: '2026-11-01T05:30:00.000Z', endedAt: null, timeZone: 'America/New_York', localDate: '2026-11-01', activities: [activity] as Session['activities'], correctionReason: null };

describe('M1a strict contracts', () => {
  it('keeps unknown distinct from zero and rejects future fields/kinds', () => {
    expect(ResultSchema.parse(strength).repetitions).toBeNull();
    expect(ResultSchema.parse({ ...strength, repetitions: 0 }).repetitions).toBe(0);
    expect(ResultSchema.parse({ ...timed, duration: { value: '0', unit: 'min', accuracy: 'reported' }, durationMethod: 'manual' }).duration?.value).toBe('0');
    expect(ResultSchema.safeParse({ ...strength, targetReps: 10 }).success).toBe(false);
    expect(ResultSchema.safeParse({ ...strength, kind: 'distance' }).success).toBe(false);
    expect(ResultSchema.safeParse({ ...timed, durationMethod: 'confirmed_timer' }).success).toBe(false);
  });
  it('preserves external load basis, assistance, and repetition side', () => {
    expect(ResultSchema.parse({ ...strength, load: { kind: 'external', mass: { value: '25', unit: 'lb', accuracy: 'reported' }, basis: 'per_dumbbell', implementCount: null } }).load).toMatchObject({ basis: 'per_dumbbell', implementCount: null });
    expect(ResultSchema.parse({ ...strength, load: { kind: 'assisted', assistance: null, method: 'band' } }).load).toMatchObject({ assistance: null });
    expect(ResultSchema.safeParse({ ...strength, side: 'alternating' }).success).toBe(false);
    expect(ResultSchema.safeParse({ ...strength, side: 'alternating', repetitionBasis: 'total_alternating' }).success).toBe(true);
    expect(ResultSchema.safeParse({ ...strength, side: 'bilateral', repetitionBasis: 'per_side' }).success).toBe(false);
    expect(ResultSchema.safeParse({ ...strength, observedAt: '2026-09-23T16:00:00.000Z' }).success).toBe(false);
    expect(ResultSchema.safeParse({ ...strength, load: { kind: 'external', mass: { value: '25', unit: 'lb', accuracy: 'reported' }, basis: 'per_dumbbell', implementCount: 0 } }).success).toBe(false);
  });
  it('requires explicit correction and outcome choices', () => {
    expect(SessionSchema.parse(session).status).toBe('started');
    expect(() => validateSessionTransition(session, { ...session, activities: [] })).toThrow(/omitted/);
    expect(() => validateSessionTransition(session, { ...session, activities: [{ ...session.activities[0], results: [strength] }] })).toThrow(/omitted/);
    expect(ActivitySchema.safeParse({ ...activity, outcome: 'skipped' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, status: 'completed', endedAt: '2026-11-01T06:00:00.000Z' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, activities: [], status: 'completed', endedAt: '2026-11-01T06:00:00.000Z' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, activities: [{ ...activity, outcome: 'partial' }], status: 'completed', endedAt: '2026-11-01T06:00:00.000Z' }).success).toBe(true);
  });
  it('validates timezone, date, ordering, and midnight/DST without profile relabeling', () => {
    expect(SessionSchema.safeParse({ ...session, endedAt: '2026-11-01T05:00:00.000Z', status: 'ended_early' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, localDate: '2026-10-31' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, timeZone: 'Not/AZone' }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...session, endedAt: '2026-11-02T06:00:00.000Z', status: 'ended_early', activities: [{ ...activity, outcome: 'partial' }] }).success).toBe(true);
    expect(SessionSchema.safeParse({ ...session, activities: [{ ...activity, startedAt: '2026-11-01T04:00:00.000Z' }] }).success).toBe(false);
    expect(ProfileSchema.parse({ ...profile, timeZone: 'Europe/London' }).timeZone).toBe('Europe/London');
    expect(SessionSchema.parse(session).localDate).toBe('2026-11-01');
  });
  it('accepts only versioned commands and valid profiles', () => {
    expect(ProfileSchema.safeParse({ ...profile, timeZone: 'Bad' }).success).toBe(false);
    expect(CommandSchema.safeParse({ contractVersion: 1, operationId: id(6), kind: 'profile.put', expectedRevision: 0, payload: profile }).success).toBe(true);
    expect(CommandSchema.safeParse({ contractVersion: 2, operationId: id(6), kind: 'profile.put', expectedRevision: 0, payload: profile }).success).toBe(false);
    expect(CommandSchema.safeParse({ contractVersion: 1, operationId: id(6), kind: 'plan.put', expectedRevision: 0, payload: profile }).success).toBe(false);
  });
});
