import { z } from 'zod';

/** Public liveness response. It does not imply account, database, or coaching readiness. */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('fitquest-api'),
  phase: z.literal('scaffold'),
}).strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

const uuid = z.uuid();
const instant = z.iso.datetime({ offset: false });
const decimal = z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/);
const localDate = z.iso.date();
const timeZone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}, 'Invalid IANA time zone');
const quantity = z.object({ value: decimal, accuracy: z.enum(['reported', 'estimated']) });
const mass = quantity.extend({ unit: z.enum(['lb', 'kg']) }).strict();
const duration = quantity.extend({ unit: z.enum(['s', 'min']) }).strict();

export const ProfileSchema = z.object({
  displayName: z.string().trim().max(80).nullable(),
  timeZone,
  units: z.object({ load: z.enum(['lb', 'kg']), distance: z.enum(['mi', 'km']) }).strict(),
}).strict();
export type Profile = z.infer<typeof ProfileSchema>;

export const LoadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('external'), mass, basis: z.enum(['total', 'per_dumbbell', 'per_implement']), implementCount: z.number().int().min(1).max(100).nullable() }).strict(),
  z.object({ kind: z.literal('bodyweight') }).strict(),
  z.object({ kind: z.literal('assisted'), assistance: mass.nullable(), method: z.string().trim().min(1).max(100) }).strict(),
]);
const resultCommon = z.object({
  id: uuid, observedAt: instant.nullable(), capturedAt: instant,
  side: z.enum(['left', 'right', 'bilateral', 'alternating', 'not_applicable']),
  notes: z.string().max(1000).nullable(), source: z.literal('manual'), voided: z.boolean(),
});
export const ResultSchema = z.discriminatedUnion('kind', [
  resultCommon.extend({ kind: z.literal('strength'), repetitions: z.number().int().min(0).max(100000).nullable(), repetitionBasis: z.enum(['movement_cycles', 'per_side', 'total_alternating']), load: LoadSchema.nullable(), rpe: decimal.nullable(), rir: decimal.nullable() }).strict().superRefine((result, ctx) => {
    if (result.side === 'alternating' && result.repetitionBasis !== 'total_alternating') ctx.addIssue({ code: 'custom', message: 'Alternating work requires total_alternating', path: ['repetitionBasis'] });
    if (result.side !== 'alternating' && result.repetitionBasis === 'total_alternating') ctx.addIssue({ code: 'custom', message: 'total_alternating requires alternating side', path: ['repetitionBasis'] });
    if (result.side === 'bilateral' && result.repetitionBasis !== 'movement_cycles') ctx.addIssue({ code: 'custom', message: 'Bilateral work counts movement cycles', path: ['repetitionBasis'] });
    if (result.rpe !== null && Number(result.rpe) > 10) ctx.addIssue({ code: 'custom', message: 'RPE must be at most 10', path: ['rpe'] });
    if (result.rir !== null && Number(result.rir) > 100) ctx.addIssue({ code: 'custom', message: 'RIR safeguard is 100', path: ['rir'] });
    if (result.observedAt && result.observedAt > result.capturedAt) ctx.addIssue({ code: 'custom', message: 'Performance time cannot follow entry time', path: ['observedAt'] });
  }),
  resultCommon.extend({ kind: z.literal('timed'), duration: duration.nullable(), durationMethod: z.literal('manual').nullable() }).strict().superRefine((result, ctx) => {
    if ((result.duration === null) !== (result.durationMethod === null)) ctx.addIssue({ code: 'custom', message: 'Duration and method must both be present or absent', path: ['durationMethod'] });
    if (result.observedAt && result.observedAt > result.capturedAt) ctx.addIssue({ code: 'custom', message: 'Performance time cannot follow entry time', path: ['observedAt'] });
  }),
]);
export type Result = z.infer<typeof ResultSchema>;

