import assert from 'node:assert/strict';
import test from 'node:test';
import { dialogueFixtures } from './onboardingDialogueFixture.js';
import { recapQuestion, type ModelProposal } from './onboardingDomain.js';
import { renderOnboardingReply } from './onboardingReply.js';
const shoulder = dialogueFixtures.find(x => x.name === 'goals-shoulder')!;

test('recorded summary renders one closing invitation without losing its recap', () => {
  const proposal = shoulder.turns[3]!.proposal as ModelProposal;
  const rendered = renderOnboardingReply(proposal);
  assert.equal(rendered, `${proposal.reply}\n\n${recapQuestion}`);
  assert.equal(rendered.match(/Does that capture what matters\?/g)?.length, 1);
  assert.equal(rendered.match(/choose Continue/g)?.length, 1);
  assert.doesNotMatch(rendered,/Looks good/);
});
test('recorded correction preserves all factual sentences in the question field before one invitation', () => {
  const proposal = shoulder.turns[4]!.proposal as ModelProposal;
  const facts = proposal.nextQuestion!.text.slice(0, -' Does that capture what matters?'.length);
  const rendered = renderOnboardingReply(proposal);
  assert.equal(rendered, `${proposal.reply}\n\n${facts}\n\n${recapQuestion}`);
  assert.ok(rendered.includes('one flexible 30-minute session'));
  assert.ok(rendered.includes('public courts and a pull-up bar'));
  assert.ok(rendered.includes('its cause and significance are unknown'));
  assert.equal(rendered.match(/Does that capture what matters\?/g)?.length, 1);
});
test('recap cleanup is limited to standalone terminal invitations; ordinary questions and unfamiliar facts stay intact', () => {
  const base = shoulder.turns[4]!.proposal as ModelProposal;
  for (const text of ['The goal is to feel Ready?', 'Does that capture what matters? One session is realistic.', 'I use equipment called Ready?', 'Two 30-minute sessions; further details unknown.']) {
    const rendered = renderOnboardingReply({...base, nextQuestion: {...base.nextQuestion!, text}});
    assert.ok(rendered.includes(text));
  }
  const ordinary = {...base, nextQuestion: {topic: 'Availability', text: 'How long could a session be?', decision: 'Duration missing.'}};
  assert.equal(renderOnboardingReply(ordinary), `${base.reply}\n\nHow long could a session be?`);
});

test('previous deterministic typed-assent invitation is replaced without removing recap facts',()=>{
  const base=shoulder.turns[3]!.proposal as ModelProposal;
  const old='Does that capture what matters? Reply “Looks good” to finish onboarding, keep a concise editable training summary for planning and delete this conversation, or tell me what to change or add.';
  const rendered=renderOnboardingReply({...base,reply:`${base.reply} ${old}`,nextQuestion:{...base.nextQuestion!,text:old}});
  assert.equal(rendered,`${base.reply}\n\n${recapQuestion}`);assert.doesNotMatch(rendered,/Looks good/);
});
