# FitQuest — M1c.3 HQ Review

Updated: 2026-09-29 · Status: **Accepted for isolated local synthetic-data scope; F1/F2/F3 closed.**

## Final acceptance — 2026-09-29

HQ independently reviewed Engineering's F3 correction (turn `01a0de9b-f3a2-7e21-8bb4-e7f058bebd54`) against the original failure. Activation session IDs and refresh operation IDs are validated with the existing contracts and canonicalized before comparisons, queries and persistence; activation returns the database's canonical identity. Historical domain command serialization/hashes and migrations 001/002 remain unchanged. No new migration was needed for F3. The PostgreSQL review skill focused this review on short account-first transactions and least-privilege/RLS boundaries.

Fresh independent checks: `npm run check` passed **138 default tests** (2 API, 12 contracts, 124 mobile), typechecks, lint and builds; `npm run test:pg:auth` passed **24 real PostgreSQL tests and 4 pure preflight tests**; `npm run test:pg` passed **9 regression tests**. Total: **175 passing tests**. `git diff --check` and unchanged-001/002 comparisons passed. Toolchain verified: Node 24.12.0, npm 11.6.2, PostgreSQL 17.11 (Homebrew). Node's existing experimental SQLite warning remains.

**F3 closed:** HQ separately reran the original repository-level failure on actual PostgreSQL, not merely the new test cases. A valid uppercase refresh UUID now returns reauthentication on identical retries before and after successor activation. Upper/lower/mixed spellings and reuse on the successor preserve the active family; uppercase activation IDs return canonical identity. A genuinely distinct replay still revokes the affected family while another family for the same account remains active. The probe created one invented account with two families and retained them without printing credentials.

The final suite also reran the accepted F1 exact-expiry/security-precedence and F2 cleanup-preflight regressions. HQ started only the initially stopped, ownership-marked auth-test cluster (`fitquest_m1c3_auth_test`, Unix socket port 55440) and M1b regression cluster (`fitquest_m1b_synthetic_test`, port 55439), using migration/seed-free guards. Both were stopped afterward, with all files retained. No retained M1b development data, provider, hosted service, simulator or device was used or changed.

HQ additionally loaded the compiled default app and used in-process HTTP injection: health returned 200; profile, identity and Apple challenge routes returned 404. This independently establishes compiled loading/default-route exclusion, not a listening-server or provider test. The process-restart preservation and listening-server observations in Engineering's report remain attributed historical evidence, not repeated by HQ today.

Accept session issuance/activation/rotation/revocation, private-transaction guards and this guarded test workflow within the stated local scope. This is not real Apple sign-in, production authentication, native integration or release acceptance. The next scoped work is provider verification before API integration; D-019 still requires fresh owner approval before any product AI implementation.

The review history below is retained for traceability; its withheld statuses are superseded by this final acceptance.

## Correction review — F1/F2 closed, F3 open

Engineering delivered correction turn `01a0de90-1b5c-79b1-acf5-2cb7eb9d03ae`. HQ reviewed the separated expiry/security checks, exact-deadline and precedence tests, test-only coordinator mapping, and shared read-only database preflight and direct-suite wiring. Fresh checks independently passed: **138 default tests, 21 auth PostgreSQL tests, 4 pure preflight tests, 9 M1b PostgreSQL tests**, typechecks, lint and builds (172 tests total). The suites used only their verified task-marked synthetic databases. No new migration was applied in this correction.

**F1 closed:** HQ reran the original real-repository probe at exact absolute expiry. Identity and activation now return `expired`; refresh returns `reauth_required`. Private access remains denied. Tests cover retained active/null-revoked state, fresh same-account outcome recovery, genuine revocation/security-invalidation precedence, and an injected transport mapping that does not invoke the independent local latch. This is not native or HTTP integration proof.

