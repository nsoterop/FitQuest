# FitQuest v2 · Bounded gap addendum

Design artifacts for owner review. This fills the specific gaps identified by HQ without reopening visual direction or changing production source. All profiles, dates, entries, nutrient values and plans shown here are synthetic. Nutrition is proposed functionality. This is editable local HTML/CSS/JavaScript, not a Figma file, production application or proof of live persistence.

## Open and review

Open `index.html` locally. The outside-phone selector groups the requested flows; it is review tooling, not product navigation. The training-only toggle shows the release with two working destinations. No server, dependency install, account, model call or network is needed. Everything resets on reload.

Supplemental boards:

- `previews/account-board.png`: account, saved profile, failed sign-out cleanup.
- `previews/recovery-board.png`: outside saved dates, loading failure, revision unknown, stale revision, failed changes, acceptance unknown.
- `previews/food-entry-board.png`: conversational input, portion clarification, review, hypothetical intent, correction, saved receipt.
- `previews/recipes-board.png`: library, recipe details, fractional serving entry, ingredient/yield edit, preserved past entry, save a logged meal.
- `previews/diary-board.png`: diary with completion control, consumed entry, edit, deletion/Undo, empty date, weekly averages.

Individual PNGs also cover the remaining requested pending/failure/empty states. Full-scroll exports show food provenance, recipe ingredients, diary and chart details. The prototype has 44 selector states plus connected ingredient-add, portion and workout detail views. Existing v2 mockups remain available; only their date label, initial featured-session choice and account entry link received targeted corrections. Their main exports have been refreshed.

## Resolved navigation and date rules

| Area | Rule |
| --- | --- |
| Main destinations | Always **Today / Week / Nutrition**, in that order. The current shared v2 navigation helper already used this order; refreshed and supplemental boards make it consistent in the review artifacts. |
| Training-only release | Show **Today / Week**. Hide the Nutrition destination and nutrition teaser until functional nutrition is included. No disabled or dead tab, teaser, or placeholder route. The outside-phone toggle demonstrates this without proposing a settings feature. |
| Selected date | The actual local date appears in the header. Only the current date is titled Today. A selected past day says, for example, “Mon, Oct 5.” Changing the selection does not change saved dates or completion. |
| Featured session | Initially feature the **first session in saved order** for that selected date. Tapping another listed session selects it for the featured surface. Reset to the first saved session when changing the date. Do not parse timing prose, infer completion, prioritize lifting, or label it “next.” |
| Missing plan | Offer the existing setup/intake route. Do not render a fabricated schedule or infer rest. |
| Outside saved dates | Explain the actual saved range and offer View saved week. No automatic generation or moving work into the selected date. |
| Nutrition date | Default to the selected diary date. Previous/next and an editable local date are available; past entries remain editable. This consumed-food diary does not allow a future date. Hypothetical/planned food stays outside it. |

The Today and Week views use the same accepted saved document. Multiple sessions, optionality, rest, nullable timing and ranges remain intact. Full-week visibility and acceptance gating stay unchanged.

## Account and training component/state mapping

| Component or view | Behavior and important copy | Existing source / implementation boundary |
| --- | --- | --- |
| Account list + identity header | Saved profile, saved training, Sign out. No new settings or password reset. | `mobile/src/AccountPanel.tsx`, `ProfileIntakeForm.tsx`. |
| Saved profile | Read-only existing fields; weight/age labeled as recorded rather than current measurements. | Existing profile read. Do not introduce an edit endpoint as part of this design. |
| Sign-out sheet | “Unsubmitted intake text on this device will be removed. Your saved profile and submitted answers stay with this account.” | Matches current local draft cleanup behavior; does not promise preservation of an unsubmitted draft through sign-out. |
| Cleanup failure | Hide all identity/profile/plan content immediately. “Retry before switching accounts.” Only Retry sign out is available. | Existing sign-out cleanup protection. Another account cannot inherit or view the prior account's draft. |
| Restore/reauthentication | “We couldn’t verify your saved session.” Keep account content hidden; sign-in uses the existing email/password flow. | Existing verified-session requirement. No token or backend detail in product copy. |
| Loading / failed load | Neutral loading structure. “Couldn’t load your training.” Retry loads existing data; never treat failed retrieval as no plan. | Existing read/reload behavior. |
| Revision editor | Preserve exact feedback. Nonempty unsent feedback blocks draft acceptance. Clear request is explicit. | Existing feedback and revision checks in `TrainingScreen.tsx`; no architecture change. |
| Revision pending | “Updating your week.” Check status and View current plan. No resubmission. | Current accepted work remains usable. |
| Revision result unknown | “The connection ended before we received a result.” Only Check status, plus access to the old accepted plan. | A timeout is not proof of failure. No new paid request until the existing outcome is established. |
| Revision confirmed failed | Preserve old accepted plan and feedback. Retry changes explicitly starts a new AI request; Edit request is secondary. | Keep existing accounting/caps. No automatic retry. |
| Stale revision | Load latest version, keep unsent feedback, then ask the athlete to review their request against the newer version. | No silent acceptance, overwrite or resubmission. |
| Acceptance pending/unknown | Pending disables resubmission. Unknown offers Check status. Saved workout details remain gated until confirmed. | Acceptance only reveals existing saved workouts; it does not dispatch AI. |
| Acceptance confirmed failed | Try accepting again, with the draft preserved. No AI request or charge. | Keep server revision and identity checks; the UI does not bypass a stale rejection. |

