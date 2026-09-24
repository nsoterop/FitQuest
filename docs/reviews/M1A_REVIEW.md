# FitQuest — M1a HQ Review

Date: 2026-09-24 · Status: Initial review retained; correction pass delivered, **acceptance pending review of new evidence**

## Outcome

Engineering completed its M1a turn (`01a0d132-9ee4-79e1-bacf-4572d25649a3`) in task **Engineering**, ID `01a0d053-66ed-79a0-a0bb-5b366646e723`. Its [report](../../rebuild/docs/M1A_REPORT.md) records native encrypted storage, mixed local logging, fixture isolation, restart, and locked Release observations. HQ reviewed the source and evidence and found UI/save-boundary gaps not covered by the passing baseline. Do not mark M1a accepted or start M1b from this result.

No application source, dependencies, hosted services, credentials, or task assignments were changed during the original HQ review. Shared status documentation was updated. The baseline check regenerated ordinary local build outputs.

Subsequent owner approval, 2026-09-24: the [bounded F1–F5 correction assignment](../ENGINEERING_M1A_CORRECTIONS.md) has been sent to Engineering. New evidence and acceptance review remain pending; the findings below are not closed by dispatch.

Later update, 2026-09-24: Engineering delivered the correction pass and a dated section in [M1A_REPORT.md](../../rebuild/docs/M1A_REPORT.md). HQ independently reran `npm run check`: typechecks, lint, **24 tests**, and contracts/API builds passed. HQ read the report, inspected the new coordination boundaries and synthetic screenshots for repository preparation, but has not completed a finding-by-finding acceptance review or repeated native interactions. The final native failure/retry sequence and post-final-edit profile/activity walkthrough were interrupted by a locked Mac. The private GitHub baseline records this state; it does not declare the findings closed. Locations and reproductions below refer to the original pre-correction source.

## Verified versus reported

- HQ independently ran `npm run check` from `rebuild/` on 2026-09-24: typechecks, ESLint, 11 tests (API 2, contracts 7, local repository 2), and contracts/API builds passed, exit 0. The headless SQLite tests print Node's experimental warning.
- HQ inspected the current contracts, access boundary, local store, tests, UI, package configuration, README, Engineering report, and synthetic session/failure screenshots. The existing repository tests use real SQL through an in-memory adapter; they do not render or interact with the React UI.
- Engineering reports native SQLCipher/key, rollback, restart, two-fixture transitions, Release gating, and large-text/keyboard checks. HQ did not independently rerun native builds or a simulator walkthrough during this review. These remain attributed evidence, not independently repeated observations.
- HQ ran small read-only, in-memory harnesses against the actual extracted `commitResult` and account `open` source, with controlled promises and synthetic state. These reproduce the source behavior described in findings 1–3. They are not end-to-end/native tests. No repository test file or stored athlete record was created by these harnesses.
- Real identity, synchronization, physical-device/VoiceOver checks, dependency remediation, and release readiness remain outside the completed evidence.

## Required corrections

### F1 — P1: Make draft-to-fact completion restart-safe and idempotent

