# FitQuest — M1b HQ Review

Date: 2026-09-25 · Status: **M1b accepted by HQ for local synthetic-data synchronization; F1/F2 closed with evidence limits retained.**

## Latest decision — accepted local increment

HQ accepts the bounded M1b local API/PostgreSQL synchronization slice after the correction delivered in Engineering turn `01a0d88e-bbd0-7200-be86-a6cca8a4ba89`. Engineering is idle. This supersedes the earlier withheld decision below; historical reproductions remain for traceability. It does not accept full M1, production identity, hosted sync, real private-record use, or release readiness.

HQ reviewed the final sender/transport lifetime checks, screen integration, profile restoration helper/tests, editor coordination change, and updated report. Fresh independent `npm run check` passed **49 tests** (API 2, contracts 7, mobile 40), typechecks, lint, and contract/API builds. A fresh `npm run test:pg` passed **9/9** against the guarded disposable local integration database; the cluster was stopped afterward with development data retained. `git diff --check -- rebuild` passed. Node's experimental SQLite warning remains.

HQ independently reran the original source-driven probes on current code:

- Deferred queue take → sender stop → release work now produces only `transport closed`, with no command dispatch. A pending token followed by transport close rejects with `TRANSPORT_CLOSED` and never calls the injected fetcher. This is actual-class automated evidence, not native scheduler injection.
- The current screen-used resolution/refresh/showProfile callbacks, actual `restoreProfileEditor`, and actual `EditorCoordinator` now restore adopted nickname, timezone, and units from an empty tombstone. Repeated profile entry preserves the adopted values and saved status. Source inspection confirms Details Back uses that same profile restoration path. Genuine newer drafts and late input/account changes have focused regressions.

Engineering reports final-source native pause/resume with matching API revisions, A/B switch and expiry, clean process termination/relaunch with pending work, adopted profile followed by a save retaining the chosen values, selected-session result adoption/correction, and current-source Debug/Release builds. Release remained locked despite retained fixture records/authority. HQ read these observations in the [report](../../rebuild/docs/M1B_REPORT.md); it did not independently repeat native builds/interactions or inspect new native screenshot artifacts. Build warnings and deterministic native scheduler-race/physical-device limits remain explicit.

Accepted scope: real local PostgreSQL/API transactions and owner isolation under synthetic authority, durable command/receipt/recovery mechanics, local client synchronization, and the reviewed UI fixes. Fixture-only identity is not real authentication. Physical-device/Keychain integration, VoiceOver, Android, real token lifecycle, hosted operation, production migrations/backup/restore, and release security remain later gates. Existing dependency remediation is still open.