This is a restyling of the relevant existing and v1 recovery behavior, not a new state architecture. The accepted one-request document-plan flow supersedes older two-stage instructions found in historical source copy. Other unmodified recovery behaviors from the previous handoff still apply.

## Conversational food entry

**Diary → Tell AI what I ate → targeted clarification → reviewed food entry → receipt.** Manual entry remains directly available. There is no barcode, camera, photo inference, nutrition questionnaire or food-database claim.

The example starts with reported consumption and a yogurt label supplied by the athlete. FitQuest asks only for the missing oats and berry portions. Review separates:

- **Your label:** supplied yogurt nutrients.
- **AI estimate:** estimated nutrients for explicitly supplied quantities of oats and berries.
- **Assumption:** dry plain oats without milk or toppings, shown before the total and corrected through a visible control.
- **Unknown:** missing portions/nutrients, kept as unknown through the receipt. “I don’t know the portions” is a supported clarification response.

The athlete reviews uncertainty before logging. The receipt retains provenance; an estimated value does not become measured simply because it was saved. Displayed values are synthetic illustrations, not nutritional advice, recommended targets or an approved food database. Changing the oats quantity scales the existing estimate in this narrow example without AI. A different food/preparation needs a new reviewed estimate or manually supplied values; do not reuse an incompatible estimate.

**Planned/hypothetical food:** the review explicitly says Planning only, disables logging and excludes the candidate from diary totals. Only an explicit “I ate this” choice changes that intent. Merely discussing a meal is not evidence of consumption.

The local prototype follows one guided example. Its keyword checks only select mock screens and are not a proposed parser, classifier or coaching implementation. Unrecognized example text goes to an honest offline-preview explanation with manual fallback. No tool or model is called. Production model choice, dispatch/clarification mechanics and accounting contracts stay with Architecture/Engineering under owner-approved scope and existing spending controls. No automatic paid retries are proposed.

## Saved meals, recipes and historical integrity

| Interaction | Rule |
| --- | --- |
| Save a logged meal | Save its name, recorded composition/portion and provenance to the library. **Do not add another consumed entry.** |
| Log a saved meal | Choose the amount consumed and date; multiply the saved composition. Preserve estimates and unknown values. Create a new diary entry. |
| Recipe detail | Show ingredient amounts, source labels, batch yield, version and per-serving nutrition. A recipe by itself contributes nothing to consumed totals. |
| Edit recipe | Quantity edits scale the saved ingredient values. Edit yield in servings. Adding a different ingredient requires its own supplied values; blank nutrients remain unknown. |
| Fractional portions | Show 0.5, 1 and 1.5 shortcuts plus a direct numeric field. For the synthetic original recipe: 0.5 = 240 kcal; 1.5 = 720 kcal. Calculate from full ingredient values, then round for display. |
| Updated recipe | Save a new recipe version for future use. The example reduces oil: new recipe is 435 kcal/serving; the earlier lunch remains 480 kcal from v1. |
| Correct old consumption | Explicitly edit that diary entry. Recipe updates must not silently alter prior amounts, nutrients, estimates or dates. |

These interactions describe user-visible outcomes, not a new storage schema. The source of truth for a logged entry is what was recorded when consumed, including any explicit later correction. The version badge makes the relationship understandable without exposing implementation machinery.