Locations: [App.tsx:105](../../rebuild/apps/mobile/App.tsx#L105), [App.tsx:131](../../rebuild/apps/mobile/App.tsx#L131), [store.ts:200](../../rebuild/apps/mobile/src/store.ts#L200).

`saveResult` generates the result identity while `commitResult` first saves the original form draft, commits the actual session separately, then clears the draft with another write. The saved draft for a new result still has `resultId: null`; no durable operation identity links it to the committed fact. An interruption after the fact commits but before draft clearing restores an apparently unsaved new entry. Saving it again generates new IDs and can duplicate the result. Repository idempotence for a caller-reused operation ID does not solve this UI boundary.

The source harness paused after the actual projection was accepted and observed both a committed result and a restored draft `{ resultId: null, duration: "12" }`. Implement a durable save intent/stable identity and atomic or explicitly recoverable draft-to-fact finalization. Do not assume that a missing UI completion means the database write failed.

Required regression: crash/reopen at each draft/save/finalization boundary; retry from the actual UI flow produces one result and one logical save, with immutable prior command content and retained history. Include a committed write followed by failed readback/UI completion.

### F2 — P1: Do not let an older save erase or acknowledge newer input

Locations: [App.tsx:93](../../rebuild/apps/mobile/App.tsx#L93), [App.tsx:131](../../rebuild/apps/mobile/App.tsx#L131).

Inputs remain editable during `commitResult`. After its earlier save finishes, it unconditionally resets the form and clears the persisted draft. There is no input edit-sequence guard. The source harness entered and persisted a newer duration of `19` while the earlier `12` save awaited completion; finishing the earlier save left both the visible form and durable draft empty. Autosave acknowledgements also check account-store identity but not the current input revision/activity, so an older acknowledgement can label newer input saved.

Required regression: delay local saves/draft acknowledgements while typing, changing activity, and completing another save; latest input remains visible and recoverable, and status refers only to the acknowledged input version. Guard async completions by account generation, active editor identity, and input version (or an equally safe scoped mechanism).

### F3 — P1: Isolate transient UI state and late completions across accounts

Locations: [App.tsx:36](../../rebuild/apps/mobile/App.tsx#L36), [App.tsx:55](../../rebuild/apps/mobile/App.tsx#L55), [App.tsx:61](../../rebuild/apps/mobile/App.tsx#L61).

Account switching clears profile/session projections but does not reset the activity name, variation, equipment, result-form state, or all pending UI callbacks. In the source-driven account-open harness, opening B retained A's unsaved activity name/variation/equipment. Creating a B session can display those values in B's add-activity form. The store's generation check alone does not isolate React state. Account `open` also installs its result after awaits without a final generation/current-request comparison, which needs race coverage.

Required regression: enter unsaved profile/activity/result fields in A, switch/logout/revoke during delayed reads/saves, and open B. No A text, error, counts, drafts, or late completion appears in B. Restore A's eligible durable drafts only to A. Test rapid overlapping account selections, not just calling a closed old store after a completed switch. Preserve pending records; do not clear databases to make the test pass.

### F4 — P2: Make corrections available after ending a session

Locations: [App.tsx:156](../../rebuild/apps/mobile/App.tsx#L156), [App.tsx:157](../../rebuild/apps/mobile/App.tsx#L157).

The UI renders `Correct entry` for saved results in any session status, but the editable fields and `Save correction` control are inside `session.status === 'started'`. Selecting correction after `completed` or `ended_early` cannot complete the action. HQ confirmed the enclosing condition through the source AST; no native interaction was rerun.

Required regression: finish/end early, reopen, correct a strength and timed entry, restart, and verify the correction persists under the same IDs with immutable prior history. Preserve the session's outcome/start/end unless the user explicitly edits an allowed field. Do not silently reopen the session or add new performed work as a substitute for correction.

### F5 — P2: Cover setup and new-activity drafts, not only result drafts

Locations: [App.tsx:36](../../rebuild/apps/mobile/App.tsx#L36), [App.tsx:95](../../rebuild/apps/mobile/App.tsx#L95), [App.tsx:152](../../rebuild/apps/mobile/App.tsx#L152).

Only result forms use durable draft storage. Unsubmitted profile and new-activity inputs remain component state and disappear on termination, despite the handoff's recoverable raw-form requirement. Their state also contributes to F3. Add owner-scoped draft persistence/recovery and truthful status for these forms without converting incomplete setup/activity input into valid records or commands.

Required regression: partially enter each supported form, wait for an actual draft acknowledgement, terminate/reopen the same synthetic identity, and recover exactly that draft. Invalid drafts create no actual record/command. State before acknowledgement must not be described as saved.

## Follow-up scope and later gates

Recommend one bounded M1a correction assignment for the five findings and focused UI/lifecycle regression tests, preserving the encrypted repository, reviewed domain semantics, synthetic-only verification, and fail-closed default/Release behavior. Extract small testable UI/save-state boundaries if needed; do not combine this with backend sync, real auth, an app-wide redesign, or dependency-wide upgrades.

Engineering should update its report with exact new evidence, rerun the baseline and affected native walkthroughs, and stop for HQ review. M1b remains the planned disposable local API/PostgreSQL synchronization slice after M1a acceptance; real Apple/device authentication still needs its own scope/authorizations.

The Expo UI skill and storage reference informed the interaction/durability review, particularly whether visible actions and save states correspond to completed behavior. The findings above are grounded in this source and bounded harnesses; neither skill guidance nor passing baseline tests establishes full runtime correctness.
