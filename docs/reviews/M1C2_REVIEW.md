# FitQuest — M1c.2 HQ Review

Date: 2026-09-25 · Status: **Accepted for local synthetic account/store boundaries; F1/F2 closed.**

## Latest decision — bounded acceptance

HQ accepts the correction delivered in Engineering turn `01a0da03-9a05-79b2-a945-7ae489ceddcc`; Engineering is idle. This supersedes the historical withheld review below. The scope is UUID-owned synthetic repositories, fixture isolation, and injected protected-record/SQLite authorization boundaries—not real authentication, native credential persistence, hosted synchronization or full M1c.

HQ independently reran `npm run check`: **137 tests** (API 2, contracts 12, mobile 123), typechecks, lint, and contract/API builds passed. Diff checks passed. A source comparison confirmed fixture migration v1/v2/v3 SQL literals are unchanged from the previous checkpoint. Node's existing experimental SQLite warning remains.

**F1 closed:** the original actual-class probe now returns `logout_incomplete` followed by `complete` when storage recovers, with two lock attempts, one stop and one destination callback. Repeated success does not replay it. Independent concurrent-call and destination-failure probes confirm latest-destination selection and no replay after a partial callback failure. Repository tests additionally exercise those paths with the actual SQLite/latch boundary and retained records. The destination-failure contract intentionally requires explicit reconciliation; this increment does not install its recovery UI.

**F2 closed within injected-port scope:** reviewed and independently ran 28 operation-specific interruption/restart cases across all four ordered writes, four actual readback-error cases, delayed protected/SQLite callbacks losing to logout, and a delayed SQLite transaction rolling back for a newer epoch. Tests cover initially locked and previously authorized stores, preserve facts/drafts/commands, and distinguish incomplete unlock from a fully committed authorization with lost acknowledgement. A failure before any durable transition can leave the previous valid binding unchanged; total durable-lock failure still cannot promise crash-safe logout.

Native evidence is deliberately narrower: HQ inspected both initial screenshots and reviewed Engineering's reported fixture/Release checks, but did not repeat native builds/interactions. The correction changes test-bound switch behavior and UUID-latch fault hooks; those paths are not invoked by the fixture or locked Release App. Prior simulator evidence is retained for those unchanged execution paths, **not** represented as a new final-source native build or native UUID/Keychain proof. Native adapter timing, SQLCipher connection concurrency, device/backup/reinstall and actual credentials remain later gates. API/PostgreSQL paths are unchanged and were not rerun.

The accepted checkpoint includes the reviewed M1c.2 `rebuild/` sources/tests/report/two synthetic screenshots and HQ status documents under D-016. Git history and remote verification identify its resulting SHA. The next recommended increment is M1c.3 transactional server sessions with disposable local PostgreSQL and synthetic provider identities; it is not dispatched by this acceptance. No AI, Apple configuration, phone installation, hosted change or deployment is authorized. D-019 remains mandatory before any product AI implementation.

## Historical initial review — superseded by acceptance above

## Delivery and evidence

Engineering delivered turn `01a0d9e8-9b0a-7dd3-a065-063d878a10c6` against [M1c.2](../ENGINEERING_M1C2_HANDOFF.md). The change separates fixture transport/identity from UUID-owned synthetic test stores, reuses the domain repository, and adds injected protected-record plus SQLite authorization latches. No real sign-in, hosted service, AI integration or next increment is accepted.

HQ independently reran `npm run check` from `rebuild/`: **101 tests** (API 2, contracts 12, mobile 87), typechecks, lint, and contract/API builds passed. `git diff --check -- rebuild` passed. HQ inspected the changed ownership/store/latch/sender paths, new regressions, and [Engineering report](../../rebuild/docs/M1C2_REPORT.md). The actual-class retry probe below failed despite the baseline passes.

HQ visually inspected both delivered screenshots: Debug shows synthetic A, an existing completed session and an unavailable local API; Release shows only the locked/unconnected-authentication message. The report records native builds, storage diagnostics, A→B→A and restart checks. HQ did not repeat native builds or simulator interactions. UUID-store key/protected-record behavior is injected/simulated; native UUID authorization, Keychain lifecycle, physical-device and deterministic native races remain unverified. No new PostgreSQL verification was needed or claimed.

## F1 — Failed logout cannot be retried through the account-switch boundary

**P1; blocks acceptance.** [DurableAccountSwitch](../../rebuild/apps/mobile/src/auth/durableSwitch.ts) sets `stopped` before attempting the durable lock and returns `logout_incomplete` on every subsequent call. A transient failure of both lock writes therefore leaves the same transition permanently unable to recover, even after storage becomes writable. The accepted architecture explicitly requires retrying persistence while switching stays blocked.

HQ ran the actual class with `node --import tsx`, an injected lock initially returning false, then returning true. First call: `logout_incomplete`; retry: `logout_incomplete`; total lock calls: **1**; stop calls: 1; next-account callbacks: 0. This was an in-memory probe with no native storage, credentials or network activity.

Required: make durable-lock failure retryable while keeping old visible/sender work stopped, serializing/coalescing concurrent attempts and preventing duplicate or stale destination callbacks. Do not restart private access, recreate/reset the store or delete credentials to retry. Test the same transition object through a transient failure and recovery using the actual SQLite/latch boundary; also cover repeated/concurrent requests, thrown lock failures, and destination-callback failure with an explicit safe recovery contract. Completion must still require durable lock evidence. The existing test closes/reopens the repository and calls its latch directly; that bypasses this defect rather than exercising retry through the switch helper.

## F2 — Authorization interruption coverage stops before the actual unlock writes

**P2; acceptance evidence gap, not a reproduced unsafe unlock.** The test named “keeps every partial authorization state locked” throws at the first matching generic phase. `authorize()` writes protected locked → SQLite locked → protected authorized → SQLite authorized, but each phase name occurs twice. Consequently the current four cases stop during the initial locking writes; they never reach the protected-authorized or SQLite-authorized writes. The `after_latch_write` hook is inside the transaction and rolls back—it does not exercise a crash after SQLite commit or failed readback. The existing epoch test delays identity verification, not persistence/readback.

Required: use occurrence-aware or operation-specific fault/barrier tests through the actual repository/latch implementation. Cover all four ordered writes, failures before/after commit and during readback, restart after each persisted boundary, and delayed protected/SQLite callbacks when logout or a newer epoch wins. Verify that incomplete unlocks stay locked, stale work cannot authorize or commit facts, and retained drafts/history/commands survive verified recovery. Distinguish a genuinely completed matching authorization whose acknowledgement was lost from an incomplete transition; do not demand that a successfully committed dual binding disappear. Include prior-authorized same-account reauthorization as well as initially locked stores and document any unchanged pre-transition state when no durable write occurred.

## Correction scope and stop

Engineering remains the only implementation writer, limited to the existing `rebuild/` M1c.2 boundary, focused regressions and report. Preserve fixture names/keys/migrations/data and default/Release exclusion. Rerun the full baseline and explain whether any runtime source change requires updated native evidence. No broad refactor, new dependency, M1c.3, Apple configuration, real credentials, PostgreSQL/hosted changes, phone installation, Git writes or product AI work. HQ owns shared documents and final integration. Return for HQ review after F1/F2; acceptance and checkpoint publication remain pending.

**D-019 remains a hard stop before any product AI implementation:** HQ must explain scope/data/privacy/provider/model/cost/safety/evaluation and obtain fresh owner approval first.
