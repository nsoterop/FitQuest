# FitQuest — M1a HQ Review

Date: 2026-09-24 · Status: **M1a accepted by HQ for local synthetic-data scope**; F6 closed after final correction, with verification limits retained

## Outcome

**Latest decision: accepted, 2026-09-24.** HQ accepts the bounded M1a local logging slice after review of the corrections and final repeated-Details follow-up. This is not acceptance of full M1, production authentication, synchronization, real private-record use, or release readiness. The historical findings and review rounds below are retained for traceability; this decision supersedes their open/withheld status.

Final Engineering delivery: turn `01a0d3bc-6513-7a51-a4c5-6a0e91520d5e`. HQ inspected `App.tsx`, `status.ts`, `status.test.ts`, the final report, and the empty-B, failed-save/durable-draft, and repeated-session-Details screenshots. HQ independently reran `npm run check`: **31 tests** (API 2, contracts 7, mobile 22), typechecks, lint, and contracts/API builds passed. Node's experimental SQLite warning remains. `git diff --check -- rebuild` passed.

HQ also reran the original source-driven reproduction using the exact current `showStatus` callback and the real `enterDetails`/`presentLocalStatus` functions. Repeated entry preserves draft status, account-record distinction, and Back destination for a fresh profile with no queued facts, a profile over one queued fact, and a session over two queued facts. The earlier residual no longer reproduces. This is an in-memory source harness, not a native walkthrough.

Engineering reports current Debug native repeat-tap/Back checks for those paths after rebuilding and loading the current bundle. Earlier checks cover fresh A/B, raw drafts versus saved facts, failed-save retry/reopen, completed/ended-early corrections, account separation, and the locked Release boundary. HQ reviewed that evidence; it did not independently operate the simulator. The final route helper does not change storage, authentication, or Release fixture gating.

### Accepted scope and remaining limits

- F1–F6 are resolved for the reviewed local slice: recoverable result intents and form drafts, scoped editor/account completion, terminal corrections, and truthful current-input/record/queue status. Existing local contracts, native encrypted storage, and immutable pending work remain in place.
- Deterministic delayed-callback and rapidly overlapping-switch races have automated coordinator/SQL coverage, not deterministic native injection. HQ accepts that evidence boundary for this synthetic local increment; repeat relevant integration checks as authentication/synchronization introduce new boundaries.
- Release locking was verified before the final navigation-only follow-up and was **not rebuilt again afterward**. Retain it as prior gate evidence, not a final-source Release-build claim. Refresh Release evidence during the next affected integration/release check.
- Physical-device/Keychain lifecycle, VoiceOver, Android, real identity, backend sync, hosted operations, and the tracked dependency remediation remain separate gates. No real athlete data or production-readiness claim is authorized by this acceptance.
- Accepted source is the local working tree on top of `d5835ee`, including untracked `status.ts`/`status.test.ts` and evidence. These changes and updated HQ docs have **not been committed or pushed**. Review and preserve them before any fresh checkout/worktree; the old GitHub baseline does not include this fix.

Engineering is idle. Next recommended milestone is a separately approved M1b local API/PostgreSQL synchronization assignment, after a reviewed checkpoint of the accepted work. No new assignment, Git push, migration, or deployment is authorized by this review alone.

### Historical initial review

Engineering completed its M1a turn (`01a0d132-9ee4-79e1-bacf-4572d25649a3`) in task **Engineering**, ID `01a0d053-66ed-79a0-a0bb-5b366646e723`. Its [report](../../rebuild/docs/M1A_REPORT.md) records native encrypted storage, mixed local logging, fixture isolation, restart, and locked Release observations. HQ reviewed the source and evidence and found UI/save-boundary gaps not covered by the passing baseline. Do not mark M1a accepted or start M1b from this result.

No application source, dependencies, hosted services, credentials, or task assignments were changed during the original HQ review. Shared status documentation was updated. The baseline check regenerated ordinary local build outputs.

