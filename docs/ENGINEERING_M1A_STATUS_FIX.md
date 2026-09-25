# FitQuest — Engineering M1a F6 Status Correction

Status: Owner-approved, dispatched, delivered, and **accepted by HQ on 2026-09-24 for local synthetic-data scope**. Target: **Engineering**, task `01a0d053-66ed-79a0-a0bb-5b366646e723`, local host; final follow-up turn `01a0d3bc-6513-7a51-a4c5-6a0e91520d5e`. F6 is closed; Engineering is idle. This completed assignment does not authorize M1b or further implementation.

HQ review follow-up resolved: the first delivery passed 29 tests but repeated Details entry lost draft provenance and the Back destination. The final correction makes entry idempotent, adds profile/session regressions, and includes Engineering's focused native repeat-tap/Back evidence. HQ independently passed 31 tests, typechecks, lint, and builds, and reran the source-driven reproduction successfully. See the [acceptance review](reviews/M1A_REVIEW.md) for native limits and the uncommitted source state. The original scope and safety constraints below are retained for traceability.

## Outcome and starting point

Fix the inaccurate fresh-account save status recorded as F6 in [M1A_REVIEW.md](reviews/M1A_REVIEW.md). A newly opened, empty account must not claim saved work or changes waiting to sync. Keep draft state, valid saved facts, and the pending queue truthful across editing, navigation, and account changes.

Read [HANDOFF.md](HANDOFF.md), [DECISIONS.md](DECISIONS.md), the F6 reproduction/current correction assessment in the review, and the final native-verification section of [M1A_REPORT.md](../rebuild/docs/M1A_REPORT.md). The prior verification-only restriction is superseded **only for this bounded status correction**; its other safety constraints remain.

Recheck the checkout: last verified HEAD is `d5835ee`, with uncommitted HQ documents and Engineering's verification report/screenshots. Preserve all of them. No concurrent Design/Architecture writer; HQ edits shared `docs/`, Engineering owns this change under `rebuild/`.

## Relevant files and permitted changes

- `rebuild/apps/mobile/App.tsx`: account opening, save/draft state, `visibleStatus`, and Status/details rendering/navigation.
- `rebuild/apps/mobile/src/editor.ts`, `resultIntent.ts`, and `accountTransitions.ts`: retain their account/editor/input-version guards; touch only if essential to correct status provenance.
- A small status derivation/coordinator module and focused tests under `rebuild/apps/mobile/src/` may be extracted if useful. Tests must exercise logic actually used by the screen, not a separately copied model.
- Update `rebuild/docs/M1A_REPORT.md` with a dated F6 correction section and synthetic native evidence. Update the rebuild README only if user-visible workflow instructions actually change.

## Acceptance criteria

1. Fresh A or B, including a switch from an account with pending work, displays an honest empty/unsaved state. Zero queued commands does not become a saved/waiting claim or a fabricated Synced state.
2. Keep current editor/input persistence separate from older saved facts and queue state. A raw draft is not a committed profile/activity/result. Existing queued commands must not make new or invalid input appear saved.
3. Navigating to Details and back must not upgrade unsaved, saving, draft-only, or failed input to saved merely because the screen changed. Either retain the scoped input status or clearly label an account-level summary; do not call unrelated global state “Latest visible input.”
4. Preserve distinctions between a durable raw draft and a failed factual save: both can be true. Error/retry feedback must remain visible and accurate. Successful save/relaunch reports only the facts/queue actually present; synchronization remains explicitly disconnected.
5. Late acknowledgements from older input/editors/accounts cannot overwrite current status. Retain the existing F1–F5 data-integrity fixes, stable IDs, atomic draft finalization, and local access boundaries.

## Verification

- Add focused regressions for fresh accounts, pending-A → empty-B, raw-draft-only input, older queued facts plus newer input, saving/failure/success, navigation to Details, and stale acknowledgement/account-reset handling. Use controlled delayed promises where needed; distinguish deterministic automated coverage from native observation.
- Run `npm run check` from `rebuild/`, including the new tests. Record exact commands/counts/results and any limitations.
- Native spot-check on the final code: reproduce the formerly incorrect fresh-account Details path; exercise raw-draft and saved/pending states, a failed save with retained input, Details navigation, and return to the original account. Confirm the previous account's records/drafts remain intact.
- Preserve all existing stores, keys, revoked identities, and screenshots. Use a clearly named disposable simulator/test environment for a genuinely empty account if needed; never wipe retained data or un-revoke a fixture to make the reproduction pass.
- Keep default/Release locked. Smoke-check current Release behavior if startup/access/gating code is touched; otherwise identify the prior unchanged gate evidence explicitly. Do not infer a native timing-race pass from automated tests.

## Constraints and stop condition

This is not a status-screen redesign or new sync feature. No backend/API/database setup, schema migration, new auth behavior, AI, HealthKit, real health data, credentials, deployment, Render/Apple changes, broad upgrades, prototype changes, Git commits/pushes/worktrees, or other task dispatch. Do not alter security/lock settings or erase a simulator. If UI access is blocked, complete unaffected checks and report the required user action.

Continue routine in-scope edits and verification without asking for approval for each step. If resolving a new finding needs changes outside this status scope, report a bounded reproduction to HQ instead of expanding the work. Return the diff summary, regression/native evidence, and any remaining failures or unrun checks; stop for HQ review without starting M1b or declaring M1a accepted.