## Diary, saving and weekly averages

**Entry detail → edit → save:** show the actual recorded date, time, portion, nutrient values and source. Optional nutrient fields remain blank/unknown. Changing free-text portion text does not pretend to calculate new nutrition. Preserve estimates unless the athlete supplies a better basis. Date/name-only edits retain nutrient provenance. Changes to nutrient values are labeled as manually supplied corrections.

**Delete → Undo:** remove the entry from the displayed totals only after confirmed deletion; offer a clearly labeled, persistent Undo action in the diary. The design prototype performs this in memory. In the application, the recoverability window and durable delete/undo result must match the approved service capability; do not promise restoration the service cannot deliver. Editing, adding or deleting reopens the affected day. Undo restores the prior entry; re-mark completeness only if nothing else changed since deletion.

**Saving states:** distinguish empty, incomplete, unavailable, pending save and confirmed save failure. Empty means a successful read returned no entries. A failed read says Couldn’t load this day. Pending save does not change confirmed totals or enable another submit. A confirmed failed save preserves the draft and offers Retry save without reanalyzing food. If a save's result is unknown, check whether it committed before offering a new submission. Preserve entry drafts on navigation/failure in production; the prototype illustrates failure preservation and in-session edits, not durable storage.

The receipt says Added to food diary only for the simulated acknowledged result and visibly labels Preview. No offline/local-save/sync guarantee has been invented. Real UI labels must follow actual local or server acknowledgments supplied by the technical contract; account switching must never transfer drafts or entries.

**Visible completion control:** Mark day complete / Reopen this day appears near the top of the diary. This records the athlete's assertion that they finished logging, not a nutritional judgment or streak. It is not inferred from midnight or from having any entry. Empty dates cannot be marked complete in this proposal; they remain missing rather than zero.

**Per-nutrient average denominator:** include a date only when the athlete marked it complete and that nutrient is known for all entries. Show the included-day count beside each average; counts may differ by nutrient. Incomplete, missing, future and unknown data are not zeros. The sample has three completed dates, one missing date, a partial Friday and two future dates. Marking Friday complete changes the relevant denominator from 3 to 4; reopening returns it to 3. No available days means “Not enough logged data,” not 0 g/day. A data table and text labels accompany the charts. Bars use a common zero baseline; implementation must scale to visible data without clipping high values.

## Reusable additions

Reuse v2 colors, typography, 7–13 pt corner radii, dividers and primary actions. The bounded additions are: account row, read-only key/value row, status notice, pending/error panel, feedback draft block, editable date bar, food conversation/composer, source badge, intent control, consumed-entry receipt, saved-food picker, ingredient/yield editor, serving selector, version comparison, and delete/Undo sheet. Actions have explicit labels and 44 pt effective targets. States never rely on color alone.

Keep voice-over focus on new screen titles, errors and dialog headings; restore it to the triggering control after dismissal. Announce save results politely, retain input while errors are shown, and keep actions above the native keyboard. Larger text scrolls instead of shrinking. Browser layout checks are not native accessibility acceptance.

## Evidence and handoff to HQ

`qa.json` records focused checks of all 44 states at 393 px, compact 320 px with 125% text, normalized navigation, selected-date title, initial saved-order selection, hidden account data after cleanup failure, stale-feedback preservation, unknown-result actions, conversational clarification/intent/unknown data, recipe scaling and preserved history, library saves, entry editing/deletion/Undo, average completeness and save retry. Supplemental boards were visually inspected; assumptions and day-completion actions were moved higher so they are visible before the relevant decision. The original v2 boards were refreshed after the small date/navigation corrections.

No production source, backend, deployment, service, paid tool, account, private record, external design file or AI setting was changed. The rendering browser is temporary and closes in `finally`; no preview server was started. All files are confined to `docs/design/screen-mockups-2026-10-09/v2/`.

**HQ disposition:** the core account/onboarding/training UI can be assigned after owner approval of HQ's implementation plan. This addendum is not an additional acceptance gate. Nutrition remains a separately approved proposed feature scope; the visuals do not authorize a backend release. Existing account scope is read-only saved-profile access plus sign-out/reauthentication, with no new settings or reset feature. Architecture still owns nutrition persistence/AI dispatch and recoverable-delete contracts; HQ owns acceptance and sequencing. No new roadmap, paid evaluation, nutrition targets or broad architecture is proposed here.