Subsequent owner approval, 2026-09-24: the [bounded F1–F5 correction assignment](../ENGINEERING_M1A_CORRECTIONS.md) has been sent to Engineering. New evidence and acceptance review remain pending; the findings below are not closed by dispatch.

Later update, 2026-09-24: Engineering delivered the correction pass and a dated section in [M1A_REPORT.md](../../rebuild/docs/M1A_REPORT.md). HQ independently reran `npm run check`: typechecks, lint, **24 tests**, and contracts/API builds passed. HQ read the report, inspected the new coordination boundaries and synthetic screenshots for repository preparation, but has not completed a finding-by-finding acceptance review or repeated native interactions. The final native failure/retry sequence and post-final-edit profile/activity walkthrough were interrupted by a locked Mac. The private GitHub baseline records this state; it does not declare the findings closed. Locations and reproductions below refer to the original pre-correction source.

## Historical F6 first delivery review — repeated Details entry was still open

Engineering delivered F6 turn `01a0d3a9-b587-7b01-b403-813afcfc4e5d` with local changes to `App.tsx`, new `src/status.ts`/`status.test.ts`, and report/screenshots. HQ inspected the diff and tests and independently reran `npm run check`: **29 tests**, typechecks, lint, and contracts/API builds passed. Native fresh-account/failure/draft/Release observations remain attributed to Engineering's report. Application changes are uncommitted on top of `d5835ee`; no deployment is implied.