**F2 closed within the guarded workflow:** direct auth tests now call the full read-only verify command before initial connections and each cleanup. The script and negative tests share marker/target/schema/checksum validation. Changed checksum, extra migration, wrong target/marker and unknown schema/table prevent a cleanup callback. HQ independently ran those regressions and inspected the actual pre-cleanup call site; no real target corruption was introduced for verification.

Both clusters were initially stopped, started by HQ through migration-free verified guards, and stopped again after checks with files retained. Two additional invented probe accounts/sessions were retained in the auth-test database; no tokens were printed. Despite the passing suite, the second actual PostgreSQL probe reproduced F3 below. M1c.3 remains unaccepted and uncommitted; M1c.4 is not authorized.

## F3 — Valid uppercase refresh-operation UUID causes false replay revocation

**P1; blocks acceptance.** [authSessions.ts](../../rebuild/services/api/src/authSessions.ts), `refresh()`: the operation validator permits uppercase UUIDs, PostgreSQL stores/returns a canonical lowercase UUID, and the consumed-operation comparison uses raw JavaScript string equality.

HQ reproduction: validate `ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF` with the existing `RefreshRequestSchema`; issue/activate an invented session; rotate using that operation ID and activate the successor; retry the old token with the **exact same uppercase operation string**. First call returns credentials, but the identical retry returns **revoked**, and the new active bearer also reports revoked. The consumed token and operation are the same logical identity, not a different-operation replay. This violates the accepted no-secret-replay/same-operation recovery rule and can incorrectly lock local access.

Required: normalize validated auth operation identifiers consistently before persistence/comparison, or compare UUID identity through an equivalent safe mechanism. Do not alter historical domain command serialization/hashes, weaken genuine different-operation replay detection, or reject previously valid wire UUID spelling as a workaround. Keep consumed-operation uniqueness and comparisons consistent across generations. Add real PostgreSQL regressions for identical uppercase retries before and after successor activation, equivalent upper/lower spellings, and concurrent equivalent-spelling requests; genuine distinct operation IDs must still revoke only the matching family. Check adjacent auth UUID comparisons for the same representation issue without expanding scope into a broad contracts rewrite.

Rerun all default/guarded PostgreSQL/preflight checks and the failing source-driven scenario, update the report, and stop for HQ acceptance. Engineering owns only this scoped `rebuild/` correction; no Git/shared-doc edits, M1c.4, migrations unless separately justified, provider/HTTP/App/native changes, hosted work or AI implementation. D-019 remains in force.

## Historical first review — F1/F2 superseded above

## Delivery and independent verification

Engineering delivered turn `01a0de77-f2d2-7fe1-a098-a78256f06ca8` against [M1c.3](../ENGINEERING_M1C3_HANDOFF.md). HQ reviewed the internal session repository, shared domain repository changes, migrations 003/004, guarded setup/start scripts, new integration tests and [report](../../rebuild/docs/M1C3_REPORT.md). Migrations 001/002 remain unchanged. No mobile, provider, hosted or AI implementation is included; no auth HTTP routes were added.

HQ independently reran `npm run check`: **137 tests**, typechecks, lint and builds passed. After verifying both task clusters were stopped and inspecting the startup guards, HQ started them without migrations/seeds. Socket/shared-memory sandbox restrictions required tool-approved execution outside the sandbox; the failed restricted attempts are not application failures. Fresh **18 auth PostgreSQL tests** and **9 retained M1b PostgreSQL tests** passed. `git diff --check -- rebuild` passed. HQ also ran the actual-session expiry probe below, which exposed F1 despite those passing tests.

Targets were exclusively the marked Unix-socket `fitquest_m1c3_auth_test` on port 55440 and the designated `fitquest_m1b_synthetic_test` on port 55439. Their suites clear only the previously authorized synthetic test tables. HQ's extra expiry probe created one invented session/account in the auth-test database without printing credentials; that synthetic record is retained. Both clusters started by HQ were stopped after review with all files retained. No migrations or retained M1b development-data changes were performed by HQ. Compiled default-API 200/404 checks and process-restart counts remain Engineering-reported; HQ did not repeat those observations in this review.

