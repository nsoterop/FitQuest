# FitQuest · Full onboarding mockups

Added in response to the owner's request for the missing onboarding pages. Same approved visual direction as design study 02; design artifacts only. Open `onboarding.html` locally or use the Full onboarding flow link from `index.html`.

## Included views

1. Create account with email/password, password visibility and sign-in link.
2. Returning sign-in.
3. Email confirmation, return to sign-in and correction of the email address.
4. Required profile: first/last name, height in feet/inches, age, weight in pounds, free-text gender including “Prefer not to say.”
5. Existing before-intake disclosure, restyled with a visible explanation and expandable full data details.
6. Goals question.
7. Current activity question.
8. Equipment question.
9. Schedule question, including openness to multiple sessions and the option to leave arrangement to the coach.
10. Limitations question; “None” is valid.
11. Final state of the same intake: all five original answers, Edit actions and Generate plan. No model recap or sixth question.
12. Generation in progress.
13. Failed initial generation, preserving answers and requiring an explicit retry.
14. Failed device-draft save, retaining the typed text.
15. Keyboard-visible intake illustration.

The simulator's finished-outline shortcut opens the existing full Monday–Sunday review. Use this plan reveals the saved workout details. The shortcut is review tooling outside the proposed live behavior; it makes no model call.

## Sources and constraints

Read the current `mobile/src/AccountPanel.tsx`, `ProfileIntakeForm.tsx`, `profileIntake.ts`, `FixedIntakeForm.tsx`, `OnboardingScreen.tsx` and `backend/src/fixedIntake.ts`. Existing email/password authentication, confirmation and required profile fields were preserved. No Apple login, new password policy, food questionnaire, extra planning question or additional permission request was introduced.

The exact five questions and current one-request privacy disclosure come from the fixed-intake source. The old mobile disclosure still describes a second request and exercise catalog; the design follows the newer accepted one-request document-plan instruction instead. No source fix was made by Design.

Planning remains 18+. An under-18 profile cannot proceed to the planning questions in this prototype. The production service remains responsible for actual eligibility, authentication and ownership enforcement. No real credential or private profile data was read or used.

## Interaction details

- Continue reveals one question at a time and is disabled for a blank answer. Answers remain faithful to what was typed.
- Earlier answers are available through an expandable history with labeled Edit buttons. Editing returns to the current unanswered question, or to Generate plan if all five were already submitted. Cancel leaves the earlier answer intact.
- The final answers view is a state of the same intake, not a new mandatory confirmation step. Generate plan is available directly after answer five.
- Profile saving and authentication are simulated. Returning users in production must restore their existing profile/progress rather than being forced through setup again. The prototype follows a new-account walkthrough after sign-in.
- Draft-save failure keeps text visible. Retry repairs the simulated draft and returns to the same question before continuation. Initial generation failure does not claim an earlier plan exists. A generation with an unknown result must check its outcome before offering a new paid dispatch; do not treat that as the illustrated definitive failure.
- Native implementation should use keyboard avoidance and native text controls. The keyboard image is an illustration, not a custom keyboard proposal. Focus, announcements and actual device restoration remain Engineering verification work.

## Review files and checks

- `previews/onboarding-account-board.png`: account creation, email confirmation, profile.
- `previews/onboarding-questions-board.png`: all five questions and the final Generate plan state.
- `previews/onboarding-recovery-board.png`: disclosure, generation and failure.
- Individual PNGs include sign-in, keyboard-visible input and draft failure. Full-scroll exports include the final answers and disclosure.
- `onboarding-qa.json`: focused browser checks for the sequence, blank-answer gating, all five questions, prior-answer editing, the review handoff and compact layouts.

All text examples are synthetic. Directly opening question scenes preloads synthetic examples for visual review; a fresh account walkthrough starts with empty answers. No email, network call, credential storage, profile save, AI request, account mutation or service change occurs. No server was started. Browser checks do not establish native accessibility, phone acceptance or production recovery behavior.