**F6 residual — repeated Details entry loses input provenance and return destination.** In the delivered [App.tsx](../../rebuild/apps/mobile/App.tsx#L58), the header's Details action remains available on the Status page. `showStatus()` reevaluates `editing` there as false, clears `detailsFromInput`, and replaces the origin with home. HQ ran a read-only in-memory harness using the exact callback extracted from the source and the real `presentLocalStatus` function:

- First Details tap from a session with a newer raw draft and an older queued fact: current input/headline = Draft saved on this device; account records = Saved on this device · Waiting to sync; Back destination = session.
- Second Details tap on that same screen: current input disappears; headline becomes Saved on this device · Waiting to sync; Back destination becomes home.

This is a source-driven reproduction, not a native test. The five new presentation tests do not cover the actual repeated navigation callback; passing `inputFocused: true` twice is not equivalent to exercising that transition. The residual violates the approved navigation/provenance criterion and keeps F6/M1a open.

HQ sent this directly back to Engineering **within the already owner-approved F6 scope**: make repeated Details entry idempotent or remove/disable its redundant trigger; cover profile and session origins, repeated entry, draft plus older queued fact, and Back through the navigation logic used by the screen; repeat the focused native path and full automated baseline. No new feature authority, Git write, or hosted change was granted. The initial fresh-account correction is not rejected wholesale; the residual must be closed before acceptance.

## Correction assessment — after verification, before F6 implementation

Engineering completed verification turn `01a0d38e-2365-7c90-b5b4-99db73d40a9f`; the source/evidence assessment below records that delivered state. HQ read the final dated [report](../../rebuild/docs/M1A_REPORT.md), all five new screenshots, `App.tsx`, the extracted editor/intent/account coordination, access boundary, repository save/finalization paths, and regression tests. The tracked `rebuild/` diff contains only the report; new rebuild files are synthetic screenshots, not application changes. Source is still `d5835ee`, the version on which HQ independently passed the 24-test baseline before this follow-up. Engineering reports a fresh 24-test pass and current Debug/Release builds; HQ did not repeat them or native interactions in this assessment.

| Finding | Assessment and evidence boundary |
| --- | --- |
| F1 | Original result-save duplication path addressed by durable result/operation intent and atomic fact/history/command/draft finalization. Real-SQL tests exercise interruption, rollback, and committed-write/failed-readback replay; native correction failure/retry/relaunch retains one visible entry. Native UUID/history invariants rely on the automated layer, not screenshots. |
| F2 | Original unconditional form clearing is now input-stamp guarded; scoped acknowledgements and monotonic draft/tombstone writes are exercised by automated delayed-completion tests. Deterministic native delayed-callback timing remains **unrun**. The separate Details-page status problem is F6; do not equate guard tests with complete UI status coverage. |
| F3 | Original transient-field leakage is addressed by full account reset, serialized selections, stale-open guards, and store generation checks. Engineering's fresh active A/B walkthrough exercises three drafts, queue isolation, stale-callback rejection, logout, and return recovery. Rapid overlapping native taps remain **unrun**; transition tests cover that timing at the coordination layer. |
| F4 | UI exposes terminal corrections; repository patches existing IDs in the current projection. Native completed-strength and ended-early-time corrections and real-SQL regressions support the fix; immutable identity/history and all modality/status combinations are asserted in SQL tests. |
| F5 | Profile/activity/result drafts are durable and owner-scoped; profile/activity fact and draft finalization now share a transaction. Final-code native invalid/failed/valid/reopen flows and SQL rollback tests support the fix. |

The earlier Mac-lock interruption is resolved for the reported walkthroughs. Deterministic native race injection, physical-device and VoiceOver checks remain unrun. The current Release fixture-lock observation is not real authentication. The original F1/F3/F4/F5 reproductions are addressed within the stated scope; F2's guarded mechanism has automated evidence, not a native timing pass. **Do not accept M1a yet: F6 violates truthful save/sync status.**

Subsequent owner approval, 2026-09-24: the [bounded F6 correction](../ENGINEERING_M1A_STATUS_FIX.md) is now dispatched to Engineering. Its approved outcomes are to correct status derivation for empty accounts and account switching, keep current editor/draft/fact/queue states distinct across navigation to Details, and add focused regressions for fresh, draft-only, queued, saving, and failed states. A stale acknowledgement must not label newer input saved. Repeat the affected native status walkthrough and automated suite, preserving fixture stores and default/Release locking. No backend, auth, schema redesign, deployment, or broad UI redesign is needed for this correction.

## Verified versus reported

### Verification follow-up finding — F6 (2026-09-24; reproduction retained, now closed above)

**P2 — Do not claim a fresh account has saved work waiting to sync.** Engineering reports this native reproduction on the separately created disposable iPhone 17 Pro simulator `C45DC884-F92F-4F37-9A51-D68163CEBE86`, Debug from `d5835ee`: open active A, save a profile/session/activity, retain three form drafts, arm the stale-callback probe, then switch to never-used active B. B correctly opens with a blank profile and unsaved input. Before any B save, opening Status/details displays “Latest visible input: Saved on this device · Waiting to sync” alongside zero pending commands. B has no profile or sessions. Expected: no saved/waiting claim without corresponding persisted facts or pending work; identify empty, unsaved, or draft-only state truthfully.

HQ independently inspected [App.tsx](../../rebuild/apps/mobile/App.tsx#L90): `open()` unconditionally sets the global saved/waiting status, regardless of `p` or command count. The Status page uses that global status because it is no longer treated as an editing page. HQ has not repeated the native interaction; the observed reproduction remains attributed to Engineering.

Engineering reports stale prior-account save rejection, B gaining one command only after its own profile save, and A recovering its own three commands and profile/activity/result drafts on return. This finding is inaccurate status, not observed cross-account data leakage; it does not establish exhaustive isolation coverage.

Acceptance requires a separately scoped status correction and regression for fresh accounts/account switches, preserving honest draft/fact/queue distinctions and the explicit disconnected-sync message. Application changes were not authorized by the verification-only follow-up. That follow-up is delivered and reviewed as described above. The subsequent bounded F6 correction is now owner-approved and dispatched; the finding remains open until its new evidence is reviewed.

### Original review evidence (before corrections)

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
