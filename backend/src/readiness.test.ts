const legacyDates = () =>
  Array.from({ length: 7 }, (_, i) => `2026-10-${String(i + 4).padStart(2, '0')}`);
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProposal,
  consistentReply,
  emptyContext,
  readyToPlan,
  recapTopic,
  type ModelProposal,
} from './onboardingDomain.js';
import { validateProposal } from './onboardingProvider.js';
import { renderOnboardingReply } from './onboardingReply.js';
import { trainingFixture, fixtureOutline, fixtureDetail } from './planningFixture.js';
import { checkOutline, checkDetail } from './planningDomain.js';
import { planDates } from './trainingSummary.js';

const summary = trainingFixture.map((f) => ({ ...f, origin: 'model_inference' as const }));
const proposal: ModelProposal = {
  trainingSummary: summary,
  planningCheck: { status: 'ready', question: null, reason: null },
  reply: 'A factual recap.',
  additions: [],
  nextQuestion: { topic: recapTopic, text: 'Ready?', decision: 'Practical context is sufficient.' },
  readiness: 'ready_with_limits',
  limitations: ['Reports are not medical clearance.'],
};
const apply = (value: ModelProposal) =>
  applyProposal(emptyContext(), validateProposal(value), {}, new Date().toISOString());
test('a concrete indispensable question replaces a premature recap and its finish invitation', () => {
  const bad = {
    ...proposal,
    planningCheck: {
      status: 'question' as const,
      question: 'Does the shoulder discomfort occur only when serving overhead?',
      reason: 'This determines which movements to avoid.',
    },
  };
  const context = apply(bad),
    display = consistentReply(context, bad);
  assert.equal(readyToPlan(context), false);
  assert.notEqual(display.nextQuestion?.topic, recapTopic);
  assert.equal(
    renderOnboardingReply(display),
    `${bad.planningCheck.reason}\n\n${bad.planningCheck.question}`,
  );
  assert.equal(renderOnboardingReply(display).includes('choose Continue'), false);
  assert.throws(() => apply({ ...proposal, readiness: 'needs_clarification' }), {
    code: 'invalid_model_output',
  });
});
test('known mild restriction, optional unknown and general disclaimer do not independently block completion', () => {
  for (const limitation of [
    'Mild discomfort only serving overhead; ordinary walking is comfortable.',
    'No limitations reported.',
    'Optional preferred training time skipped.',
  ]) {
    const value = {
      ...proposal,
      trainingSummary: summary.map((f) =>
        f.category === 'limitations' ? { ...f, text: limitation, origin: 'unknown' as const } : f,
      ),
    };
    const context = apply(value);
    context.items.push({
      id: 'uncertain',
      topic: 'Optional preference',
      value: 'Unknown',
      origin: 'unknown',
      review: 'disputed',
      source: '',
      quote: '',
      recordedAt: '',
      supersedes: null,
    });
    assert.equal(readyToPlan(context), true);
    assert.match(renderOnboardingReply(consistentReply(context, value)), /choose Continue/);
  }
});
test('declining an indispensable answer offers an exit without repeated question or false finish', () => {
  const value = {
    ...proposal,
    planningCheck: {
      status: 'unavailable' as const,
      question: null,
      reason:
        'Without knowing whether any walking is possible, I cannot select the requested walking sessions.',
    },
  };
  const context = apply(value),
    display = consistentReply(context, value);
  assert.equal(readyToPlan(context), false);
  assert.equal(display.nextQuestion, null);
  assert.match(display.reply, /Back to greeting/);
  assert.match(display.reply, /usable plan is not ready/);
  assert.doesNotMatch(display.reply, /choose Continue/);
});
test('clarification is distinct from catalog failure and cannot coexist with prescribed work', () => {
  const dates = legacyDates(),
    outline = fixtureOutline(dates),
    clarification = {
      question: 'Is a stable wall available where you train?',
      reason: 'The selected support exercise requires a stable wall.',
    };
  assert.throws(() => checkOutline({ ...outline, clarification }, dates), { code: 'invalid_plan' });
  const blocked = {
    ...outline,
    clarification,
    days: dates.map((date) => ({ date, sessions: [] })),
  };
  assert.deepEqual(checkOutline(blocked, dates), blocked);
  assert.throws(() => checkOutline({ ...blocked, coverage: ['missing_catalog_coverage'] }, dates), {
    code: 'invalid_plan',
  });
  assert.throws(
    () => checkDetail({ ...fixtureDetail(outline, dates[0]!), clarification }, outline.days[0]!),
    { code: 'invalid_plan' },
  );
  assert.equal(
    checkDetail({ date: dates[0], sessions: [], coverage: [], clarification }, outline.days[0]!)
      .clarification?.question,
    clarification.question,
  );
});

test('saved inferences cannot become user reports merely by being quoted during recovery', () => {
  const context = {
    ...emptyContext(),
    items: [
      {
        id: 'i1',
        topic: 'limitations',
        value: 'May prefer avoiding overhead work.',
        origin: 'model_inference' as const,
        review: 'unreviewed' as const,
        source: 'saved1',
        quote: 'May prefer avoiding overhead work.',
        recordedAt: '',
        supersedes: null,
      },
    ],
  };
  const value = {
    ...proposal,
    trainingSummary: summary.map((f) =>
      f.category === 'limitations'
        ? { ...f, text: context.items[0]!.value, origin: 'user_report' as const }
        : f,
    ),
  };
  assert.throws(() => applyProposal(context, value, { saved1: context.items[0]!.value }, ''), {
    code: 'invalid_evidence',
  });
  assert.doesNotThrow(() =>
    applyProposal(
      context,
      { ...value, trainingSummary: summary },
      { saved1: context.items[0]!.value },
      '',
    ),
  );
});

test('recorded Luna clarification preserves the answered restriction through a usable outline and tomorrow detail', async () => {
  const { readinessLiveFixture: f } = await import('./readinessLiveFixture.js');
  const initial = applyProposal(
    emptyContext(),
    validateProposal(f.question),
    { m1: f.message },
    '',
  );
  const question = consistentReply(initial, f.question as ModelProposal);
  assert.equal(readyToPlan(initial), false);
  assert.match(question.nextQuestion!.text, /movement/);
  assert.doesNotMatch(renderOnboardingReply(question), /choose Continue/);
  const final = applyProposal(
    initial,
    validateProposal(f.recap),
    { m1: f.message, m2: f.answer },
    '',
  );
  assert.equal(readyToPlan(final), true);
  assert.equal(f.recap.nextQuestion.topic, recapTopic);
  assert.ok(final.trainingSummary!.some((f) => /overhead/.test(f.text)));
  assert.ok(final.trainingSummary!.some((f) => /skipped/.test(f.text)));
  const outline = checkOutline(
    f.outline,
    f.outline.days.map((d) => d.date),
  );
  assert.equal(outline.coverage.length, 0);
  assert.equal(outline.clarification, null);
  const detail = checkDetail(f.detail, outline.days[0]!);
  assert.equal(detail.coverage.length, 0);
  assert.equal(detail.clarification, null);
  assert.ok(detail.sessions.length);
});
