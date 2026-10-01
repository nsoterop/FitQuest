# FitQuest — M1c.4b HQ Acceptance Review

Date: 2026-10-01 · Status: **Accepted for internal simulated-provider/local PostgreSQL scope. F1 closed after independent re-review.**

## Final re-review and acceptance

Engineering correction turn `01a0f818-bdfb-7870-9aa2-555e8efcaa59` addresses F1 with additive migration 007. HQ independently confirmed that its helper definition differs from 005 only in `CREATE OR REPLACE`, explicit `STRICT` preserving 006, and the disabled-account denial code. The applied helper retains strict arguments, security-definer execution and the fixed search path; privilege/role regression tests pass. PostgreSQL documents that replacement preserves ownership and permissions while other attributes must be restated ([PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createfunction.html)). The PostgreSQL review skill focused this verification on least privilege and unchanged transaction boundaries.

Fresh independent checks: `npm run check` (211 tests, all typechecks/lint/builds); exchange PostgreSQL (40) and preflight (8); existing auth PostgreSQL (24) and preflight (4); existing synchronization PostgreSQL (9). **296 tests pass**, plus both compiled checks and HQ's separate compiled reproduction. The original fresh disabled-B request now returns `AUTH_INVALID` with zero dispatch/claim, while A remains active. Requests using B's known credentials still identify revocation, and explicit A-family logout still revokes. F1 is closed; no blocking findings remain in this bounded review.

HQ verified the seven-entry target ledger and unchanged tracked migrations 001–004. Engineering reports preserving 005/006 against its pre-correction snapshot and preserving 40 retained rows/helper metadata across upgrade and repeated setup; HQ did not recreate the old migration state or rerun setup. All three clusters were initially stopped, started only through migration-free guards for review, then stopped with data retained. HQ's invented probe records remain. No new migration, provider call, native/device/hosted action or AI work occurred during re-review. Node 24.12.0 was exercised; the declared runtime floor remains unexecuted.

This accepts the internal simulated exchange, not working Apple sign-in, public API integration or production readiness. Routine reviewed checkpoint publication is authorized under D-016. Subsequent work requires a bounded handoff; D-019 remains unchanged. Earlier withheld findings and dispatch notes below are historical evidence superseded by this acceptance.

## Initial review — scope and result

HQ independently reviewed Engineering's internal simulated sign-in exchange against the [handoff](../ENGINEERING_M1C4B_HANDOFF.md) and binding [Architecture proposal](../proposals/M1C_ARCHITECTURE_PROPOSAL.md). Delivery is uncommitted on base `c7984158fffca2651e0ba9820b652c6364cb689a`; the latest accepted implementation remains M1c.4a, `959f74032f3028a616c43bc732b0dbd98154b074`. Engineering's [report](../../rebuild/docs/M1C4B_REPORT.md) is delivery evidence, not acceptance.

Review covered orchestration, session/repository changes, migrations 005/006, target guards, privileges, lock ordering, crash/replay/deadline behavior, tests and compiled checks. The PostgreSQL review skill guided the short-transaction, consistent-lock-order and least-privilege checks. HQ changed only shared review/status documents, not implementation.

## F1 — P2 (closed): Do not classify pre-authentication account denial as bound-session revocation

Source: [005_simulated_exchange.sql](../../rebuild/services/api/migrations/005_simulated_exchange.sql), line 76; asserted by [exchange-postgres.integration.test.ts](../../rebuild/services/api/src/exchange-postgres.integration.test.ts), line 332. The claim helper returns `SESSION_REVOKED` when the verified subject maps to a disabled account. Orchestration forwards this result from a fresh challenge exchange that contains no FitQuest credential/family binding.

The approved contract reserves that code for confirmed revocation of a known credential's family. Account denial alone does not identify the locally bound family. Carrying this classification into later adapters would conflate denied sign-in with authority to lock local access. This is a contract/integration defect, not an observed device lockout: public/mobile exchange adapters are not connected, and the existing mobile coordinator separately checks session identity.

HQ independently reproduced the result using the compiled module, generated signed tokens and the exact guarded exchange database:

1. Create invented A and B accounts through simulated exchanges; activate A.
2. Disable only newly created B through the synthetic test admin connection.
3. Submit a fresh, valid B challenge exchange with no A/B FitQuest bearer attached.
4. Observe `{kind: 'error', code: 'SESSION_REVOKED'}`; no provider dispatch and no attempt row for that denied challenge. A's existing session remains active.

Required correction: preserve disabled-account denial but return an appropriate existing non-revocation denial such as `AUTH_INVALID`, or obtain a separately reviewed account-level classification. Do not weaken status/epoch checks or change correctly family-bound session revocation. Replace the test that endorses the incorrect classification; cover fresh disabled-B denial, zero dispatch/issuance, unaffected A, and continued known-family revocation/epoch enforcement. Update the delivery report. Preserve already-applied migration checksums; if SQL changes, use an additive forward migration and exact-target guard updates, not reset/rewrite.

## Independent verification

- `npm run check`: all typechecks, lint, contract/API builds and **211 tests** passed (75 API, 12 contracts, 124 mobile).
- `npm run test:pg:exchange`: **39 exchange + 7 preflight tests** passed.
- `npm run test:pg:auth`: **24 auth + 4 preflight tests** passed.
- `npm run test:pg`: **9 existing synchronization tests** passed.
- Total: **294 passing automated tests**. Passing tests currently encode F1; they do not close it.
- Both `m1c4a-compiled-check.mjs` and `m1c4b-compiled-check.mjs` passed, including default health-only route exclusion and pending issuance/activation/private operations/refresh/logout recovery.
- HQ's additional compiled F1 probe confirmed the finding with zero outbound calls and no secret output. `git diff --check` passed. Node 24.12.0 was exercised; the declared Node 22.13.0 floor was not.

All three test clusters were initially stopped. HQ started only the guarded M1c.4b exchange, M1c.3 auth and safe M1b regression targets, then stopped all three with files/data retained. Existing suites performed their guarded synthetic cleanup; HQ's additional probe retained its invented records. No setup/migration/reset, retained development-fixture change, provider call, native/device action or hosted change occurred. Engineering's setup-idempotency evidence was inspected but not independently rerun.

## Next gate and remaining limits

Next is a bounded Engineering correction for F1, followed by HQ re-review and regression checks. This review does not dispatch that correction or authorize another milestone. No implementation checkpoint was accepted, committed or pushed during this review.

Subsequent coordination, 2026-10-01: the owner authorized dispatch. HQ sent the existing Engineering chat a correction scoped to `AUTH_INVALID` for pre-authentication disabled-account denial, preserved family-bound revocation, regression coverage and additive-only migration changes if needed. Engineering must stop for independent re-review. [D-024](../DECISIONS.md#d-024--routine-acceptance-review-correction-routing) records standing permission for routine in-scope correction routing; acceptance remains withheld until evidence closes F1.

Outside F1, reviewed transaction boundaries and tests support the intended one-use claim, external work outside transactions, fenced atomic pending issuance and isolated role boundaries. This is not a comprehensive security audit or proof of live Apple compatibility. Real provider transport/credential lifecycle, routes/abuse controls, native/device/hosted integration and production readiness remain separate gates.

**D-019 remains mandatory:** explain the proposal and obtain fresh owner approval before any product AI implementation, scaffolding, prompts or evaluation code/calls.
