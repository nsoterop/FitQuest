import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingService } from './onboarding.js';
import type { OnboardingStore, Conversation } from './onboardingStore.js';
import {
  opening,
  emptyContext,
  applyProposal,
  consistentReply,
  readyToPlan,
  acceptsRecap,
  recapTopic,
  type Context,
  type ModelInput,
  type ModelProposal,
} from './onboardingDomain.js';
import { serializeInput, validateProposal } from './onboardingProvider.js';
import { renderOnboardingReply } from './onboardingReply.js';
import { groupedLiveFixtures } from './onboardingGroupedLiveFixture.js';

const categories = ['goals', 'experience', 'availability', 'equipment', 'limitations'] as const;
const activityQuestion =
  'What activity are you doing now, and how often and for how long could training realistically fit your week?';
const equipmentQuestion =
  'What equipment or facilities can you use, and are there any limitations to account for?';
const knownProfileFields = ['first name', 'last name', 'height', 'weight', 'age', 'gender'];
function response(
  facts: Partial<Record<(typeof categories)[number], string>>,
  question: string | null,
  topic = 'Current activity and availability',
): ModelProposal {
  return {
    reply: question ? 'Thanks, that helps.' : Object.values(facts).join(' '),
    additions: [],
    trainingSummary: categories.map((category) => ({
      category,
      text: facts[category] ?? 'Not yet discussed.',
      origin: facts[category] ? 'model_inference' : 'unknown',
    })),
    planningCheck: question
      ? {
          status: 'question',
          question,
          reason: 'This practical detail helps match training to your situation.',
        }
      : { status: 'ready', question: null, reason: null },
    nextQuestion: {
      topic: question ? topic : recapTopic,
      text: question ?? 'Does that capture what matters?',
      decision: 'Ask only missing context or invite agreement.',
    },
    readiness: question ? 'needs_clarification' : 'ready_with_limits',
    limitations: ['Reports are not medical clearance.'],
  };
}
// Mocked responses exercise the same projection/validation/display path without claiming model quality.
function turn(context: Context, sources: Record<string, string>, proposal: ModelProposal) {
  const input: ModelInput = {
    context,
    sources,
    recent: Object.entries(sources).map(([source, text]) => ({ role: 'user', source, text })),
    knownProfileFields,
  };
  const request = JSON.parse(serializeInput(input, 'gpt-6-luna'));
  const projected = JSON.parse(request.input);
  assert.deepEqual(projected.sources, sources);
  assert.deepEqual(projected.context.skipped, context.skipped);
  assert.match(request.instructions, /ONE concise question about ONE topic group/);
  assert.match(request.instructions, /never combine availability with equipment/);
  assert.match(request.instructions, /skip groups already answered or declined/);
  assert.match(request.instructions, /planningCheck.question must match/);
  assert.doesNotMatch(request.instructions, /occasionally two tightly related/);
  const next = applyProposal(context, validateProposal(proposal), sources, '2026-10-04T00:00:00Z');
  const displayed = consistentReply(next, proposal),
    rendered = renderOnboardingReply(displayed);
  assert.equal((rendered.match(/\?/g) ?? []).length, 1);
  if (proposal.planningCheck?.status === 'question') {
    assert.equal(displayed.nextQuestion?.text, proposal.planningCheck.question);
    assert.doesNotMatch(rendered, /choose Continue/);
    assert.equal(readyToPlan(next), false);
  } else {
    assert.equal(readyToPlan(next), true);
    assert.match(rendered, /choose Continue/);
  }
  return { context: next, displayed, rendered, projected };
}
test('the actual fresh service opening asks goals alone without intake or a completion claim', async () => {
  const conversation: Conversation = {
    id: 'fresh',
    revision: 0,
    state: 'collecting',
    confirmedRevision: null,
    context: emptyContext(),
    turns: [],
    profileChanged: false,
  };
  const store = { create: async () => conversation } as unknown as OnboardingStore;
  const result = await onboardingService(store).create({
    userId: 'synthetic',
    sessionId: 'synthetic',
  });
  assert.equal(result.opening, opening);
  assert.match(result.opening, /improve|goals/);
  assert.equal((result.opening.match(/\?/g) ?? []).length, 1);
  assert.doesNotMatch(
    result.opening,
    /equipment|limitation|schedule|week|current training|Looks good/i,
  );
});
test('goals, current activity/time and equipment/limitations stay separate across turns before recap', () => {
  const facts = { goals: 'Tennis endurance first, plus a first pull-up.' };
  const sources = { m1: facts.goals };
  const first = turn(emptyContext(), sources, response(facts, activityQuestion));
  assert.doesNotMatch(
    first.displayed.nextQuestion!.text,
    /equipment|facilit|limitation|injur|goal/i,
  );
  const withActivity = {
    ...facts,
    experience: 'Plays tennis once weekly; strength beginner.',
    availability: 'Two flexible 30-minute sessions.',
  };
  const second = turn(
    first.context,
    { ...sources, m2: 'I play tennis weekly and can do two flexible 30-minute sessions.' },
    response(withActivity, equipmentQuestion, 'Equipment and limitations'),
  );
  assert.doesNotMatch(second.displayed.nextQuestion!.text, /how often|weekly|goals|current/i);
  const complete = {
    ...withActivity,
    equipment: 'Court and pull-up bar.',
    limitations: 'Mild ache only on overhead serves; walking comfortable.',
  };
  const third = turn(
    second.context,
    {
      ...sources,
      m3: 'Court and pull-up bar. Mild ache only on overhead serves; walking is comfortable.',
    },
    response(complete, null),
  );
  assert.equal(third.displayed.nextQuestion!.topic, recapTopic);
  assert.match(third.rendered, /overhead/);
  assert.equal(
    acceptsRecap({ state: 'completed', questionTopic: recapTopic }, 'Please summarize'),
    false,
  );
  assert.equal(acceptsRecap({ state: 'completed', questionTopic: recapTopic }, 'Looks good'), true);
});
test('all facts volunteered early permit recap without forcing three intake turns', () => {
  const facts = {
    goals: 'Coordination and swimming equally.',
    experience: 'Swims weekly.',
    availability: 'Two 20-minute sessions.',
    equipment: 'Pool and clear floor.',
    limitations: 'No limitations reported.',
  };
  const result = turn(
    emptyContext(),
    { m1: Object.values(facts).join(' ') },
    response(facts, null),
  );
  assert.equal(result.displayed.nextQuestion!.topic, recapTopic);
  assert.match(result.rendered, /Coordination and swimming equally/);
});
test('irregular availability and declined limitations leave only equipment to ask', () => {
  const context = emptyContext();
  context.skipped = ['Limitations'];
  const facts = {
    goals: 'Everyday balance.',
    experience: 'Walks occasionally.',
    availability: 'Changing shifts, sometimes 20 minutes, sometimes none; no fixed frequency.',
    limitations: 'Declined; unknown.',
  };
  const result = turn(
    context,
    { m1: Object.values(facts).join(' ') },
    response(facts, 'What equipment or facilities can you use?', 'Equipment'),
  );
  assert.doesNotMatch(
    result.displayed.nextQuestion!.text,
    /week|days|time|limitation|health|pain/i,
  );
  assert.match(
    result.context.trainingSummary!.find((f) => f.category === 'availability')!.text,
    /no fixed frequency/,
  );
  assert.deepEqual(result.context.skipped, ['Limitations']);
});
test('equipment and an adequately described mild limitation do not trigger another safety interview', () => {
  const facts = {
    goals: 'Tennis first and walking endurance.',
    experience: 'Plays weekly.',
    availability: 'Two flexible short sessions.',
    equipment: 'Court, walking path and floor.',
    limitations: 'Mild ache only with overhead serves; ordinary movement comfortable.',
  };
  const result = turn(
    emptyContext(),
    { m1: Object.values(facts).join(' ') },
    response(facts, null),
  );
  assert.equal(result.displayed.nextQuestion!.topic, recapTopic);
  assert.match(result.rendered, /Mild ache only/);
});
test('a correction updates recap without losing the other goals or completing on yes-but', () => {
  const facts = {
    goals: 'Tennis first, pull-up second.',
    experience: 'Plays weekly.',
    availability: 'Two 30-minute sessions.',
    equipment: 'Court and bar.',
    limitations: 'No restrictions reported.',
  };
  const first = turn(emptyContext(), { m1: Object.values(facts).join(' ') }, response(facts, null));
  const correction = 'Yes, but only one 20-minute session, not two. Keep both goals.';
  assert.equal(acceptsRecap({ state: 'completed', questionTopic: recapTopic }, correction), false);
  const revised = turn(
    first.context,
    { m1: Object.values(facts).join(' '), m2: correction },
    response({ ...facts, availability: 'One 20-minute session.' }, null),
  );
  assert.match(revised.rendered, /One 20-minute/);
  assert.match(revised.rendered, /Tennis first, pull-up second/);
  assert.doesNotMatch(revised.rendered, /Two 30-minute/);
});
test('clarification recovery uses saved facts and one missing detail without restarting grouped intake', () => {
  const facts = {
    goals: 'Comfortable walking.',
    experience: 'Walks occasionally.',
    availability: 'Three flexible 20-minute sessions.',
    equipment: 'Outdoor path.',
    limitations: 'Walking tolerance needs clarification.',
  };
  const context = emptyContext();
  context.trainingSummary = response(facts, null).trainingSummary!;
  context.recovery = { summaryRevision: 1, planId: 'saved-plan', target: 'week' };
  context.planningIssue = ['limitations_need_clarification'];
  const result = turn(
    context,
    { saved1: facts.goals, m1: 'Continue clarification' },
    response(facts, 'Is a short walk comfortable at present?', 'Walking limitation'),
  );
  assert.doesNotMatch(result.displayed.nextQuestion!.text, /goals|equipment|weekly|how often/i);
  assert.deepEqual(result.projected.context.recovery, context.recovery);
});

