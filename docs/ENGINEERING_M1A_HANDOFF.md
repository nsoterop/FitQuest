# FitQuest — Engineering M1a: Durable Local Logging

Status: Owner-approved and dispatched on 2026-09-23; initial implementation and the subsequent owner-approved [correction assignment](ENGINEERING_M1A_CORRECTIONS.md) are delivered. HQ's post-correction check passes 24 tests, typechecks, lint, and builds. **Acceptance remains pending review and remaining native evidence**, as described in [M1A_REVIEW.md](reviews/M1A_REVIEW.md) and Engineering's dated report. The original assignment below is retained; Engineering is idle and M1b is not dispatched.

## Outcome and scope

Implement the first usable local slice under `rebuild/`: minimal profile setup, an unplanned session containing strength and manually entered timed activity, durable drafts/actuals, truthful local-save status, and recovery after process termination. Preserve shared account-scoped contracts for later real authentication and synchronization.

This is one product under construction, not a separate demo app. Because real authentication is not implemented yet, use isolated, explicitly labeled developer/test identities and synthetic data solely to verify this increment. A fixture never proves Sign in with Apple or production account security. Do not enter/import the owner's health records. Do not mark M1 complete.

## Starting point and required context

M0 and its Debug/Metro/Fast Refresh follow-up are accepted. Recheck the current source and Git state; all files are untracked with no committed baseline at dispatch. Preserve user changes. No worktree, commit, broad staging, or prototype rewrite is authorized.

Read PROJECT_CONTEXT, DECISIONS, DESIGN_SYSTEM, and HANDOFF in `docs/`, plus:

- [M1 Architecture proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md): record/quantity/time/command contracts and local persistence boundaries.
- [Recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md): takes precedence over conflicting proposal details.
- [M1 Design source](proposals/M1_DESIGN_PROPOSAL.md) and [HQ Design review](reviews/M1_DESIGN_REVIEW.md): approved direction, offline-access policy, and M1a cuts.
- [Product brief](PRODUCT_BRIEF.md): applicable AC-01/04/05/10 and outage-related AC-11; these are product-wide criteria, only partially covered here.
- [Development report](../rebuild/docs/DEV_WORKFLOW_REPORT.md) and [dependency triage](reviews/FOLLOWUP_REVIEW.md): preserve the working local development loop and disclose existing warnings.

Relevant starting files: `rebuild/packages/contracts/src/index.ts`, `rebuild/packages/contracts/src/index.test.ts`, `rebuild/apps/mobile/App.tsx`, the mobile package/app configuration, `rebuild/package.json`, `rebuild/README.md`, and the existing API health tests. Do not port prototype code wholesale.

## Ownership and permitted changes

Engineering is the sole implementation writer in this working tree. Allowed: `rebuild/apps/mobile/`, `rebuild/packages/` for contracts and a small local/domain testable boundary if useful, rebuild-local tests/tooling/package lockfile, `rebuild/README.md`, and `rebuild/docs/M1A_REPORT.md` with synthetic screenshots. Keep API liveness behavior and its tests passing; no athlete/auth API routes or database provisioning in this slice.

HQ alone edits shared `docs/`. Design and Architecture have no simultaneous implementation assignment. Do not send work to other tasks. Use relevant Expo skills and current primary documentation for native API/dependency choices. Install/pin only directly necessary compatible local dependencies; no broad upgrades, forced audit fix, global installation, paid/cloud build, or stack migration.

## Implement

### 1. Shared validated records

Implement strict runtime schemas and pure transition validation for the reviewed minimal profile, quantities/load basis, strength/timed results, actual activities/sessions, and versioned profile/session command envelope. Preserve the existing liveness contract. Keep transport-independent types reusable by the API later.

Unknown stays `null`, distinct from explicit zero. Preserve per-dumbbell/total/assistance meaning and repetition/side semantics. Do not infer machine equivalence, multiply load without a known implement count, or insert sample actuals. Unsupported future result kinds and prescription fields must fail explicitly. Corrections retain stable IDs/history; omitting a saved result must not silently delete it.

Distinguish actual performance, entry, local revision, and future server-commit timestamps. Validate start/end ordering and recorded local date/timezone; profile/timezone/unit edits cannot reinterpret historical records. Use bounded validation defaults where necessary and document them; they are engineering safeguards, not hardcoded training prescriptions.

### 2. Real native local persistence

Use the Architecture-recommended Expo SQLite adapter and validate/pin its compatibility with the installed SDK during implementation. Exercise the intended native SQLCipher + separately stored per-account SecureStore key path using synthetic stores. The native configuration, narrowly necessary dependencies, and disposable rebuild-only local migrations are in scope. Do not substitute an in-memory-only repository or silently fall back to plaintext to call this complete. If the native configuration is blocked, complete unaffected contracts/tests and report the precise blocker.

Use environment/account-scoped databases with checked ownership metadata, serialized writes, parameterized values, and the reviewed exclusive transaction boundary. Keep keys separate from auth state. Missing keys/ownership inconsistencies/migration failures preserve existing stores and surface recovery errors; never reset to an empty database or regenerate a key over pending work. Check current official guidance for the proposed SecureStore accessibility and SQLite pragmas before applying them.

Number/checksum local migrations and commit each with its ledger atomically. Separate raw in-progress form drafts from valid actual records. A valid save atomically persists its local projection/revision/history and immutable pending command/dependency metadata; an invalid draft must not become a valid command. Enforce immutability at the repository boundary, not just through UI conventions. Preserve command ordering and profile prerequisites; no coalescing away prior accepted work.

