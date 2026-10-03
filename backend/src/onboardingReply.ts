import { recapQuestion, recapTopic, type ModelProposal } from './onboardingDomain.js';

// Remove only standalone closing invitations, never a whole question field: the model
// can put factual recap sentences there. Unknown wording stays visible rather than
// risking removal of athlete facts. Match at a sentence/paragraph boundary and at the end.
const closingInvitations = [
  recapQuestion,
  'Does that capture what matters?',
  'Does this recap capture things accurately?',
  'Does this recap look right, or would you like to correct anything?',
  'Does this recap capture what you shared, or would you like to correct anything?',
  'Does this capture what you’ve shared?',
  'Ready?',
  'You can correct or add anything.',
  'You can correct or add anything, or say “Looks good” to finish initial onboarding.',
  'You can agree or tell me what to change.',
];
function recapFacts(text: string) {
  let result = text.trim();
  for (;;) {
    const ending = closingInvitations.find(invitation => result.endsWith(invitation) &&
      (result === invitation || /[.!?]\s+$|\n\s*$/.test(result.slice(0, -invitation.length))));
    if (!ending) return result;
    result = result.slice(0, -ending.length).trimEnd();
  }
}
export function renderOnboardingReply(proposal: ModelProposal) {
  const parts = [proposal.reply, proposal.nextQuestion?.text ?? ''];
  if (proposal.nextQuestion?.topic !== recapTopic) return parts.filter(Boolean).join('\n\n');
  return [...parts.map(recapFacts), recapQuestion].filter(Boolean).join('\n\n');
}