test('recorded Luna grouped conversation preserves pacing, irregular activity, correction and declined topics', () => {
  let context = emptyContext();
  let replies = 0;
  for (const fixture of groupedLiveFixtures) {
    if (fixture.name === 'early-facts-declined') context = emptyContext();
    const proposal = validateProposal(fixture.proposal);
    const sources = fixture.sources as Record<string, string>;
    if (fixture.failure) {
      assert.throws(() => applyProposal(context, proposal, sources, ''), {
        code: 'invalid_evidence',
      });
      continue;
    }
    context = applyProposal(context, proposal, sources, '');
    const displayed = consistentReply(context, proposal),
      rendered = renderOnboardingReply(displayed);
    replies++;
    assert.equal((rendered.match(/\?/g) ?? []).length, 1);
    assert.doesNotMatch(proposal.reply, /\?|please (tell|share)|let me know/i);
    if (fixture.name === 'goals-only') {
      assert.match(displayed.nextQuestion!.text, /activity/);
      assert.match(displayed.nextQuestion!.text, /week/);
      assert.doesNotMatch(displayed.nextQuestion!.text, /equipment|facilit|limitation|injur/i);
      assert.equal(readyToPlan(context), false);
    } else if (fixture.name === 'activity-irregular') {
      assert.match(displayed.nextQuestion!.text, /equipment/);
      assert.match(displayed.nextQuestion!.text, /limitation/);
      assert.doesNotMatch(displayed.nextQuestion!.text, /week|days|goals|current/i);
      assert.equal(readyToPlan(context), false);
      assert.match(JSON.stringify(context.trainingSummary), /tennis.*week/i);
      assert.match(JSON.stringify(context.trainingSummary), /walk/i);
    } else {
      assert.equal(displayed.nextQuestion!.topic, recapTopic);
      assert.equal(readyToPlan(context), true);
      assert.equal(
        rendered,
        `${proposal.reply}\n\n${renderOnboardingReply({ ...proposal, reply: '', nextQuestion: { ...proposal.nextQuestion!, text: '' } })}`,
      );
      assert.equal((rendered.match(/choose Continue/g) ?? []).length, 1);
      assert.doesNotMatch(rendered, /Please review|Please correct/);
      if (fixture.name === 'correction') {
        const availability = context.trainingSummary!.find(
          (f) => f.category === 'availability',
        )!.text;
        assert.match(availability, /one.*20.minute/i);
        assert.doesNotMatch(availability, /two|25/);
        assert.match(rendered, /tennis|pull-up/i);
      }
      if (fixture.name === 'early-facts-declined') {
        assert.match(rendered, /balance.*swimming.*equally/);
        assert.match(rendered, /unknown|preferred not/);
        assert.match(
          context.trainingSummary!.find((f) => f.category === 'availability')!.text,
          /var|fixed|sometimes/i,
        );
      }
    }
  }
  assert.equal(replies, 5);
});

