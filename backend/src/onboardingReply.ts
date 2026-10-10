import { recapQuestion, recapTopic, type ModelProposal } from './onboardingDomain.js';

// Remove only standalone closing invitations, never a whole question field: the model
// can put factual recap sentences there. Unknown wording stays visible rather than
// risking removal of athlete facts. Match at a sentence/paragraph boundary and at the end.
const closingInvitations = [
  recapQuestion,
  'Does that capture what matters? Reply “Looks good” to finish onboarding, keep a concise editable training summary for planning and delete this conversation, or tell me what to change or add.',
  'Does that capture what matters?',
  'Does this recap capture things accurately?',
  'Does this recap look right, or would you like to correct anything?',
  'Does this recap capture what you shared, or would you like to correct anything?',
  'Does this recap reflect your goals and practical constraints, or would you like to correct anything?',
  'Does this capture what you’ve shared?',
  'Ready?',
  'You can correct or add anything.',
  'You can correct or add anything, or say “Looks good” to finish initial onboarding.',
  'You can agree or tell me what to change.',
  'Please review this recap and let me know if you agree or want to correct anything.',
  'Please review this updated recap and let me know if it captures what matters or if you’d like to correct anything.',
  'Please correct anything that doesn’t fit, or let me know if this recap looks right.',
  'Please correct anything I’ve misunderstood or agree if this is right.',
];
function recapFacts(text: string) {
  let result = text.trim();
  for (;;) {
    const ending = closingInvitations.find(
      (invitation) =>
        result.endsWith(invitation) &&
        (result === invitation || /[.!?]\s+$|\n\s*$/.test(result.slice(0, -invitation.length))),
    );
    if (!ending) return result;
    result = result.slice(0, -ending.length).trimEnd();
  }
}
export function renderOnboardingReply(proposal: ModelProposal) {
  const parts = [proposal.reply, proposal.nextQuestion?.text ?? ''];
  if (proposal.nextQuestion?.topic !== recapTopic) return parts.filter(Boolean).join('\n\n');
  const facts = parts.map(recapFacts);
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  let visible = normalize(facts.join(' '));
  for (const [category, label] of [
    ['goals', 'Goals'],
    ['availability', 'Schedule understood as'],
    ['nutrition', 'Nutrition context'],
  ] as const) {
    // Exact retained facts are the fallback for generic acknowledgments. New goal
    // lists are also shown, so agreement covers the identities planning will use.
    const retained = proposal.trainingSummary?.filter((f) => f.category === category) ?? [];
    const texts = retained.flatMap((f) => [
      f.text,
      ...(category === 'goals' ? (f.goals ?? []) : []),
    ]);
    const missing: string[] = [];
    for (const text of texts) {
      if (!visible.includes(normalize(text))) {
        missing.push(text);
        visible += ' ' + normalize(text);
      }
    }
    if (missing.length) facts.push(`${label}: ${missing.join(' ')}`);
  }
  return [...facts, recapQuestion].filter(Boolean).join('\n\n');
}