There is no sender yet. Keep commands durably pending and do not manufacture acknowledgements, server revisions, or server setup-completion timestamps. Backend retry/conflict handling is deferred, not simulated as working synchronization.

### 3. Minimal usable UI

Implement a simple Sessions-first flow using the approved provisional neutral/teal styling and accessible shared React Native controls. No app-wide UI framework rewrite is necessary.

- Minimal required profile: validated editable timezone, pounds/miles defaults with alternate unit preferences, optional nickname; local completion truthfully separate from server confirmation.
- Sessions list/start/resume; multiple same-day and unfinished sessions; cached local history only, without claiming complete server history.
- Activity name plus Strength/Time entry method; variation/equipment context without requiring an inventory.
- Strength entry/correction with blank actuals, load/side/repetition basis and optional RPE/RIR; manual duration entry/correction. No live timer in M1a.
- Explicit Save set/Save time for valid factual records; persist recoverable form drafts separately. Show whether the latest visible input is unsaved, draft-saved, saving, saved locally/pending, or failed. Never claim a field is durable before its write commits.
- Explicit activity/session outcome selection, finish/end early/leave unfinished, preserving blanks and partial work. No automatic performed results or silent deletion. Do not add discard/delete-account controls.
- Small status detail surface. Since sync is not connected, say so instead of promising an automatic upload or showing Synced. Do not present nonfunctional Retry sync or Sign in with Apple buttons as working.

Keep units/basis visible, support larger text without clipping, usable keyboard/error focus, screen-reader labels, and non-color-only status. Exact tokens can be refined after screenshots; do not treat the provisional palette as a final design lock.

### 4. Local authorization boundary and test harness

Define an injectable, provider-independent account-access boundary. In future production use, ordinary credential expiry for an already-verified locally authorized account permits local capture with synchronization paused. Explicit logout/switch or confirmed revocation locks access and invalidates old work; absent/corrupt/mismatched ownership state fails closed. Restart must validate durable local authorization before opening the store, never trust only a cached account ID. Preserve pending records and their keys.

For this slice, fixture entry requires both development build gating and an explicit opt-in. Show a persistent “Local test identity · Synthetic data only · Sync not connected” indication. Default/Release startup must not unlock athlete records via the fixture; verify even when a fixture setting or old synthetic data exists. Keep fixture database/key namespaces isolated from future real accounts. Do not add a backend identity bypass, genuine credentials, public demo account, or automatic adoption of test records by a later real user.

Provide a safe developer-only way to exercise two synthetic account identities and local-write failure. Test delayed saves/callbacks across account-generation changes so old work cannot become account B's records or UI. Test-only acknowledgement fixtures may validate state reducers, but must never present actual sync success in the user flow.

## Required verification

Run and report exact commands/results, not merely a plan:

1. Existing `npm run check` passes, expanded to include the new contract/domain/storage tests. Preserve current API liveness tests and compatible dependency checks.
2. Contract tests cover blank versus zero; invalid/unknown variants; load/repetition/side semantics; stable correction IDs/no silent removal; finish/partial/skipped behavior; invalid profile/date/time; midnight/DST and changed profile preferences.
3. Local transaction failure injection between projection/history/outbox writes proves all-or-nothing behavior. Reopening shows no accepted fact without its pending command, no partial revision, and no duplicated operation from repeated save submission/retry. Test raw-draft recovery separately from valid facts.
4. Native adapter evidence—not only mocks—proves SQLite persistence and the encryption/key configuration, owner metadata checks, migration version/failure behavior, and safe failure with a missing/wrong key without deleting original records. Use only explicitly identified synthetic stores; do not wipe the simulator or Keychain wholesale.
5. Simulator walkthrough: fixture identity → profile → mixed session → blank/zero actuals → correction → leave unfinished → terminate/relaunch → restored session/draft and pending commands → finish/end early → another session the same day. Verify failure feedback, a successful retry, and current input visibility. Save representative synthetic screenshots.
6. Two-fixture account isolation and access transitions: offline/ordinary expiry retains eligible local access; logout/switch/revocation locks it; A → B → A never leaks A into B; a stale A callback is rejected; missing/corrupt state does not unlock records.
7. Confirm the documented Debug/Metro workflow still renders. Smoke-check Release/default startup with fixtures disabled and deliberately present fixture settings/data; neither must bypass the unavailable real-authentication path. Native builds remain loopback-only; no physical-device transport/signing changes.
8. Check keyboard and larger-text layouts on simulator; record any screen-reader checks actually performed and any unrun physical-device/accessibility/security gates. A synthetic local test does not close production authentication, hosted synchronization, or full M1 acceptance.

## Report and stop

Write `rebuild/docs/M1A_REPORT.md` with changed files, dependency/configuration choices and current-source links, setup/test-harness commands, exact tests and observations, screenshots, limits, and remaining gates. Update rebuild README for repeatable local use. Keep secrets and real health data out of logs/screenshots/fixtures. Record the known transitive dependency advisory and any new findings; no forced downgrade or unrelated remediation.

No AI, HealthKit, nutrition/goal interpretation, runtime training plans, backend synchronization, PostgreSQL provisioning/migrations, real Sign in with Apple setup, deployment, LAN/tunnel exposure, Git commit/worktree, or prototype retirement. Continue within this scope until its checks pass or a specific authorization/tooling blocker remains; do not seek approval for each routine in-scope edit/test. Stop after the evidence report for HQ review, without starting M1b.
