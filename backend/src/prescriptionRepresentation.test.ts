import test from 'node:test';
import assert from 'node:assert/strict';
import { Ajv } from 'ajv';
import {
  activity,
  eligibleActivities,
  catalogDigest,
  completeSelectionCatalog,
  selectionCatalog,
  supportedTargetKinds,
  repetitionCountAlias,
} from './activityCatalog.js';
import {
  unitWireFixture,
  completeFixture,
  completeOutlineFixture,
  syntheticAnswers,
} from './completePlanFixture.js';
import { checkComplete, prepareComplete } from './completePlanning.js';
import {
  completeResponseSchema,
  encodeCompleteWire,
  decodeCompleteWire,
} from './completePlanWire.js';
import { validCompletePlan } from './shared/completePlanContract.js';
import { intakeSummary } from './fixedIntake.js';
import { openAIProvider } from './onboardingProvider.js';
const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${String(5 + i).padStart(2, '0')}`);
const input = {
  kind: 'week' as const,
  summary: intakeSummary({ version: 1, answers: syntheticAnswers }),
  dates,
  profile: { age: 30, heightInches: 68, weightLb: 155 },
};
const raw = () => unitWireFixture(dates).wire as any;
const ex = (w: any) => w.result.days[1].sessions[0].blocks[0].exercises[0];
test('explicit minutes convert exact/ranged work, active and passive recovery once; seconds and session structure remain exact', () => {
  const { wire, expected } = unitWireFixture(dates),
    before = structuredClone(wire);
  const result = checkComplete(wire, input);
  assert.deepEqual(result, { result: { kind: 'plan', plan: expected } });
  assert.deepEqual(wire, before);
  const exact = raw();
  Object.assign(ex(exact), { targetMin: 2, targetMax: 2 });
  let checked = checkComplete(exact, input);
  assert.equal(checked.result.kind, 'plan');
  if (checked.result.kind === 'plan')
    assert.deepEqual(checked.result.plan.days[1]!.sessions[0]!.blocks[0]!.exercises[0]!.target, {
      kind: 'duration',
      seconds: { min: 120, max: 120 },
    });
  const native = raw();
  Object.assign(ex(native), { durationUnit: 'seconds', targetMin: 2, targetMax: 3 });
  checked = checkComplete(native, input);
  if (checked.result.kind === 'plan')
    assert.deepEqual(checked.result.plan.days[1]!.sessions[0]!.blocks[0]!.exercises[0]!.target, {
      kind: 'duration',
      seconds: { min: 2, max: 3 },
    });
  assert.deepEqual(
    decodeCompleteWire(encodeCompleteWire({ result: { kind: 'plan', plan: expected } })),
    { result: { kind: 'plan', plan: expected } },
  );
});
test('units are required, bounded and target-specific; malformed recovery/units retain diagnostics', () => {
  const mutations = [
    (w: any) => delete ex(w).durationUnit,
    (w: any) => (ex(w).durationUnit = 'hours'),
    (w: any) => (ex(w).durationUnit = null),
    (w: any) => (ex(w).targetKind = 'count'),
    (w: any) => (ex(w).targetMin = 4),
    (w: any) => {
      ex(w).targetMin = 2000;
      ex(w).targetMax = 2000;
    },
    (w: any) => (w.result.days[1].sessions[0].blocks[0].recoveryActivity.durationUnit = null),
    (w: any) => (w.result.days[0].sessions[0].blocks[0].recoveryRestUnit = null),
    (w: any) => (w.result.days[0].sessions[1].blocks[0].recoveryRestUnit = 'seconds'),
    (w: any) => {
      const b = w.result.days[0].sessions[0].blocks[0];
      b.recoveryRestMin = 61;
      b.recoveryRestMax = 61;
    },
  ];
  for (const mutate of mutations) {
    const w = raw();
    mutate(w);
    assert.throws(() => checkComplete(w, input));
  }
  const w = raw();
  w.result.days[1].sessions[0].blocks[0].recoveryActivity.durationUnit = null;
  assert.throws(
    () => checkComplete(w, input),
    (e: any) =>
      e.diagnostic.stage === 'conversion' &&
      e.diagnostic.rule === 'unit' &&
      e.diagnostic.recovery === true &&
      e.diagnostic.day === 1,
  );
  const valid = new Ajv({ strict: true }).compile(completeResponseSchema);
  assert(valid(raw()));
  const missing = raw();
  delete ex(missing).durationUnit;
  assert(!valid(missing));
});
test('primary event repetition aliases preserve count, ranges and sides without accepting incompatible modes or RIR', () => {
  for (const id of ['FQ-ACT-00183', 'FQ-ACT-00184', 'FQ-ACT-00167']) {
    const w = raw(),
      e = w.result.days[0].sessions[1].blocks[0].exercises[1];
    Object.assign(e, {
      activityId: id,
      targetKind: 'repetitions',
      targetMin: 5,
      targetMax: 8,
      loadValue: null,
      loadUnit: null,
    });
    const checked = checkComplete(w, input);
    if (checked.result.kind === 'plan') {
      const saved = checked.result.plan.days[0]!.sessions[1]!.blocks[0]!.exercises[1]!;
      assert.deepEqual(saved.target, { kind: 'count', count: { min: 5, max: 8 } });
      assert.equal(saved.perSide, true);
    }
    e.targetKind = 'count';
    assert.equal(checkComplete(w, input).result.kind, 'plan');
    e.targetKind = 'repetitions';
    e.rirMin = 2;
    e.rirMax = 3;
    assert.throws(() => checkComplete(w, input), { code: 'invalid_plan:week_schema' });
  }
  const recovery = raw(),
    b = recovery.result.days[1].sessions[0].blocks[0];
  Object.assign(b.recoveryActivity, {
    activityId: 'FQ-ACT-00184',
    targetKind: 'repetitions',
    targetMin: 5,
    targetMax: 8,
    durationUnit: null,
    perSide: true,
  });
  const recovered = checkComplete(recovery, input);
  if (recovered.result.kind === 'plan')
    assert.deepEqual(
      recovered.result.plan.days[1]!.sessions[0]!.blocks[0]!.recovery!.activity!.target,
      { kind: 'count', count: { min: 5, max: 8 } },
    );
  const many = raw(),
    event = many.result.days[0].sessions[1].blocks[0].exercises[1];
  Object.assign(event, {
    activityId: 'FQ-ACT-00167',
    targetMin: 200,
    targetMax: 300,
    loadValue: null,
    loadUnit: null,
  });
  const result = checkComplete(many, input);
  if (result.result.kind === 'plan')
    assert.deepEqual(result.result.plan.days[0]!.sessions[1]!.blocks[0]!.exercises[1]!.target, {
      kind: 'count',
      count: { min: 200, max: 300 },
    });
  for (const id of ['FQ-ACT-00148', 'FQ-ACT-00162', 'FQ-ACT-00228']) {
    const w = raw();
    Object.assign(w.result.days[0].sessions[1].blocks[0].exercises[1], {
      activityId: id,
      loadValue: null,
      loadUnit: null,
    });
    assert.throws(() => checkComplete(w, input), { code: 'catalog_coverage' });
    assert.equal(repetitionCountAlias(activity(id)), false);
  }
  for (const id of [
    'FQ-ACT-00161',
    'FQ-ACT-00176',
    'FQ-ACT-00188',
    'FQ-ACT-00206',
    'FQ-ACT-99999',
    'private-invalid-id',
  ]) {
    const w = raw();
    ex(w).activityId = id;
    assert.throws(() => checkComplete(w, input));
  }
  const timedThrow = raw();
  Object.assign(ex(timedThrow), {
    activityId: 'FQ-ACT-00183',
    durationUnit: 'seconds',
    targetMin: 5,
    targetMax: 5,
  });
  assert.throws(
    () => checkComplete(timedThrow, input),
    (e: any) =>
      e.code === 'catalog_coverage' &&
      e.diagnostic.rule === 'tracking' &&
      e.diagnostic.allowedKinds.includes('repetitions') &&
      e.diagnostic.allowedKinds.includes('count'),
  );
  const lift = completeFixture(dates),
    e = lift.days[0]!.sessions[0]!.blocks[0]!.exercises[0]!;
  Object.assign(e, {
    activityId: 'FQ-ACT-00046',
    target: { kind: 'repetitions', reps: { min: 8, max: 12 } },
    load: { value: 10, unit: 'kg' },
    effort: { rpe: null, rir: { min: 2, max: 3 }, cue: null },
  });
  assert.equal(
    checkComplete(encodeCompleteWire({ result: { kind: 'plan', plan: lift } }), input).result.kind,
    'plan',
  );
  e.target = { kind: 'count', count: { min: 8, max: 12 } };
  e.effort = null;
  assert.throws(
    () => checkComplete(encodeCompleteWire({ result: { kind: 'plan', plan: lift } }), input),
    { code: 'catalog_coverage' },
  );
});
test('derived selection metadata matches validation for all eligible IDs without changing source catalog or existing projection', () => {
  assert.equal(eligibleActivities.length, 251);
  assert.equal(completeSelectionCatalog.rows.length, 251);
  assert.deepEqual(completeSelectionCatalog.columns.slice(0, -2), selectionCatalog.columns);
  assert.deepEqual(
    completeSelectionCatalog.rows.map((row) => row.slice(0, -2)),
    selectionCatalog.rows,
  );
  for (const [i, a] of eligibleActivities.entries()) {
    assert.deepEqual(completeSelectionCatalog.rows[i]!.at(-2), supportedTargetKinds(a));
    const alias = completeSelectionCatalog.rows[i]!.at(-1);
    assert.equal(alias !== 'none', repetitionCountAlias(a));
  }
  assert.equal(catalogDigest, '7de5794a465ebf27fdace722da116118d487985b9c8294a7bb69904b70c69c9f');
});
test('new producer format passes the real provider adapter, validator and revision protections with one dispatch', async () => {
  let calls = 0;
  const { wire, expected } = unitWireFixture(dates);
  const provider = openAIProvider(
    {
      key: 'synthetic',
      model: 'gpt-6-luna',
      capMicro: 7000000,
      inputRate: 0.1,
      cachedRate: 0.01,
      cacheWriteRate: 0.125,
      outputRate: 0.5,
    },
    async (_url, init) => {
      calls++;
      const r = JSON.parse(String(init!.body));
      assert.equal(r.text.format.name, 'complete_week_units_v2');
      assert(new Ajv({ strict: true }).compile(r.text.format.schema)(wire));
      assert.equal(r.max_output_tokens, 48000);
      return new Response(
        JSON.stringify({
          status: 'completed',
          usage: { input_tokens: 100, output_tokens: 4000 },
          output: [
            { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(wire) }] },
          ],
        }),
      );
    },
  );
  const r = await provider.call(
    prepareComplete(provider, { ...input, completeOutlineText: completeOutlineFixture(expected) })
      .body,
    new AbortController().signal,
  );
  assert.equal(calls, 1);
  assert.deepEqual(checkComplete(r.proposal, input), { result: { kind: 'plan', plan: expected } });
  const review = {
      ...input,
      completeReview: { plan: expected, feedback: 'Shorten Tuesday. Keep Monday unchanged.' },
    },
    next = unitWireFixture(dates, true);
  assert.deepEqual(checkComplete(next.wire, review), {
    result: { kind: 'plan', plan: next.expected },
  });
  if (next.wire.result.kind === 'plan')
    next.wire.result.days[0]!.sessions[0]!.blocks[0]!.recoveryRestMax = 1;
  assert.throws(() => checkComplete(next.wire, review), { code: 'saved_day_changed' });
  const old = completeFixture(dates);
  old.days[0]!.sessions[0]!.blocks[0]!.exercises[0]!.target = {
    kind: 'duration',
    seconds: { min: 2, max: 2 },
  };
  assert(validCompletePlan(old, dates));
  assert.deepEqual(
    decodeCompleteWire(encodeCompleteWire({ result: { kind: 'plan', plan: old } })),
    { result: { kind: 'plan', plan: old } },
  );
});