## F1 — Absolute session expiry is incorrectly reported as confirmed revocation

**P1; blocks acceptance.** [authSessions.ts](../../rebuild/services/api/src/authSessions.ts): `accountCurrent()` combines account state/epoch with the absolute expiry check. `activate()`, `refresh()` and `identity()` map every false result to `kind: 'revoked'`.

HQ reproduction using the real repository/runtime roles and marked PostgreSQL target: issue and activate an invented session; advance only the injected server clock to its exact `sessionExpiresAt`; call identity, activation and refresh. All three return **revoked**, while the stored family remains **active with no revocation timestamp**. No logout, token misuse, account disablement or epoch invalidation occurred. The existing expiry test explicitly expects the incorrect revoked result at 91 days.

This contradicts D-012 and the handoff requirement to distinguish ordinary expiry from confirmed revocation. The accepted mobile coordinator intentionally locks independently valid local authorization on a confirmed bound-family revocation. Though no HTTP/mobile adapter is wired yet, carrying this result forward would incorrectly lock local records merely because the session aged out.

Required: separate absolute/access/refresh expiration from actual revocation and account-security invalidation. Return a coherent expiry/reauthentication result using the existing result contracts; private operations must still reject expired credentials. Preserve true revocation behavior for logout/reuse and explicitly defined status/epoch invalidation, and define precedence when both expiration and real revocation exist. Do not extend the absolute lifetime, erase records, or weaken access checks. Update the regression asserting revoked on ordinary expiration; test just before/at/after relevant deadlines, unchanged family/revocation state and fresh same-account recovery. Demonstrate that the expiry result can be mapped to the existing coordinator without invoking its local lock, using injected test transport only—no actual auth HTTP or App wiring.

## F2 — Auth integration cleanup does not validate migration checksums

**P2; blocks acceptance of the guarded test workflow.** [auth-postgres.integration.test.ts](../../rebuild/services/api/src/auth-postgres.integration.test.ts) checks the filesystem marker, database/data-directory/socket marker and only `SELECT version FROM m1b.migrations`. If the versions are `[1,2,3,4]`, its next `beforeEach` performs broad test-table `TRUNCATE`. The direct `npm run test:pg:auth` command does not run the stronger script preflight. A changed ledger checksum or unexpected schema/table set is therefore accepted by that direct cleanup path even though the standalone setup/start guard would refuse it.

The current verified target was valid when HQ ran the suite; this is a source-established guard gap, not a claim that those tests ran against an unknown database. The handoff requires exact target/marker/ledger verification before **test cleanup**, not only before setup.

Required: make the integration suite perform the same non-mutating target/schema/ledger checksum validation before it can truncate, preferably through a shared read-only preflight rather than duplicated drifting logic. Keep test setup explicit and reject redirection/unknown or changed ledgers without migration, reset or destructive repair. Add negative guard regressions proving a mismatched checksum, unknown ledger entry and wrong target/marker cannot reach cleanup. Use disposable/injected preflight tests as appropriate; do not tamper with the retained M1b development database or reset a cluster to test the guard. Preserve the existing nine-test fixture workflow.

## Correction boundaries

Engineering remains the sole `rebuild/` writer. Correct only these session-result and auth-test guard issues, add focused regressions and update the report; preserve existing migrations already applied, using additive migrations only if genuinely necessary. HQ owns shared docs and Git integration. Rerun the full baseline, both PostgreSQL suites and diff checks, with exact target/process and verification limits. Stop for HQ review; no M1c.4, provider/Apple credentials or calls, auth HTTP/App/native changes, dependency upgrades, Git writes, hosted changes, remote migrations or deployment.

**D-019 remains mandatory:** no product AI code, SDK/scaffolding, prompts, generation, embeddings/agents or AI evaluation implementation/calls before HQ explains the plan/data/privacy/model/cost/safety and obtains fresh explicit owner approval.