test('summary and existing recap preserve distribution, per-session/day caps and examples across correction', () => {
  const facts = {
    goals: 'Walking endurance and mobility.',
    experience: 'Walks twice weekly.',
    equipment: 'Safe path and clear floor.',
    limitations: 'No relevant restrictions reported.',
  };
  for (const availability of [
    'Available morning and evening on three days; prefers one session daily, at most 30 minutes per day.',
    'Prefers separate morning and evening sessions on two days; at most 20 minutes per session and 35 minutes total per day. Morning walking is an example, not a requirement.',
    'Flexible session distribution and weekdays; up to 25 minutes total on two days.',
  ]) {
    const current = { ...facts, availability },
      result = turn(
        emptyContext(),
        { m1: Object.values(current).join(' ') },
        response(current, null),
      );
    assert.equal(result.displayed.nextQuestion!.topic, recapTopic);
    assert.ok(result.rendered.includes(availability));
    assert.equal(
      result.context.trainingSummary!.find((f) => f.category === 'availability')!.text,
      availability,
    );
  }
  const ambiguous = {
    ...facts,
    availability:
      'Can fit morning and evening; prefers short sessions, 30 minutes, scope of limit unknown.',
  };
  const question = 'Is 30 minutes your limit per session or for the whole day?';
  const missing = turn(
    emptyContext(),
    { m1: Object.values(ambiguous).join(' ') },
    response(ambiguous, question, 'Availability'),
  );
  assert.equal(missing.displayed.nextQuestion!.text, question);
  assert.doesNotMatch(missing.rendered, /choose Continue/);
  const correction =
    '30 minutes is the whole-day limit. I prefer one session, even when two slots are available.';
  const final = turn(
    missing.context,
    { m1: Object.values(ambiguous).join(' '), m2: correction },
    response({ ...facts, availability: correction }, null),
  );
  assert.ok(final.rendered.includes(correction));
  assert.equal(final.displayed.nextQuestion!.topic, recapTopic);
});

