import test from 'node:test';
import assert from 'node:assert/strict';
import { intakeQuestions, intakeSummary, intakeAnswers } from './fixedIntake.js';
import { checkedSummary, planDates } from './trainingSummary.js';
import { initialOutlinePrompt, preparePlainOutline, parsePlainOutline } from './plainOutline.js';
import { openAIProvider } from './onboardingProvider.js';
import { checkOverviewReview, overviewDays } from './outlinePlanning.js';
import { outlineInput } from './outlinePlanningFixture.js';
const answers = [
  'Stronger and comfortable walking. ' + 'Exact report '.repeat(45),
  'Walk twice weekly',
  'Floor and walking route',
  'No preference; coach chooses.',
  'None',
];
const dates = ['2026-10-10', '2026-10-11'];
const text = `## Saturday (2026-10-10)\n- Morning: Strength — 20–30 minutes\n  - Goal: Build strength without rushing.\n- Evening: Optional easy walk (15 min)\n  Goal: Relax and recover.\n## Sunday\nRest — no training.`;
test('five intake answers stay verbatim, including long answers, none and open arrangement', () => {
  assert.equal(intakeQuestions.length, 5);
  const summary = intakeSummary({ version: 1, answers });
  assert.deepEqual(intakeAnswers(checkedSummary(summary)), answers);
  assert(summary[0]!.text.length > 350);
  assert.throws(() => intakeSummary({ version: 1, answers: answers.slice(1) }));
  assert.throws(() =>
    checkedSummary(summary.map((f, i) => (i ? f : { ...f, origin: 'model_inference' }))),
  );
});
test('initial wire request is exactly the owner template, verbatim values and factual dates only', () => {
  const provider = openAIProvider({
    key: 'synthetic',
    model: 'gpt-6-luna',
    capMicro: 7000000,
    inputRate: 0.1,
    cachedRate: 0.01,
    cacheWriteRate: 0.125,
    outputRate: 0.5,
  });
  const input = { ...outlineInput(dates), summary: intakeSummary({ version: 1, answers }) };
  const request = JSON.parse(preparePlainOutline(provider, input).body);
  assert.deepEqual(request, {
    model: 'gpt-6-luna',
    store: false,
    stream: false,
    truncation: 'disabled',
    service_tier: 'default',
    reasoning: { effort: 'low' },
    max_output_tokens: 2000,
    input: `I want you to come up with an exercise plan for me. My goals are: ${answers[0]}. My current activity is: ${answers[1]}. My available equipment is: ${answers[2]}. My training preferences are: ${answers[3]}. My limitations are: ${answers[4]}. I want you to build a plan to help me achieve my goals. Return a high level plan for 2026-10-10 through 2026-10-11 inclusive, don't give exercises yet. Just return a list with days of the week up until Sunday, with each day's session(s) underneath it, the goal for each session and the rough time to complete the session.`,
  });
  assert.equal(request.input, initialOutlinePrompt(answers, dates));
  assert(!('instructions' in request));
  assert(!('text' in request));
  for (const now of ['2026-12-31T23:30:00Z', '2026-03-08T06:30:00Z', '2026-11-01T05:30:00Z']) {
    const d = planDates('America/New_York', new Date(now));
    assert(initialOutlinePrompt(answers, d).includes(`${d[0]} through ${d.at(-1)}`));
    assert.equal(new Date(d.at(-1)! + 'T12:00:00Z').getUTCDay(), 0);
  }
});
test('markdown conversion preserves sessions, ranges, goals, absent timing, optional and rest without quotas', () => {
  assert.equal(
    parsePlainOutline(text.replace('2026-10-10', 'October 10, 2026'), dates).days[0]!.date,
    dates[0],
  );
  const o = parsePlainOutline(text, dates);
  assert.equal(o.originalResponse, text);
  assert.equal(o.days[0]!.sessions.length, 2);
  const s = o.days[0]!.sessions[0]!;
  assert.deepEqual(s.plain?.durationRange, { min: 20, max: 30 });
  assert.equal(s.estimatedMinutes, undefined);
  assert.equal(s.plain?.goal, 'Build strength without rushing.');
  assert.equal(o.days[0]!.sessions[1]!.plain?.optional, true);
  assert.equal(o.days[1]!.restText, 'Rest — no training.');
  assert.equal(o.nutrition, undefined);
  const many = `Saturday\n${Array.from({ length: 4 }, (_, i) => `${i + 1}. Distinct session ${i + 1} (0.5 hours)\n   Purpose: Goal ${i + 1}`).join('\n')}\nSunday: Rest`;
  const m = parsePlainOutline(many, dates);
  assert.equal(m.days[0]!.sessions.length, 4);
  assert.deepEqual(
    m.days[0]!.sessions.map((s) => s.plain?.goal),
    ['Goal 1', 'Goal 2', 'Goal 3', 'Goal 4'],
  );
  assert.equal(m.days[0]!.sessions[0]!.timing, null);
  assert.equal(m.days[0]!.sessions[0]!.estimatedMinutes, 30);
});
test('incomplete, ambiguous or mismatched lists never become invented valid plans', () => {
  for (const raw of [
    'I cannot provide a plan.',
    text.replace('## Sunday\nRest — no training.', ''),
    text.replace('Sunday', 'Monday'),
    text.replace('20–30 minutes', 'a while'),
    text.replace('20–30 minutes', '20 minutes and walking 10 minutes'),
    text.replace('2026-10-10', '2026-10-17'),
    text.replace('2026-10-10', 'October 17, 2026'),
  ])
    assert.throws(() => parsePlainOutline(raw, dates), { code: 'outline_conversion' });
});
test('provider accepts plain output and retains incomplete text without JSON repair or extra dispatch', async () => {
  let calls = 0;
  let status = 'completed';
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
    async () => {
      calls++;
      return new Response(
        JSON.stringify({
          status,
          output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      );
    },
  );
  const body = preparePlainOutline(provider, {
    ...outlineInput(dates),
    summary: intakeSummary({ version: 1, answers }),
  }).body;
  const result = await provider.call(body, new AbortController().signal);
  assert.equal(result.rawText, text);
  assert.equal(result.proposal, undefined);
  assert.equal(calls, 1);
  status = 'incomplete';
  const failed = await provider.call(body, new AbortController().signal);
  assert.equal(failed.failure, 'incomplete');
  assert.equal(failed.rawText, text);
  assert.equal(calls, 2);
});

test('inline rest alternatives preserve optional work and original duration ranges', () => {
  const o = parsePlainOutline(
    'Saturday: Rest or optional easy walk (15–20 min)\nSunday: Rest',
    dates,
  );
  assert.equal(o.days[0]!.sessions.length, 1);
  assert(o.days[0]!.restText);
  assert(o.days[0]!.sessions[0]!.plain?.optional);
  assert.deepEqual(o.days[0]!.sessions[0]!.plain?.durationRange, { min: 15, max: 20 });
});

test('comma date headings no longer strand valid plain output; normal fields, optional rest and ranges survive', () => {
  const input = `### Saturday, October 10\n- Session 1: Strength practice\n  - Goal: Build strength\n  - Time: 20–30 minutes\n- Session 2: Optional walk | Goal: Recover gently | Time: 15–20 min\n### Sunday, October 11\nRest day\nGoal: Recovery\nTime: 0 minutes`;
  const outline = parsePlainOutline(input, dates);
  assert.equal(outline.originalResponse, input);
  assert.equal(outline.days[0]!.sessions.length, 2);
  assert.equal(outline.days[0]!.sessions[0]!.focus, 'Session 1: Strength practice');
  assert.equal(outline.days[0]!.sessions[0]!.plain?.goal, 'Build strength');
  assert.equal(outline.days[0]!.sessions[1]!.plain?.goal, 'Recover gently');
  assert.equal(outline.days[0]!.sessions[1]!.plain?.optional, true);
  assert.deepEqual(outline.days[0]!.sessions[1]!.plain?.durationRange, { min: 15, max: 20 });
  assert.equal(outline.days[1]!.sessions.length, 0);
  assert.match(outline.days[1]!.restText!, /Goal: Recovery/);
  for (const title of ['#### Strength practice', '**Strength practice**', 'Strength practice']) {
    const parsed = parsePlainOutline(
      `Saturday, 2026-10-10\n${title}\nGoal: Build strength\nTime: 0.5–0.75 hours\nTiming: Afternoon\nSunday: Rest`,
      dates,
    );
    assert.equal(parsed.days[0]!.sessions[0]!.focus, 'Strength practice');
    assert.equal(parsed.days[0]!.sessions[0]!.plain?.timingText, 'Afternoon');
    assert.deepEqual(parsed.days[0]!.sessions[0]!.plain?.durationRange, { min: 30, max: 45 });
  }
  const week = planDates('UTC', new Date('2026-10-06T12:00:00Z'));
  assert.match(
    initialOutlinePrompt(answers, week),
    /full Monday–Sunday calendar week, 2026-10-05 through 2026-10-11 inclusive/,
  );
});

test('adapter improvements preserve unchanged older plain outline representations during review', () => {
  const old = parsePlainOutline(text, dates);
  old.days[0]!.sessions[0]!.focus = 'Morning: Strength — 20–30 minutes';
  const input = {
    ...outlineInput(dates),
    review: {
      feedback: 'Keep the entire week unchanged.',
      context: null,
      outline: old,
      days: overviewDays(old),
    },
  };
  assert.deepEqual(
    checkOverviewReview(
      { outlineText: text, scope: [], reply: 'The entire week is unchanged.', question: null },
      input,
    ).week!.outline,
    old,
  );
});
