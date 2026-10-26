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

## Evidence and current state

Baseline: clean local and remote `main` at `4f3c585`. Batch 1 reproduces a recovery defect: JSONB key reordering makes `JSON.stringify` comparisons fail for identical source identities. Semantic source matching fixes that path; it does not prove the cause of the owner's particular phone incident. Rapid raw edits also now merge from current state, and delayed cloud acknowledgments advance revision without replacing newer local edits. Approximately one-second idle autosave sends valid changed documents, resumes an existing stable operation once on relaunch/foreground, and keeps invalid raw values encrypted locally. The source-scoped state endpoint returns only status/identity and the primary action appears above workout content.

Batch 1 checks passed: type/lint, 170 mobile tests, 345 backend tests with disposable PostgreSQL and five guarded-installer checks. Tests cover semantic identity, rapid incomplete input with immediate navigation/reopen, delayed cloud response/newer edits, persistence failure, exact action states and account/occurrence isolation. The test cluster stopped and was removed. No hosted changes, AI calls or native/OTA release have occurred for this assignment yet. Remaining batches and release checks are in progress.

Batch 2 adds individual set rows and explicit confirmation, bounded versioned display hints within the existing document JSON, and journal version 2 within existing JSON columns. Legacy grouped records are kept on the server; unambiguous groups can expand in a local editing copy with their original first ID and unchanged dose/units. Unknown groups stay faithful and permit added manual rows. The API projects optional hints out for legacy plan readers and prevents v1 saves from overwriting v2 journals. New clients opt in with a logging-capability header. This approach currently needs no SQL migration. The single existing planning request keeps its model, reasoning, variety guidance and allowance; nullable strict-schema hints follow [official OpenAI documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Focused set/provenance and UI checks pass; final compatibility/persistence and whole-suite checks remain part of delivery.
