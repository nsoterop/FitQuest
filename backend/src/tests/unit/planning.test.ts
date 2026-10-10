const legacyDates = () =>
  Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 4).padStart(2, '0')}`);
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalog,
  eligibleActivities,
  activity,
  catalogIndex,
} from '../../features/planning/activityCatalog.js';
import {
  planDates,
  checkedSummary,
  summaryFromContext,
} from '../../features/planning/trainingSummary.js';
import {
  checkOutline,
  checkDetail,
  preparePlanning,
  savedDetail,
  checkGeneratableOutline,
} from '../../features/planning/planningDomain.js';
import {
  trainingFixture,
  fixtureOutline,
  fixtureDetail,
  fixturePrescription,
} from '../fixtures/planningFixture.js';
import { openAIProvider } from '../../ai/onboardingProvider.js';
import { applyProposal, emptyContext } from '../../features/onboarding/onboardingDomain.js';
import { planningLiveFixture } from '../fixtures/planningLiveFixture.js';

test('checked workbook export preserves IDs, review/source fields and excludes all unsafe alternative links', () => {
  assert.equal(
    catalog.sourceSha256,
    '2bff2097078d0e7e88ccf8258562efd82fab6135580422cb8b0c646b847c0ab8',
  );
  assert.equal(catalog.activities.length, 255);
  assert.equal(eligibleActivities.length, 251);
  assert.equal(catalog.activities.filter((a) => !a['Reference URL']).length, 143);
  for (const id of [...catalog.excluded, 'FQ-ACT-99999'])
    assert.throws(() => activity(id), { code: 'catalog_coverage' });
  for (const a of eligibleActivities) {
    assert.equal(a['Review status'], 'AI consistency reviewed');
    assert.equal(Object.keys(a).length, 28);
    for (const key of ['Easier alternative IDs', 'Harder alternative IDs'])
      for (const id of a[key] as string[]) assert.doesNotThrow(() => activity(id));
  }
  assert.equal(catalogIndex.length, 251);
});
test('every local weekday generates its full Monday–Sunday week across timezone, DST and year boundaries', () => {
  assert.deepEqual(planDates('Pacific/Kiritimati', new Date('2026-12-31T12:00:00Z')), [
    '2026-12-28',
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
  ]);
  assert.deepEqual(planDates('America/Los_Angeles', new Date('2026-10-04T02:00:00Z')), [
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
    '2026-10-04',
  ]);
  for (const [now, first, last] of [
    ['2026-03-08T04:30:00Z', '2026-03-02', '2026-03-08'],
    ['2026-03-08T08:30:00Z', '2026-03-02', '2026-03-08'],
    ['2026-11-01T03:30:00Z', '2026-10-26', '2026-11-01'],
    ['2026-11-01T07:30:00Z', '2026-10-26', '2026-11-01'],
  ]) {
    const days = planDates('America/New_York', new Date(now!));
    assert.equal(days[0], first);
    assert.equal(days.at(-1), last);
    assert.equal(days.length, 7);
  }
  for (let weekday = 0; weekday < 7; weekday++) {
    const now = new Date(Date.UTC(2026, 9, 5 + weekday, 12)),
      days = planDates('UTC', now);
    assert.equal(days.length, 7);
    assert.equal(days[0], '2026-10-05');
    assert.equal(days.at(-1), '2026-10-11');
    assert.equal(days[weekday], now.toISOString().slice(0, 10));
    assert.equal(new Set(days).size, 7);
  }
  assert.throws(() => planDates('not a time zone'), { code: 'invalid_timezone' });
});
test('summary is concise and provenance-preserving; no raw transcript fallback or fabricated report', () => {
  assert.deepEqual(checkedSummary(trainingFixture), trainingFixture);
  assert.throws(() => checkedSummary(trainingFixture.slice(1)), { code: 'invalid_summary' });
  const context = emptyContext();
  context.items.push({
    id: 'i1',
    topic: 'Athlete report',
    value: 'PRIVATE FULL CHAT',
    origin: 'user_report',
    review: 'unreviewed',
    source: 'm1',
    quote: 'PRIVATE FULL CHAT',
    supersedes: null,
    recordedAt: '',
  });
  assert.equal(JSON.stringify(summaryFromContext(context)).includes('PRIVATE'), false);
  const proposal = {
    trainingSummary: trainingFixture,
    reply: 'Recap',
    additions: [],
    nextQuestion: null,
    readiness: 'ready' as const,
    limitations: [],
  };
  assert.throws(() => applyProposal(context, proposal, { m1: 'unrelated' }, ''), {
    code: 'invalid_evidence',
  });
  const sources = Object.fromEntries(trainingFixture.map((f, i) => ['m' + i, f.text]));
  assert.deepEqual(applyProposal(context, proposal, sources, '').trainingSummary, trainingFixture);
});
test('outline and details allow multiple modalities, rest and measured work, reject invented IDs and hidden prose', () => {
  const dates = legacyDates();
  const outline = fixtureOutline(dates);
  assert.deepEqual(checkOutline(outline, dates), outline);
  const first = fixtureDetail(outline, dates[0]!);
  assert.equal(checkDetail(first, outline.days[0]!).sessions.length, 2);
  assert.deepEqual(checkDetail(fixtureDetail(outline, dates[1]!), outline.days[1]!).sessions, []);
  const bad = structuredClone(outline);
  bad.days[0]!.date = dates[1]!;
  assert.throws(() => checkOutline(bad, dates));
  for (const id of [catalog.excluded[0]!, 'FQ-ACT-99999']) {
    const d = structuredClone(first);
    d.sessions[0]!.activities[0]!.id = id;
    assert.throws(() => checkDetail(d, outline.days[0]!));
  }
  const repetitions = structuredClone(first);
  repetitions.sessions[1]!.activities[0]!.measure = 'repetitions';
  assert.throws(() => checkDetail(repetitions, outline.days[0]!));
  assert.throws(() => checkDetail({ ...first, notes: 'Do unlisted exercise' }, outline.days[0]!));
  const loaded = structuredClone(first);
  loaded.sessions[0]!.activities[0]!.load = 'kg';
  loaded.sessions[0]!.activities[0]!.loadKg = 20;
  assert.throws(() => checkDetail(loaded, outline.days[0]!));
  const coverage = { date: dates[0]!, sessions: [], coverage: ['equipment_or_facility_unknown'] };
  assert.deepEqual(checkDetail(coverage, outline.days[0]!), coverage);
  assert.equal(savedDetail(first).activities['FQ-ACT-00148']!.name, 'Outdoor walking');
});
test('bounded planning requests share the existing model adapter and reserve every possible output token', () => {
  const provider = openAIProvider({
    key: 'synthetic',
    model: 'gpt-6-luna',
    capMicro: 7000000,
    inputRate: 0.1,
    cachedRate: 0.01,
    cacheWriteRate: 0.125,
    outputRate: 0.5,
  });
  const dates = legacyDates(),
    outline = fixtureOutline(dates);
  for (const kind of ['outline', 'day'] as const) {
    const p = preparePlanning(provider, {
      kind,
      summary: trainingFixture,
      profile: { age: 30, heightInches: 68, weightLb: 155 },
      dates,
      ...(kind === 'day' ? { outline, date: dates[0] } : {}),
    });
    const body = JSON.parse(p.body);
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 2000);
    assert.ok(Buffer.byteLength(p.body) < 48000);
    assert.equal(p.reserveMicro, Math.ceil(Buffer.byteLength(p.body) * 0.125 + 1000));
    assert.match(body.instructions, /PRESCRIPTIONS only/);
  }
});
test('recorded live summary, dated mixed outline and walking phases still meet catalog contracts', () => {
  checkedSummary(planningLiveFixture['compact-summary'].trainingSummary);
  const outline = checkOutline(
    planningLiveFixture['seven-day-outline'],
    planningLiveFixture['seven-day-outline'].days.map((d) => d.date),
  );
  assert.equal(outline.days.filter((d) => d.sessions.length).length, 3);
  const detail = checkDetail(planningLiveFixture['tomorrow-details'], outline.days[0]!);
  assert.deepEqual(
    detail.sessions[0]!.activities.map((a) => a.phase),
    ['warmup', 'main', 'cooldown'],
  );
  assert.equal(
    detail.sessions[0]!.activities.reduce((n, a) => n + a.sets * a.amount, 0),
    1200,
  );
});

test('descriptive weekly labels preserve athlete-selected intent without relaxing activity validation', () => {
  const dates = legacyDates(),
    outline = fixtureOutline(dates);
  const labels = ['Upper body', 'Lower body', 'Mobility', 'Easy cardio', 'Tennis practice'];
  labels.forEach(
    (focus, i) => (outline.days[i]!.sessions = [{ focus, activityIds: ['FQ-ACT-00008'] }]),
  );
  assert.deepEqual(
    checkOutline(outline, dates)
      .days.slice(0, 5)
      .map((d) => d.sessions[0]!.focus),
    labels,
  );
  for (const focus of ['', '   ', 'x'.repeat(65), 'Upper\nbody']) {
    const bad = structuredClone(outline);
    bad.days[0]!.sessions[0]!.focus = focus;
    assert.throws(() => checkOutline(bad, dates), { code: 'invalid_plan' });
  }
  const invalid = structuredClone(outline);
  invalid.days[0]!.sessions[0]!.activityIds = ['FQ-ACT-00161'];
  assert.throws(() => checkOutline(invalid, dates), { code: 'catalog_coverage' });
});

test('oversized multi-session outlines are rejected before publication, with all catalog constraints retained', () => {
  const provider = openAIProvider({
    key: 'synthetic',
    model: 'gpt-6-luna',
    capMicro: 7000000,
    inputRate: 0.1,
    cachedRate: 0.01,
    cacheWriteRate: 0.125,
    outputRate: 0.5,
  });
  const dates = legacyDates(),
    ids = eligibleActivities.slice(0, 25).map((a) => String(a['Activity ID']));
  const outline = {
    coverage: [],
    days: dates.map((date, i) => ({
      date,
      sessions:
        i === 0
          ? [ids.slice(0, 9), ids.slice(9, 17), ids.slice(17)].map((activityIds) => ({
              focus: 'Mixed practice',
              activityIds,
            }))
          : [],
    })),
  };
  const input = {
    kind: 'outline' as const,
    summary: trainingFixture,
    profile: { age: 30, heightInches: 68, weightLb: 155 },
    dates,
  };
  checkOutline(outline, dates);
  assert.throws(() => checkGeneratableOutline(provider, input, outline), {
    code: 'outline_context_limit',
  });
  const supported = fixtureOutline(dates);
  checkGeneratableOutline(provider, input, supported);
  const prepared = preparePlanning(provider, {
    ...input,
    kind: 'day',
    outline: supported,
    date: dates[0],
    previous: [],
  });
  const payload = JSON.parse(JSON.parse(prepared.body).input);
  assert.deepEqual(
    payload.catalog,
    supported.days[0]!.sessions.flatMap((s) => s.activityIds).map(activity),
  );
});

test('late-week admission covers maximum saved prescriptions and rejects the first oversized candidate', () => {
  const provider = openAIProvider({
    key: 'synthetic',
    model: 'gpt-6-luna',
    capMicro: 7000000,
    inputRate: 0.1,
    cachedRate: 0.01,
    cacheWriteRate: 0.125,
    outputRate: 0.5,
  });
  const dates = legacyDates(),
    summary = trainingFixture.map((f) => ({ ...f, text: 'a'.repeat(350) }));
  const input = {
    kind: 'outline' as const,
    summary,
    profile: { age: 30, heightInches: 68, weightLb: 155 },
    dates,
  };
  const previous = dates.slice(0, 6).map((date) => ({
    date,
    sessions: [
      {
        activities: Array.from({ length: 15 }, (_, i) => ({
          ...fixturePrescription('FQ-ACT-00008', 'repetitions'),
          phase: i === 0 ? ('main' as const) : ('cooldown' as const),
          sets: 20,
          amount: 100,
          effort: 'challenging',
          restSeconds: 600,
          load: 'kg',
          loadKg: 0.0000012345678901234567,
          side: 'each',
        })),
      },
    ],
  }));
  let accepted = 0,
    rejected = 0,
    lastSize = 0;
  for (let count = 3; count <= 25; count++) {
    const ids = eligibleActivities.slice(0, count).map((a) => String(a['Activity ID']));
    const outline = {
      coverage: [],
      days: dates.map((date, i) => ({
        date,
        sessions:
          i < 6
            ? [{ focus: 'Upper body', activityIds: ['FQ-ACT-00008'] }]
            : [0, 1, 2].map((n) => ({
                focus: 'Mixed practice',
                activityIds: ids.filter((_, j) => j % 3 === n),
              })),
      })),
    };
    previous.forEach((d, i) => checkDetail({ ...d, coverage: [] }, outline.days[i]!));
    try {
      checkGeneratableOutline(provider, input, outline);
    } catch (e) {
      assert.equal((e as { code: string }).code, 'outline_context_limit');
      rejected++;
      continue;
    }
    accepted++;
    const p = preparePlanning(provider, {
      ...input,
      kind: 'day',
      outline,
      date: dates[6],
      previous,
    });
    lastSize = Buffer.byteLength(p.body);
    assert.ok(lastSize <= 48000);
    assert.equal(JSON.parse(JSON.parse(p.body).input).previous.length, 6);
    assert.equal(p.reserveMicro, Math.ceil(lastSize * 0.125 + 1000));
  }
  assert.ok(accepted > 0 && rejected > 0);
  assert.ok(lastSize > 35000);
});
