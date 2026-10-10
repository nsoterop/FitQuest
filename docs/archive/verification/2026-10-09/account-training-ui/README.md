# Release 1 native UI verification — October 9, 2026

> Historical implementation and synthetic verification evidence from October 9, 2026. Later releases may supersede behavior described here. See the [current overview](../../../../../README.md) and [release archive](../../../README.md); these results were not rerun during documentation cleanup.

Implemented the v2 account/onboarding/training direction: one shared white page with 22pt horizontal gutters, graphite headings and featured session, cobalt controls, safe-area boundaries and one keyboard/scroll container per screen. Account/profile, five progressive answers, Today, full saved Week, review/revision and individual Markdown workouts now use the same layout family. Nutrition has no destination or teaser.

The original unfinished root removed the padded scrolling wrapper before the new Page was connected. The native [before profile](before-profile.png) reproduces overlapping fields and an edge-to-edge container. The [corrected profile](profile.png) restores the outer gutters, field rows and scroll sizing. No decorative phone bezel was added to the application.

## Native evidence

Screenshots are actual React Native rendering in the installed Expo Go 57.0.9 runtime on an existing disposable iOS 26.4 simulator. The old installed FitQuest binary was not a compatible development client; the already installed official Expo Go app was reused without a native build or new dependency. The blue gear is Expo's development overlay, not FitQuest UI.

| Screen | Evidence and observed behavior |
| --- | --- |
| Sign in | [Native screen](sign-in.png), loaded from the owner's unchanged Metro process against current source; no account sign-in or signup performed. |
| Profile setup | [Before](before-profile.png) / [after](profile.png); gutters and labels visible, no overlapping fields. |
| Five-question intake | [Software keyboard visible](intake-keyboard.png); exact first question, composer and Continue remain visible together. |
| Today | [Two sessions](today.png); first saved session featured, selecting the optional second session updates the feature. Changing date resets to first saved session and uses the selected date in the heading. |
| Review | [Draft](review.png); only session metadata is shown. Synthetic acceptance reveals the same saved week. |
| Week | [Accepted week](week.png); Monday–Sunday remains accessible, rest and optionality preserved. Fixed Today/Week tabs. Opening Week starts at the top. |
| Workout | [Saved detail](workout.png); Markdown headings, units, ranges and recovery remain readable. Back returns to the selected date and session. |
| Compact and large text | [Native 320 × 568pt constrained viewport with accessibility-large text](compact-large-workout.png); text wraps and scrolls without horizontal clipping. This is a constrained native component preview, not a separate 320pt simulator device. Very large display headings wrap across multiple lines. |
| Account | [Account](account.png) and [read-only saved profile](saved-profile.png), with weight and age labeled as recorded. |
| Recovery | [Failed retrieval](load-error.png) offers Check status and never turns a failed read into a fabricated empty plan/rest day. |

Authenticated views used a separate localhost-only preview with synthetic fixtures, a mock identity module and a fetch stub that rejected every external destination. Production components were copied into that isolated preview; no preview branch, mock credentials, fixture routing or synthetic records enter the application bundle. No paid generation or owner plan regeneration was run. The temporary preview server and both simulators started for this review were stopped. Owner Metro PID 91062 was neither restarted nor stopped.

## Regression evidence

108 mobile tests pass, including account/session isolation, sign-out confirmation and failed cleanup, draft persistence, same-operation intake retries, full-week/legacy readers, exact unsent feedback preservation, stale/unknown mutation gating, first-session ordering/date reset, free acceptance/reopen and safe text-only Markdown. Mobile TypeScript and backend TypeScript pass. Three focused backend prompt/provider tests pass with mocks: exact prompt/schema/model/low-effort settings, one initial/revision request, refusal/incomplete handling and no retry. Backend source and configuration were not changed by this UI release. Offline Expo dependency checking reports dependencies up to date; actual native execution provides the runtime check.

Native review caught and corrected a feedback composer that scrolled Week to the bottom before focus. It now requests a reveal only after focus. Unknown results disable mutation actions until a saved-status read succeeds, while preserving usable saved work and feedback. Account navigation keeps the underlying intake/training view mounted; leaving training with unsent edits requires an explicit discard.

Live publication, backend verification, matching served bundle and protected owner reset/readback are recorded in the repository [archived release record](../../../releases/2026-10-09.md). Physical-phone acceptance, VoiceOver navigation and coaching quality remain separately unverified.