export const ActivitySchema = z.object({
  id: uuid, name: z.string().trim().min(1).max(120),
  variation: z.object({ id: uuid, label: z.string().trim().min(1).max(120) }).strict(),
  equipment: z.object({ instanceId: uuid.nullable(), label: z.string().trim().min(1).max(120) }).strict().nullable(),
  outcome: z.enum(['started', 'completed', 'partial', 'skipped']),
  startedAt: instant.nullable(), endedAt: instant.nullable(),
  results: z.array(ResultSchema).max(1000),
}).strict().superRefine((activity, ctx) => {
  if (activity.endedAt && activity.startedAt && activity.endedAt < activity.startedAt) ctx.addIssue({ code: 'custom', message: 'Activity ends before start', path: ['endedAt'] });
  if (activity.outcome === 'started' && activity.endedAt !== null) ctx.addIssue({ code: 'custom', message: 'Started activity cannot have an end time', path: ['endedAt'] });
  if (activity.outcome === 'skipped' && activity.results.some(r => !r.voided)) ctx.addIssue({ code: 'custom', message: 'Skipped activity has performed results', path: ['outcome'] });
  if (new Set(activity.results.map(r => r.id)).size !== activity.results.length) ctx.addIssue({ code: 'custom', message: 'Duplicate result ID', path: ['results'] });
});
export type Activity = z.infer<typeof ActivitySchema>;

export const SessionSchema = z.object({
  id: uuid, origin: z.literal('unplanned'), title: z.string().trim().max(120).nullable(),
  status: z.enum(['started', 'completed', 'ended_early', 'voided']),
  startedAt: instant, endedAt: instant.nullable(), timeZone, localDate,
  activities: z.array(ActivitySchema).max(100), correctionReason: z.string().trim().max(500).nullable(),
}).strict().superRefine((session, ctx) => {
  if (session.endedAt && session.endedAt < session.startedAt) ctx.addIssue({ code: 'custom', message: 'Session ends before start', path: ['endedAt'] });
  if ((session.status === 'started') !== (session.endedAt === null)) ctx.addIssue({ code: 'custom', message: 'Session status and end time disagree', path: ['endedAt'] });
  if (session.status === 'completed' && session.activities.length === 0) ctx.addIssue({ code: 'custom', message: 'Empty session cannot be completed', path: ['status'] });
  if (session.status !== 'started' && session.activities.some(a => a.outcome === 'started')) ctx.addIssue({ code: 'custom', message: 'Choose each activity outcome', path: ['activities'] });
  if (new Set(session.activities.map(a => a.id)).size !== session.activities.length) ctx.addIssue({ code: 'custom', message: 'Duplicate activity ID', path: ['activities'] });
  const resultIds = session.activities.flatMap(a => a.results.map(r => r.id));
  if (new Set(resultIds).size !== resultIds.length) ctx.addIssue({ code: 'custom', message: 'Duplicate result ID in session', path: ['activities'] });
  for (const [index, activity] of session.activities.entries()) {
    if (activity.startedAt && activity.startedAt < session.startedAt) ctx.addIssue({ code: 'custom', message: 'Activity starts before session', path: ['activities', index, 'startedAt'] });
    if (session.endedAt && activity.endedAt && activity.endedAt > session.endedAt) ctx.addIssue({ code: 'custom', message: 'Activity ends after session', path: ['activities', index, 'endedAt'] });
  }
  try {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: session.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(session.startedAt));
    if (date !== session.localDate) ctx.addIssue({ code: 'custom', message: 'Local date must match start time and time zone', path: ['localDate'] });
  } catch { ctx.addIssue({ code: 'custom', message: 'Invalid time zone', path: ['timeZone'] }); }
});
export type Session = z.infer<typeof SessionSchema>;

export const CommandSchema = z.discriminatedUnion('kind', [
  z.object({ contractVersion: z.literal(1), operationId: uuid, kind: z.literal('profile.put'), expectedRevision: z.number().int().min(0), payload: ProfileSchema }).strict(),
  z.object({ contractVersion: z.literal(1), operationId: uuid, kind: z.literal('session.put'), expectedRevision: z.number().int().min(0), payload: SessionSchema }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;

/** Saved results retain their IDs. Removal requires an explicit voided correction. */
export function validateSessionTransition(previous: Session | null, next: Session): Session {
  const parsed = SessionSchema.parse(next);
  if (!previous) return parsed;
  if (previous.id !== parsed.id || previous.startedAt !== parsed.startedAt || previous.origin !== parsed.origin) throw new Error('Session identity and start are immutable');
  for (const oldActivity of previous.activities) {
    const activity = parsed.activities.find(a => a.id === oldActivity.id);
    if (!activity) throw new Error('Saved activity cannot be omitted');
    for (const oldResult of oldActivity.results) {
      const result = activity.results.find(r => r.id === oldResult.id);
      if (!result) throw new Error('Saved result cannot be omitted; void it explicitly');
      if (result.kind !== oldResult.kind) throw new Error('Saved result kind cannot change');
    }
  }
  return parsed;
}
