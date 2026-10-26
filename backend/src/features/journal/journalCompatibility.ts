// Legacy plan readers use strict row keys. Project optional hints only at transport;
// never rewrite saved plans, accepted history, source snapshots or operation digests.
export function legacyLoggingPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(legacyLoggingPayload);
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  const exercise = typeof object.exercise === 'string' && typeof object.prescription === 'string';
  return Object.fromEntries(
    Object.entries(object)
      .filter(([key]) => !exercise || key !== 'logging')
      .map(([key, v]) => [key, legacyLoggingPayload(v)]),
  );
}
