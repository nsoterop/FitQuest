# FitQuest — Engineering M1b: Local API/PostgreSQL Synchronization

Status: Owner-approved assignment completed and **accepted by HQ on 2026-09-25 for local synthetic-data synchronization**. Engineering task `01a0d053-66ed-79a0-a0bb-5b366646e723` is idle. [F1/F2 are closed](reviews/M1B_REVIEW.md); HQ independently passed 49 baseline tests and 9 PostgreSQL integration tests. This retained handoff grants no further implementation, M1c, Git, or hosted authority.

## Outcome

Connect the accepted local logging slice to a real, disposable local PostgreSQL database through the Fastify API. Demonstrate profile/session synchronization, immutable retries, conflict recovery, offline/restart recovery, and two-account isolation using synthetic identities only. The app remains one product under construction, not a public demo or a production-authenticated coach.

The owner approved the M1a Git checkpoint and this previously proposed next increment, and declined a physical-phone setup detour. No Render changes, remote migrations, deployment, Apple configuration, or phone signing/setup are authorized.

## Starting point and required reading

Accepted M1a checkpoint: `192dbfb0f32fb26ea27a15a1a48d6370b8eec321`, pushed to private `nsoterop/FitQuest` and verified against GitHub on 2026-09-25. HQ reran `npm run check`: 31 tests, typechecks, lint, and builds passed. Reinspect current Git/source state and preserve any later changes. M1a's native timing, device, accessibility, and Release evidence limits remain real; do not inherit them as new passing results.

Read the shared PROJECT_CONTEXT, DECISIONS, DESIGN_SYSTEM, ROADMAP, HANDOFF, and PRODUCT_BRIEF, then:

- [Architecture proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md), with the [recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md) taking precedence for dependency chains, durable terminal outcomes, replacement transactions, and account-wide operation claims.
- [M1a acceptance review](reviews/M1A_REVIEW.md) and [Engineering evidence](../rebuild/docs/M1A_REPORT.md), including F1–F6 regressions.
- [Approved Design review](reviews/M1_DESIGN_REVIEW.md) and [source proposal](proposals/M1_DESIGN_PROPOSAL.md) for clear save/sync/conflict distinctions; no broad redesign.
- [Rebuild setup](../rebuild/README.md) and [dependency triage](reviews/FOLLOWUP_REVIEW.md).

Relevant starting files: `rebuild/packages/contracts/src/index.ts`; `rebuild/services/api/src/app.ts`, `server.ts`, and tests; `rebuild/apps/mobile/src/store.ts`, `access.ts`, `accountTransitions.ts`, `editor.ts`, `resultIntent.ts`, `status.ts`, and their tests; `rebuild/apps/mobile/App.tsx`; rebuild-local manifests/lockfile and setup documentation.

## Ownership and authority

Engineering is the sole implementation writer under `rebuild/`, including API, mobile, shared contracts, new local database/migration/test tooling, directly necessary compatible dependencies, rebuild README, and `rebuild/docs/M1B_REPORT.md`. HQ owns root README and shared `docs/`. Design and Architecture have no concurrent implementation assignment. Use this existing checkout; no new task/worktree is needed. Do not commit, push, stage, or change Git configuration from Engineering.

Use applicable skills and current primary documentation for implementation choices. Install only necessary compatible project-local dependencies; no broad upgrades, forced audit fixes, global software installs, or paid/cloud builds. If the local PostgreSQL runtime is unavailable, identify safe installed options, complete unaffected work, and report the exact prerequisite rather than substituting SQLite/in-memory tests for PostgreSQL evidence or installing system software without approval.

Local database creation and migrations are authorized only for explicitly named, task-owned disposable synthetic resources. Verify the host, database name, and ownership marker before applying migrations or cleanup; reject non-loopback/ambiguous targets. Preserve all existing prototype databases, encrypted simulator stores/keys, revoked fixtures, and unrelated services. Prefer retaining test resources with documented shutdown/cleanup steps over destructive cleanup. If using an already-installed container runtime, bind published ports to `127.0.0.1` and use clearly named task-owned resources. No wildcard/LAN/tunnel exposure. Never load prototype environment files or print connection secrets.

## Implementation requirements

### 1. Local API and database boundary

- Implement the accepted profile/session command, owned read/list, and operation-outcome contracts with runtime request/response validation. Preserve API liveness behavior. Athlete writes pass through the API; the mobile app never receives database credentials.
- Use real PostgreSQL current state, immutable revisions, and account-wide operation outcomes. Add numbered forward migrations and repeatable guarded setup for the named disposable local database. Existing SQLite v1/v2 migration checksums and retained data must survive any additive local schema change.
- Follow the addendum's short per-account guard and consistent lock order; claim the account-wide operation ID before touching its target aggregate. Use one checked-out connection for each transaction. Success commits state, revision, and receipt atomically; a well-formed authenticated domain rejection commits its terminal outcome without changing domain state.
- Replay the original terminal outcome for the same account/operation/hash; reject changed content or a different target using that ID. Recover unknown outcomes without inventing a new ID. Keep a unique database constraint as a second guard. Preserve profile prerequisites, stable result IDs, explicit corrections, null/zero, load/unit, timestamp, and activity/session semantics.
- Enforce owner isolation for every read/write/operation lookup, bounded validation/listing, parameterized database values, private-response no-store behavior, and sanitized diagnostics. Caller-supplied resource/account identifiers are not authority. Do not silently adopt a proposal's unverified operational limits; choose and document bounded local defaults with tests.

### 2. Explicit synthetic identity boundary

