import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  validWeightMeasurement,
  validWeightCommand,
  weightToday,
} from './shared/weightContract.js';
test('dated weight accepts decimals in explicit units, rejects missing/invalid dates and never invents a profile measurement', () => {
  const m = { value: 70.125, unit: 'kg', date: '2024-02-29', timeZone: 'America/New_York' };
  assert(validWeightMeasurement(m));
  for (const patch of [
    { value: 0 },
    { value: -1 },
    { value: Infinity },
    { value: NaN },
    { unit: 'stone' },
    { date: '2026-02-29' },
    { timeZone: 'invalid' },
    { extra: true },
  ])
    assert(!validWeightMeasurement({ ...m, ...patch }));
  assert(!validWeightMeasurement(null));
  assert.equal(weightToday('America/New_York', new Date('2026-10-05T02:00:00Z')), '2026-10-04');
  const cmd = {
    kind: 'save',
    operationId: randomUUID(),
    entryId: null,
    expectedRevision: null,
    measurement: m,
  };
  assert(validWeightCommand(cmd));
  assert(!validWeightCommand({ ...cmd, expectedRevision: 1 }));
  assert(!validWeightCommand({ ...cmd, entryId: randomUUID() }));
  assert(
    validWeightCommand({
      kind: 'delete',
      operationId: randomUUID(),
      entryId: randomUUID(),
      expectedRevision: 1,
    }),
  );
});