At acceptance, the reviewed implementation was the uncommitted working tree on top of `192dbfb`; no Git writes were made during the review. The owner subsequently explicitly approved the accepted M1b/docs checkpoint and routine future commits/pushes under [D-016](../DECISIONS.md#d-016--routine-private-repository-commits-and-pushes), superseding the earlier publication blocker. Check Git history/status and remote SHA for the resulting checkpoint. Next proposed work is separately scoped M1c identity/configuration planning. No Apple, Render, remote migration, phone setup, or M1c implementation is dispatched.

## Historical initial review — findings now closed above

## Delivery and independently verified baseline

Engineering delivered local, uncommitted M1b source and [M1B_REPORT.md](../../rebuild/docs/M1B_REPORT.md), then stopped for HQ review. It reports loopback HTTP/PostgreSQL integration, encrypted SQLite v3 delivery/base state, an explicit Debug sender/fixture authority, conflict review, and native Debug/Release checks. No real authentication, hosted work, or M1c acceptance is implied.

HQ read the report, setup script, migrations, PostgreSQL repository/API routes and tests, shared contracts, local-store changes, sender/tests, access/status changes, and screen integration. PostgreSQL guidance informed the account guard/RLS/connection checks; Expo networking guidance informed cancellation review. No application source was edited by HQ.

- Fresh `npm run check` passed: **38 tests** (API 2, contracts 7, mobile 29), typechecks, lint, and contract/API builds. Node's experimental SQLite warning remains.
- Fresh `npm run test:pg` passed **9/9** against the guarded `fitquest_m1b_synthetic_test` database. The initial sandbox startup failed on shared-memory permission; an approved escalated run started the existing marked local cluster, ran the tests, and stopped it afterward. Test data was exercised/reset only in the disposable integration database; development data and encrypted simulator stores were retained. No hosted database was contacted.
- `git diff --check -- rebuild` passed. This is baseline evidence, not proof of all recovery paths.
- Two in-memory source-driven probes below reproduced missing UI/cancellation behavior. They used actual delivered classes/callbacks with synthetic adapters/state; no network requests or native interactions were performed by these probes.

## F1 — Stop/close does not prevent a newly dispatched request

**Priority: P1; blocks acceptance.** Source: [sync.ts](../../rebuild/apps/mobile/src/sync.ts#L101), especially the awaits before `transport.command`, and [transport request/close](../../rebuild/apps/mobile/src/sync.ts#L28).

`SyncSender.perform` checks `stopped` at the loop condition but not after awaiting `takeNextSyncWork` and `emit` before dispatch. `LocalHttpTransport.close` only aborts controllers that already exist; a request awaiting its token has no controller yet and can create a fresh one after close. The UI calls these boundaries for pause, account change, and expiry. Discarding a late acknowledgement does not undo a newly dispatched server mutation.

HQ probe A imported the actual `SyncSender`, deferred `takeNextSyncWork`, started one iteration, called `stop`, then resolved the pending work. Observed order:

```text
transport closed
command dispatched after stop
```

HQ probe B instantiated the actual `LocalHttpTransport` with a deferred synthetic token callback and a recording fetcher, called `identity`, closed the transport, then resolved the token. The fetcher still received `/v1/identity` with `signal.aborted === false`. The common request path also serves commands. No real fixture token was read or printed.

Required correction: make closure/lifetime cancellation effective across asynchronous token and queue preparation, recheck active eligibility at the final dispatch boundary, and keep claimed-but-unsent work recoverable without fabricating a failure or acknowledgement. Avoid reopening an obsolete sender/transport generation. Regression tests must cover stop during queue take, status emission, token retrieval, and eligibility loss mid-batch; verify no new request starts after stop. Keep tests for already-in-flight uncertain outcomes and late responses across account changes. Native pause/switch/expiry checks supplement, not replace, deterministic tests. This is not a request to implement real token revocation/authentication.

## F2 — Adopting a server profile leaves stale editable values

**Priority: P2; blocks acceptance.** Source: [resolveReviewed](../../rebuild/apps/mobile/App.tsx#L133), [refresh](../../rebuild/apps/mobile/App.tsx#L190), and [showProfile](../../rebuild/apps/mobile/App.tsx#L210).

Conflict resolution updates the stored profile and `profile` state through `refresh`, but does not update `nick`, `zone`, `loadUnit`, or `distanceUnit`. `showProfile` only installs a nonempty raw draft; when the previous successful profile save left an empty draft tombstone, it labels the old form values as saved without rehydrating them from the adopted profile. A subsequent Save can unintentionally replace the server state the athlete just explicitly chose.

HQ extracted the exact delivered `resolveReviewed`, `refresh`, `loadDraft`, and `showProfile` callbacks, transpiled them in memory, and supplied synthetic state setters/store results. After adopting server state and opening Profile with an empty draft tombstone, the result was:

```text
Stored profile: Adopted server / America/New_York / kg / km
Visible form:   Old local      / UTC              / lb / mi
Input status:   Saved on this device
```

Required correction: reconcile the profile editor with the selected stored record when there is no real pending draft; preserve and clearly distinguish genuine newer raw drafts and input. Guard against late resolution/rehydration overwriting subsequent edits or another account. Audit the equivalent selected-session/result recovery path while staying within M1b. Add a regression using the screen-used reconciliation path, not just a repository assertion. Native verification should adopt a different nickname/timezone/units, return to Profile/Back/Details, and confirm the fields match the choice and cannot silently revert it on Save. Also remove stale unconditional claims such as “Server setup is unconfirmed” when the corresponding profile is confirmed.

## Evidence limits and follow-up

Engineering's reported native mixed-session drain, lost acknowledgement, API outage/reconnect, controlled apply-local conflict, A/B walkthrough, SQLCipher diagnostics, and current-source Release lock are retained as reported evidence. HQ did not repeat native builds or interactions during this review. The report explicitly says a native process kill/relaunch was not separately exercised after the final edits; Home/reopen is not equivalent.

After correcting F1/F2, rerun the baseline and PostgreSQL integration tests, exercise affected native paths and final-source process termination/relaunch with pending or uncertain work, and refresh Release/default fixture-lock evidence if access/network code changed. Include reproducible synthetic artifacts or precise observations, source version, actual commands, and explicit remaining limits in the report. Do not present unrun timing/physical-device/accessibility checks as passing.

No M1b acceptance or M1c assignment yet. HQ is returning these findings within the already owner-approved [M1b handoff](../ENGINEERING_M1B_HANDOFF.md); no new hosting, migration-target, auth, phone, or Git authority is added. The accepted M1a checkpoint remains `192dbfb` on private GitHub. M1b source and subsequent HQ documents remain local; the previously blocked coordination-document push is still awaiting explicit user confirmation.