Real Apple sign-in, token issuance/refresh/activation, and production identity remain M1c. Use an injectable server identity boundary and a separately explicit local-test entrypoint for two synthetic accounts. The normal/default/production entrypoint must not enable the fixture or accept arbitrary client account headers as authentication. No fixture secret or database password in tracked files or the shipped Release bundle.

Keep the test API loopback-only, with explicit opt-in and isolated synthetic account/storage namespaces. Verify absent/invalid fixture authority fails closed; retain default/Release mobile locking even with test settings/data present. The local test path demonstrates authorization scoping, not verified Apple identity or full production security. Ordinary synthetic credential expiry pauses sending while eligible local capture remains; logout/switch/revocation stop sending and invalidate stale callbacks without deleting pending work or keys.

### 3. Durable synchronization and recovery

- Add a small testable sender used by the app's actual sync path, with explicit local-test enablement. Preserve immutable payload/operation IDs and per-aggregate ordering. A session create waits for acknowledged profile setup; a successor waits for a durable predecessor receipt.
- Persist queued/sending/outcome-unknown/acknowledged/blocked/superseded state and dependency/replacement links separately from immutable command content. Timeouts, process death, malformed or mismatched replies, and failed local acknowledgement stay uncertain; retry the same operation with bounded backoff. Do not treat an absent lookup result as proof a prior request cannot commit.
- Validate receipt identity, target, revision, and request hash before atomically updating the acknowledged base/outbox state. Preserve newer local projections and raw drafts; an older acknowledgement cannot label newer input synchronized. Server reads cannot overwrite dirty local work.
- Definite rejection blocks dependent work. Preserve latest local intent, including later queued edits. Conflict/rejection recovery must review current server state and local intent, retain old history, and create explicit replacement operations only after uncertain outcomes are resolved. Apply replacement links/base/projection together with account-generation and local-edit-sequence checks; stale review fails without losing input. No silent last-write-wins, routine coalescing, or force-save shortcut.
- Use a minimal real conflict/recovery surface consistent with approved styling: show the relevant local/server differences, explain blocked work, and require explicit resolution. Adopting server state retains superseded local history; applying reviewed corrections uses the current revision. Include a functional retry action where safe. Separate current input/local save from pending/sending/confirmed/blocked/sign-in-needed states. A count of zero alone is not proof of synchronization.

## Required verification and acceptance criteria

Run exact commands and report results. Do not count skipped/unavailable integration suites as passing.

1. Existing `npm run check` and expanded contract/mobile/API regressions pass. Document a repeatable real-PostgreSQL integration command and safe prerequisites; preserve all M1a regressions.
2. A real local HTTP/API/PostgreSQL round trip saves profile then a mixed strength/timed session, returns validated receipts, and yields matching owned reads. Restart client/API and reconnect without duplication. Assert rows/revisions/outcomes, not only screenshot text.
3. Inject failure at transaction write boundaries and around server commit/client acknowledgement. Lost or malformed success, repeated submission, and concurrent duplicates produce one effect and the original receipt. Same operation ID racing across two target sessions yields one terminal claim and no loser mutation. Durable rejection retries remain rejected.
4. Prove A expecting revision 3 and B expecting 4: rejected A blocks B; unknown A pauses B; committed A with lost acknowledgement retries unchanged, then permits B only after local acknowledgement commits. Initial profile rejection blocks dependent session creation; correcting setup enables correctly rebuilt chains.
5. Conflict recovery includes later local edits, retains superseded history, and survives restart before/after replacement. A concurrent edit or account switch rejects stale resolution. A second client/server revision advance conflicts again rather than force-saving. Dirty caches/drafts are not overwritten by reads or older acknowledgements.
6. Two synthetic accounts cannot read/write/list/replay each other's resources/outcomes; missing and foreign resource responses avoid disclosure. Test pooled owner-context reset, unauthorized calls, delayed responses during A → B → A, and logout/revocation races at the fixture boundary. Invalid/expired authority must not send pending work; no claim that these replace real auth tests.
7. Run a current-source iOS simulator walkthrough through the actual local sender and real API/PostgreSQL: mixed logging, offline edits, pending state, restart/reconnect, acknowledgement, conflict/recovery, failure/retry, and account separation. Preserve repeat-Details/Back and current-input status. If deterministic native timing is unavailable, report the boundary and supply automated timing evidence, not a fabricated native pass.
8. Refresh current-source Debug and Release/default evidence because the sync integration changes access/network behavior. Release/default cannot enter fixture records or contact the synthetic API even with old test settings. Retain existing stores/keys. No phone installation, signing, TestFlight, LAN exposure, or Apple account changes.
9. Report dependency/configuration changes, validation limits, safe local setup/shutdown, synthetic evidence, and all unrun checks. No secrets, real health records, or unsanitized private payloads in diagnostics/screenshots.

## Report and stop

Write `rebuild/docs/M1B_REPORT.md` and update rebuild README with exact setup/test commands, source files, migration/recovery behavior, API/database/native evidence, remaining limits, and known advisories. Continue routine work within this assignment without repeated approval requests. For material architecture ambiguity, out-of-scope requirements, or unavailable tooling, give HQ a precise blocker and bounded recommendation; do not expand into authentication/hosting work.

Stop for HQ review after delivery. M1b acceptance, full M1 completion, M1c, AI/goals/nutrition/HealthKit, public release, Render, remote migrations, and prototype retirement are not authorized by this assignment. Git writes remain HQ-owned for the approved checkpoint only, not automatic publication of unreviewed M1b code.