test('recorded v9 scheduling replies preserve preferences and caps; actual recap rendering supplies omitted scheduling facts once', async () => {
  const { readFileSync } = await import('node:fs');
  const fixtures = JSON.parse(
    readFileSync(new URL('../src/planningQualityLiveFixture.json', import.meta.url), 'utf8'),
  );
  for (const f of fixtures.onboarding) {
    const proposal = validateProposal(f.raw),
      context = applyProposal(f.input.context, proposal, f.input.sources, '');
    const display = consistentReply(context, proposal),
      rendered = renderOnboardingReply(display);
    assert.equal((rendered.match(/\?/g) ?? []).length, 1);
    const availability = context
      .trainingSummary!.filter((x) => x.category === 'availability')
      .map((x) => x.text)
      .join(' ');
    if (f.case === 'ambiguous-duration') {
      assert.notEqual(display.nextQuestion?.topic, recapTopic);
      assert.match(display.nextQuestion!.text, /each session.*total.*day/);
      assert.match(availability, /per session or per day/);
    } else {
      assert.equal(display.nextQuestion!.topic, recapTopic);
      assert.match(rendered, /choose Continue/);
      for (const fact of context.trainingSummary!.filter(
        (x) => x.category === 'availability' || x.category === 'goals',
      ))
        assert.ok(rendered.toLowerCase().includes(fact.text.toLowerCase()));
      if (f.case === 'distributed-volunteered') {
        for (const goal of [
          'walking endurance',
          'upper-body strength',
          'shoulder mobility',
          'acceleration technique',
        ])
          assert.ok(rendered.toLowerCase().includes(goal));
        console.log('Corrected recorded recap:\n' + rendered);
        assert.match(availability, /separate morning.*evening/);
        assert.match(availability, /25 minutes per session and 35 minutes total per day/);
      }
      if (f.case === 'single-correction') {
        assert.match(availability, /prefers one session per day/);
        assert.match(availability, /30-minute.*total training time per day/);
      }
      if (f.case === 'flexible') {
        assert.match(availability, /no fixed weekdays or preference for single versus split/);
        assert.match(availability, /25 minutes total per day/);
      }
    }
  }
});

