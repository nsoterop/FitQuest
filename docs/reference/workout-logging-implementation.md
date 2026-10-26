# Workout logging implementation

The owner approved these four batches on October 26, 2026, including the amendment that each exercise starts with an Add notes button. Engineering owns implementation and compatible API/preview OTA delivery. Saved plans and real-user records remain intact; testing uses synthetic fixtures and disposable PostgreSQL only. Authentication and other unassigned work remain frozen.

## Batch 1 Input recovery and autosave

Reproduce loss before attributing the owner's incident to a cause. Inspect exact source identity, raw numeric input, encrypted persistence failures, lifecycle and asynchronous races. Persist raw edits immediately, including incomplete values; after approximately one second idle send valid changed actuals through serialized stable operations and revision checks. Reconcile unknown responses using receipts. Preserve newer edits during saves and on navigation, background, relaunch, offline/foreground, authentication expiry and conflict. Show truthful Saving, Saved or device-only waiting status; local durability begins after its write acknowledges. No automatic infinite retries.

Move the workout action above exercises. Start means no entered or confirmed work, Continue includes unfinished notes/raw local drafts, and View means a saved finished occurrence. Source identity includes account, plan, accepted revision, date and session, with repeat occurrences retained.

## Batch 2 Set rows and recommendation provenance

Render numbered weight/reps or reps-only rows; other activities retain completion checkboxes. Known prescribed set count seeds rows. Add set and Subtract set operate on stable identities; removed input remains recoverable with Undo. Muted readable suggestions are not actuals until explicitly confirmed per set; ranges never become invented exact actuals. Preserve weight units and known per-dumbbell/total-barbell/other basis without inferring ambiguous conventions or converting history silently.

Add only bounded versioned logging/display metadata to the existing single planning request. Keep coach choice, model/reasoning, variety rules, readable prescriptions and legacy readers. Existing plans use conservative unambiguous deterministic hints or manual entry; no regeneration, AI extraction or broad prose parser. Legacy grouped actuals remain readable and unchanged on reads; expand only unambiguous groups for an explicit edit with identity/history safeguards.

## Batch 3 Exercise information and notes

An accessible info popup retains description/technique/extended guidance, close/back/focus behavior and keyboard-safe scrolling. Legacy info faithfully shows its full prescription. Each exercise initially has Add notes; existing nonempty or actively edited notes stay visible. Exercise notes travel in the same autosaved payload as actuals. Existing session notes remain. Future history projection includes corresponding exercise notes only through the existing valid sharing consent and trusted/untrusted separation, with no new provider call.

## Batch 4 Finish and delivery

Finish session flushes and reconciles the latest autosave in order, records finished status without filling blank/unconfirmed work, and distinguishes durable offline intent from acknowledged server completion. Reopen/corrections remain possible. Today, Week, details, history and future planning distinguish finished sessions from performed prescriptions; legacy completed/partial/skipped outcomes retain their original meaning.

Use focused commits and regression checks for races, recovery, invalid raw fields, storage failures, accounts/occurrences, old clients/receipts, suggestions, ranges, load basis, removal/Undo, notes, consent, popup accessibility and finishing. Walk through synthetic native screens at normal/large text sizes. Verify actual remote triggers/divergence and exact-source CI before compatible API/OTA release. A hosted additive migration, if required, is a separate approval dependency; never deploy incompatible clients. Record actual source, CI, migration state, backend, OTA runtime/group, test limits and phone acceptance steps at delivery.

## Delivery and evidence

All four batches are delivered from `2b4f83b` with passing exact-source CI, the existing API Live and one compatible preview OTA. See the [release record](../archive/releases/2026-10-26.md) for actual source, CI, deployment, update/runtime and verification limits, and [native evidence](../archive/verification/2026-10-26/workout-logging/README.md) for synthetic screenshots and artifact hashes. No migration or real-user reset was needed. Phone OTA launch remains owner acceptance; seven-day expiry/Face ID remain planning only.

The reproduced recovery defect was JSONB key-order comparison for source identity; semantic matching fixes it without claiming this proves the cause of the owner's original phone incident. Raw edits merge from current state. Serialized save acknowledgments advance revision while preserving newer edits, including already-durable newer notes after relaunch/replay and upgrades of old pending drafts. Invalid text remains recoverable locally; removed entries remain available for Undo without blocking Finish. Storage failures, offline/unknown outcomes, account changes and newer remote revisions have explicit recovery states.

Versioned optional hints fit existing plan/snapshot JSON; journal v2 fits existing journal JSON. Strict nullable hints follow [official structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs), with the same single request/model/reasoning and allowance. Legacy plan/journal snapshot transport omits new hints; older clients cannot overwrite a v2 journal. Unambiguous grouped history expands only in a local explicit editing copy; ambiguous entries stay faithful. Per-exercise notes travel with actuals through existing consent; unconfirmed draft/suggested groups remain excluded from recorded history.

Final checks passed: 350 backend tests with disposable PostgreSQL, five installer checks, 184 mobile tests, seven repository checks, format/lint/types, packaging, Expo compatibility and dependency gate. Synthetic native checks covered normal/large text, keyboard recovery, notes, popup close, corrected Undo numbering and Finish without invented actuals. The cached host differs from physical build 5; actual VoiceOver focus and phone acceptance are not asserted. All temporary processes stopped and no development server was started. Scope and regressions are preserved in the four implementation commits plus subsequent durable-replay hardening; intermediate status notes remain available in Git history.


## Subsequent workout UI correction

The owner requested six follow-up corrections: details only inside the information popup; styled, shorter action buttons; editable blue recommendation prefills with unknown weights empty; recommended row counts for saved weeks; compact set-count plus/minus; and no per-set checkbox. The owner explicitly selected Finish session as the action that records displayed values, including unchanged recommendations. Opening and idle autosave continue to preserve these as unperformed suggestions/drafts. Ranges must become one explicit number or be cleared; no arbitrary endpoint becomes an actual result.

The correction is implemented locally in mobile only. Versioned hints now fall back per missing field to bounded unambiguous legacy dose forms; previously saved one-row v2 logs receive recommended rows in an editing copy. Recorded values, finished history, removed rows, stable identities and manually reduced counts are preserved. Plus restores a removed row before allocating another; raw values remain recoverable. Blank overrides survive acknowledgments, no-op saves and reopening. Finished-log numeric/unit corrections need no checkbox, while clearing all its actual values makes the set unlogged. Legacy full Markdown remains readable inside the popup.

Local format/lint/types, backend unit checks, 194 mobile tests, seven repository checks, Expo compatibility and the unchanged dependency gate pass. Synthetic cached-host checks cover hidden inline details, styled popup/actions, blue values and blank unknown weights, three seeded rows, compact plus/minus, editing recommended ranges, Finish recording exact unchanged/edited values, and large-text inputs/keyboard. The disposable simulator stopped; no development server or real-data test was used. Native runtime still matches build 5. Source publication/CI and the compatible preview OTA for this correction are pending; backend/application database graphs are unchanged from Live `2b4f83b`, so no backend deployment or migration is needed.