test('explicit natural-language goal set survives intake, recap and planning input without planner-defined identities', async () => {
  const { expectedGoals, checkedSummary } = await import('./trainingSummary.js');
  const { prepareWeek } = await import('./weeklyPlanning.js');
  const { openAIProvider } = await import('./onboardingProvider.js');
  const facts = {
    goals: 'Join friends on long canal walks first; also feel comfortable carrying a picnic.',
    availability: 'One flexible 25-minute session on two days.',
    experience: 'Walks regularly.',
    equipment: 'Canal path and light household bag.',
    limitations: 'No limitations reported.',
  };
  const proposal = response(facts, null),
    goals = ['Join friends on long canal walks', 'Feel comfortable carrying a picnic'];
  proposal.trainingSummary!.forEach((f) => {
    f.goals = f.category === 'goals' ? goals : null;
  });
  validateProposal(proposal, true);
  const omitted = structuredClone(proposal);
  delete omitted.trainingSummary![0]!.goals;
  assert.throws(() => validateProposal(omitted, true), { code: 'invalid_model_output' });
  const result = turn(emptyContext(), { m1: Object.values(facts).join(' ') }, proposal);
  assert.deepEqual(
    expectedGoals(result.context.trainingSummary!),
    goals.map((goal, goalIndex) => ({ sourceIndex: 0, goalIndex, goal })),
  );
  for (const goal of goals) assert.ok(result.rendered.toLowerCase().includes(goal.toLowerCase()));
  const body = JSON.parse(
    prepareWeek(
      openAIProvider({
        key: 'synthetic',
        model: 'gpt-6-luna',
        capMicro: 7000000,
        inputRate: 0.1,
        cachedRate: 0.01,
        cacheWriteRate: 0.125,
        outputRate: 0.5,
      }),
      {
        kind: 'week',
        qualityVersion: 2,
        summary: result.context.trainingSummary!,
        profile: { age: 32, heightInches: 68, weightLb: 155 },
        dates: [],
      },
    ).body,
  );
  assert.deepEqual(
    JSON.parse(body.input).expectedGoals,
    expectedGoals(result.context.trainingSummary!),
  );
  const bad = structuredClone(result.context.trainingSummary!);
  bad[0]!.goals = [goals[0]!, goals[0]!.toLowerCase()];
  assert.throws(() => checkedSummary(bad), { code: 'invalid_summary' });
  const repeated = renderOnboardingReply({
    ...proposal,
    reply: `${facts.goals} ${facts.availability}`,
  });
  assert.equal(repeated.split(facts.goals).length - 1, 1);
  assert.equal(repeated.split(facts.availability).length - 1, 1);
});

test('known preferences and coach-chosen arrangements proceed without a preference question', () => {
  const facts = {
    goals: 'Enjoy walking.',
    experience: 'Walks twice weekly.',
    equipment: 'Safe walking path.',
    limitations: 'No limitations reported.',
  };
  for (const availability of [
    'I prefer shorter sessions spread throughout the day, 20 minutes per session.',
    'One main session is my preference, even though two slots are available.',
    'A mix is fine; leave the arrangement to you.',
    'No preference; unknown days are fine.',
  ]) {
    const result = turn(
      emptyContext(),
      { m1: Object.values(facts).join(' '), m2: availability },
      response({ ...facts, availability }, null),
    );
    assert.equal(result.displayed.nextQuestion!.topic, recapTopic);
    assert.ok(result.rendered.includes(availability));
  }
  const result = turn(
    emptyContext(),
    {
      m1: Object.values(facts).join(' '),
      m2: 'Morning and evening are available, 20 minutes each.',
    },
    response(
      { ...facts, availability: 'Morning and evening are available, 20 minutes each.' },
      null,
    ),
  );
  assert.equal(result.displayed.nextQuestion!.topic, recapTopic);
  assert.match(result.rendered, /Morning and evening/);
  const input: ModelInput = {
    context: emptyContext(),
    sources: {},
    recent: [],
    knownProfileFields,
  };
  const instructions = JSON.parse(serializeInput(input, 'synthetic')).instructions;
  assert.match(
    instructions,
    /Missing distribution preference is not missing feasibility information/,
  );
  assert.doesNotMatch(instructions, /optionally ask|What would a training day you enjoy/);
  assert.match(instructions, /Never require program design/);
});
