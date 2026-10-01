# M1c.4b — Transactional simulated sign-in exchange

Initial delivery: 2026-09-29. Updated: 2026-10-01. Status: **F1 correction implemented and locally verified; awaiting independent HQ re-review/acceptance.**

Assignment: `docs/ENGINEERING_M1C4B_HANDOFF.md`, D-023 and the accepted M1c Architecture proposal/review. Clean starting HEAD: `c7984158fffca2651e0ba9820b652c6364cb689a`; accepted verifier implementation: `959f74032f3028a616c43bc732b0dbd98154b074`. Required project/context/design/handoff documents and relevant prior reviews were read before implementation.

## F1 correction — 2026-10-01

The owner authorized this bounded correction through HQ under D-024. [HQ review F1](../../docs/reviews/M1C4B_REVIEW.md) found that fresh disabled-account sign-in returned `SESSION_REVOKED` despite having no FitQuest credential/family binding. The original 294 passing tests included an expectation endorsing that error. This was a contract defect; no mobile lockout was observed or claimed.

Migration `007_preauthentication_denial.sql` replaces only `claim_exchange()`'s disabled-account result with **`AUTH_INVALID`**, before attempt insertion. Its original signature/body/control flow are retained apart from that code and an explicit `STRICT` declaration preserving migration 006. There is no TypeScript remapping, new shared code, changed session logic, new grant or lock-order change. `simulatedAppleSignIn.ts`, `authSessions.ts` and `repository.ts` are unchanged from the pre-correction delivery.

`CREATE OR REPLACE FUNCTION` preserves the existing helper's identity, ownership and permissions; strictness, security-definer mode and fixed search path are restated explicitly. The official PostgreSQL guidance was checked and actual helper metadata compared across upgrade. [PostgreSQL 17 CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html).

Correction evidence:

- The replaced disabled-race expectation now requires `AUTH_INVALID`. A new generated-token/real-PG regression creates active A and B, disables B, then submits a fresh B challenge without a FitQuest bearer: `AUTH_INVALID`, **zero additional provider dispatch, no attempt row, and unchanged account/mapping/family/generation/capability counts**. A's existing access still authorizes identity/profile/outcome reads. Requests bearing B's known credentials still return bound revocation; explicit A-family logout still revokes correctly. Existing disable/epoch races remain covered.
- The native Node compiled probe independently repeats disabled-B denial with no new claim/issuance and usable active A access. Both compiled probes reject unexpected outbound calls; zero occurred.
- Exact-target validation now requires migrations 001–007 for start/verify/tests. A new negative guard rejects the old six-entry ledger for cleanup and rejects a changed 007 checksum, while accepting that verified prefix for guarded upgrade.
- Before any integration-suite cleanup, the original six-migration target was started/verified with its existing guard and snapshotted using row hashes only. Guarded setup applied 007; all **40 retained synthetic/metadata rows outside the migration ledger** matched byte-content hashes and counts. Ledger entries 001–006 were unchanged and 007 was appended. All six helpers' OIDs, owners, ACLs, strictness, security mode, language, volatility, parallel mode and search-path settings were unchanged. A subsequent guarded setup preserved the same records and metadata again. No reset, reinitialization or seeding was used.
- Migration files 001–006 and HQ's shared documents remain byte-for-byte identical to the correction-start snapshot. Existing M1c.3/M1b guards were unchanged and used for regressions only.

The required commands passed with **296 automated tests** (211 default, 40 exchange, 8 exchange-preflight, 24 existing auth, 4 existing auth-preflight, 9 existing synchronization), plus both compiled probes and guarded upgrade/idempotency checks. All three task-started clusters were stopped with files/data retained. D-019 and the original provider/native/hosted/Node-floor limitations are unchanged. Stop here for independent HQ re-review; no new milestone or cross-chat message was started.

## Delivered scope

- `services/api/src/simulatedAppleSignIn.ts`: persisted challenge creation, real JOSE verification through the unchanged M1c.4a verifier, exclusive committed claim, injected simulated code exchange, independent returned-token verification, and fenced atomic pending issuance.
- `authSessions.ts`: factored `issuePendingInTransaction()`; the caller supplies one checked-out transaction and retains its commit/rollback responsibility. Existing synthetic `issue()` still resolves only its original identity namespace and uses this primitive. Issuance deadlines are sampled after the account guard.
- `repository.ts`: bound sessions carry an explicit trusted test environment. The original fixture facade and default M1c.3 session environment remain intact. Domain serialization, hashes, receipts, outcomes, queries and mobile files were not rewritten.
- Additive migrations `005_simulated_exchange.sql`, `006_exchange_argument_guards.sql` and F1 correction `007_preauthentication_denial.sql`, new exact-target setup/preflight scripts, a separate PostgreSQL test command and a native Node compiled probe.

No new dependency, public route, default-server wiring, live provider transport/credential, native/mobile/UI change, hosted migration, deployment or Git write. No cross-chat messages. HQ owns shared `docs/`; this report supplies the handoff evidence instead of editing shared `docs/HANDOFF.md`. D-019 remains a hard stop before any product AI implementation or calls.

## Challenge, identity and timing

The sole constructor is an explicit internal offline test factory. It builds the accepted real verifier with a supplied offline fetch seam and requires a supplied simulated exchange port. Neither API entrypoint imports it. Configuration is copied/frozen: exact native client ID, one of two explicitly synthetic environments, clock tolerance and bounded durations. There is no request-selected account, environment, issuer or audience and no environment-variable fallback.

Each challenge has a server UUID and independent 32-byte random nonce/state. The existing strict wire schemas bound payloads. UUIDs canonicalize to lowercase; state, nonce and provider subject remain case-sensitive. Defaults: challenge five minutes, attempt thirty seconds capped by challenge expiry, provider response ten seconds capped by remaining attempt time. Smaller positive test durations are permitted; these are engineering defaults, not production policy.

Stored challenge metadata: ID, trusted environment/client, nonce, SHA-256 state digest and server timestamps. The nonce must be recoverable for both token checks; only narrow pre-auth helpers can return it, and neither pre-auth table has a direct runtime table grant or RLS policy. Raw state is returned once and is not stored. No challenge values are logged.

The request digest is SHA-256 of a JSON tuple containing canonical challenge UUID, exact state, native token and authorization code. Tuple encoding prevents delimiter ambiguity. Only the digest persists. Provider identity comes exclusively from cryptographic verification; the mapping digest includes environment, verified provider, fixed issuer and opaque subject. Mapping rows use a separate `apple_simulated` namespace, never fixture identity, email or native user/name fields. Separate environments and case-distinct subjects resolve separate accounts; concurrent first sign-ins for the same subject/environment resolve one account.

Native and returned tokens are independently signature/issuer/audience/nonce/time verified. Their issuer/subject/audience must agree. The simulated response must have exactly one field, `identityToken`; missing, substituted or additional fields are rejected. In particular, a real response containing access/refresh credentials is **rejected**, not silently discarded. The protected real provider credential lifecycle belongs to the next adapter slice.

After successful signature verification of each exact immutable token string, orchestration copies only its `exp`/`iat`/optional `nbf` metadata for later time checks. This decode grants no identity authority. The trusted verifier tolerance is applied to those JWT times; it never extends strict challenge/attempt deadlines. Time is resampled after native verification, claim lock waits, claim commit, account/attempt lock waits and immediately before finalization commit. No JWKS work occurs inside a database transaction.

## State transitions and failure behavior

There is one permanent attempt row per challenge (primary key on challenge ID), with a server-generated fence UUID, request digest, verified subject digest, captured account coordinate/epoch, claim time and deadline. Completion is represented by that uniquely bound attempt's `completed` status and family ID; there is no separate mutable challenge-consumed flag or response cache.

| State/event | Internal result and permitted effects |
|---|---|
| Malformed request | `AUTH_BAD_REQUEST`; no exchange |
| Missing/wrong binding/state, invalid token/pair | `AUTH_INVALID`; no issuance |
| Challenge expired before claim | `AUTH_REAUTH_REQUIRED`; no exchange |
| Fresh disabled-account denial | `AUTH_INVALID`; no attempt claim, dispatch or issuance; no unrelated session is revoked |
| Native key outage | `AUTH_PROVIDER_UNAVAILABLE`; no claim/dispatch |
| Claim transaction rollback | No persisted attempt/account; a later valid request can claim |
| Valid claim committed | `claimed`; only its winning fence can dispatch/finalize |
| Same digest while claimed and within deadline | `AUTH_EXCHANGE_IN_PROGRESS`; no second dispatch |
| Different digest on an existing unexpired challenge | `AUTH_CHALLENGE_REUSED`; no replacement |
| Crash immediately after committed claim | Claim remains spent; same request is in progress until deadline, then requires fresh authorization |
| Provider rejection, timeout or lost external response | `AUTH_PROVIDER_UNAVAILABLE`; attempt becomes `failed` when its failure write succeeds; no automatic retry |
| Malformed/invalid returned token or returned-key outage | Sanitized invalid/provider-unavailable result; claim remains spent |
| Late result, lost fence, token expiry or changed authorization | `AUTH_REAUTH_REQUIRED`; no late issuance |
| Finalization rollback after successful exchange | Account/mapping/family/generation/capability/completion all roll back; attempt is failed/spent; fresh authorization required, never re-exchange that code |
| Finalization commit | `completed`; one pending bundle returned once |
| Commit followed by response loss | Completed family remains; retry returns `AUTH_REAUTH_REQUIRED`, never secrets or another family |
| Fresh challenge after success/loss | May resolve the same account and create a separate pending family |

Provider timeout is uncertainty, not confirmed revocation. Fresh disabled-account denial returns `AUTH_INVALID` because it identifies no known FitQuest family. `SESSION_REVOKED` remains reserved for correctly bound credential/family revocation; the shared session implementation is unchanged. A captured account status/epoch invalidation during external work cannot be undone by late completion. Fresh authorization can issue at the account's new active epoch; disabled accounts cannot dispatch.

Provider dispatch is raced against a bounded timer and abort signal. An injected port ignoring abort may complete later, but its result cannot enter finalization after the race ends. No retry/reclaim path exists. All returned errors contain fixed existing auth codes, without provider/database exception text. Public HTTP error envelopes, request IDs, rate limits and retryability mapping are deliberately left to the later route slice.

## Transactions, locks and privileges

1. Native verification: read challenge with a short autocommit query; release its pooled client; perform JWKS/signature work.
2. Claim transaction: identity-resolution advisory guard → non-locking account snapshot → challenge row → attempt row/insert → commit/release. The snapshot coordinate intentionally has no account FK: a claim must not obtain an account key-share lock after the challenge lock. No account/mapping/session is created here.
3. External exchange and returned-token verification: **no checked-out database client, transaction or database lock**.
4. Finalization: non-locking fenced read → same identity advisory guard → resolve/create mapping and account → account `FOR UPDATE` → insert pending family/generation/capability → challenge/attempt completion locks → final strict time check → one commit. It never calls self-committing `issue()`.

The advisory guard uses the established identity-key hashing/seed convention, with the new provider namespace. Snapshot status/epoch and optional account coordinate are revalidated under the account guard. A previously absent identity expects epoch 1, so another first sign-in followed by invalidation cannot authorize an older exchange. A losing finalizer may tentatively insert rows inside its transaction, but fence failure rolls all of them back. This preserves account → session → attempt → aggregate ordering; completion's account/family checks reuse rows already guarded by the caller.

`fitquest_m1c4b_preauth` can execute only create/read/claim/fail helpers; it cannot read athlete, mapping, credential or challenge tables. `fitquest_m1c4b_lookup` has only the existing digest-to-candidate helpers plus marker read, never athlete table authority. `fitquest_m1c4b_api` has owner-qualified domain/session privileges and only bound-attempt resolution/completion helpers, not arbitrary synthetic identity resolution, account status/epoch updates or direct attempt-table writes. No runtime role owns tables, is superuser, inherits memberships or bypasses RLS.

All new helpers are security definer with fixed `pg_catalog, m1b` search path, explicit named-role grants and public execute revoked. Migration 006 makes all six helpers strict, so null state/client/time/fence arguments produce no authority or side effects. This was added forward after final review identified SQL three-valued comparison behavior; the already-applied migration 005 was not rewritten.

Forced RLS remains enabled on domain, identity, session and new pre-auth tables. New domain/session policies require transaction-local owner context and a corresponding permitted test environment. Added restrictive policies also prevent old fixture/auth roles from selecting new environment records in this target. Session methods retain the active status/epoch/generation/deadline checks. Pooled transaction-local owner context resets on commit/rollback. Pending bundles remain limited to activation/revocation; every private repository method rejects pending credentials.

## Exact local target and migrations

New target only:

- Directory: `rebuild/private-test-artifacts/m1c4b-pg/` (ignored).
- Unix socket: its `socket/` directory; port `55441`; TCP listeners disabled.
- Database: `fitquest_m1c4b_exchange_test`.
- Explicit environments: `m1c4b.synthetic.test.v1`, `m1c4b.synthetic.other.v1`.
- Filesystem/database ownership markers are task-specific. No copied A/B seeds or credentials.

Before creation, the directory was absent and scoped port/process/socket checks found no conflict. The script also checks port/process conflicts on creation/start. It rejects `DATABASE_URL`, non-owned/symlinked/redirected/missing paths, changed markers, alternate socket/listeners/database/data directory, unknown databases/schemas/tables, unsafe runtime roles/ownership/RLS and unknown/changed migration ledger entries. Existing evidence is validated before bootstrap mutation. Missing marked data is never reinitialized. Setup can resume a valid known migration prefix and is idempotent; start/verify and test preflight require the entire seven-entry ledger.

`m1c4b-preflight.mjs` supplies shared read-only validation to both the lifecycle script and the integration suite. The suite calls it directly on the actual admin cleanup connection before **every** table cleanup. Pure negative guards and real transactional marker/ledger/schema mutations show the cleanup callback cannot run on failed evidence; those test mutations are rolled back.

Migrations 001–004 match starting HEAD byte-for-byte; 005/006 match the pre-F1 delivery byte-for-byte. The new target was originally bootstrapped through 006, then upgraded additively through 007 without changing retained rows. Old M1c.3 and M1b targets retained their four/two-entry ledgers and were started only through their accepted migration-free guards for existing regression suites. No old development database or fixture authority file was edited.

Commands from `rebuild/`:

```sh
npm run m1c4b:db:setup
npm run m1c4b:db:start
npm run m1c4b:db:verify
npm run test:pg:exchange
node scripts/m1c4b-compiled-check.mjs
npm run m1c4b:db:stop
```

## Verification

Observed toolchain: Node **24.12.0**, npm **11.6.2**, PostgreSQL **17.11** (Homebrew), TypeScript **5.9.3**, Vitest **5.0.1**, JOSE **6.2.12**, node-postgres **8.21.0**. No dependencies were added or upgraded. Node 22.13.0 remains the declared floor but was **not executed**.

| Check | Result |
|---|---|
| `npm run check` | Pass: all workspace typechecks/lint, 211 default tests (75 API, 12 contracts, 124 mobile), contract/API builds |
| Final typechecks/lint/builds | Pass through the required full `npm run check` after the F1 test correction |
| `npm run test:pg:auth` | Pass: 24 existing auth PG tests + 4 existing preflight tests |
| `npm run test:pg` | Pass: 9 existing M1b PG tests |
| `npm run test:pg:exchange` | Pass: **40** exchange PG tests + **8** exchange-preflight tests |
| `node scripts/m1c4a-compiled-check.mjs` | Pass: accepted emitted verifier and health-only default API; zero outbound calls |
| `node scripts/m1c4b-compiled-check.mjs` | Pass on final seven-migration target: native Node CommonJS/JOSE loading, actual PG issuance, pending denial, activation/identity, private command, refresh/logout and fresh-sign-in outcome recovery and disabled-B/active-A denial regression; zero outbound calls |
| Guarded 006→007 upgrade + repeated setup | Pass before any test cleanup: all **40** retained rows outside the ledger preserved, ledger prefix unchanged, six helpers' metadata unchanged |
| Scoped diff/immutable migration checks | Pass: `git diff --check`; all Engineering changes under scoped `rebuild/`; pre-existing HQ document edits preserved; 001–006 unchanged against pre-F1 delivery; no lockfile/mobile/default-entrypoint/shared-doc change |

Total: **296 passing tests**, plus the two compiled probes and setup preservation check. Default checks neither initialize a database nor contact a provider. No iOS visual run was needed for this internal API/database-only slice; existing native/device limitations remain.

The new suite uses generated real RS256 signatures/JWKS, explicit fake transports and an unexpected-network rejection counter (zero attempts). Coverage includes zero-dispatch malformed/state/nonce/client/expired cases; independently substituted returned issuer/subject/audience/nonce/signature/token; native/returned key outages and gated JWKS waits; timeout/lost response/ignored abort; identical/conflicting concurrent requests; claim rollback/crash; finalization rollback/commit-response loss; spent/late attempts; capped deadlines; real separate-connection lock waits before claim and after account/attempt acquisition; both signed tokens' time windows; same-subject first-sign-in concurrency; subject/environment separation; fresh disabled-B denial with unaffected active A, account disable/epoch races and fresh epoch recovery; every pending private method; activation/refresh/logout/outcome recovery; pre-auth/lookup denial, helper grants/search path/strictness and owner-context reset.

External wait tests assert all runtime/pre-auth pool clients are idle and `pg_stat_activity` has no role-owned transaction. Success/failure tests assert provider counts, no replayed bundle, at most one family per challenge and no orphan identity/account/session rows. Storage assertions cover challenges, attempts, mappings, families, generations and revocation capabilities. Provider exceptions containing invented raw code/JWT values still return only fixed codes. The PostgreSQL log is checked against generated code/JWT/nonce/state/FitQuest secret values; no matches. The module contains no diagnostic logger or secret response cache. Reports contain no raw generated secrets.

## Final process state and limits

The new exchange cluster, retained auth regression cluster and retained M1b regression cluster were all stopped through their verified task-specific guards. Files/data were retained. No API/Metro/simulator process was started by this slice.

This is internal **simulated** sign-in orchestration, not working Apple sign-in or a production auth service. Live Apple key/algorithm/token compatibility, credentials/client-secret signing, provider credential retention/standing checks, public route mapping, abuse controls, cleanup/retention policy, operational clocks/timeouts, hosted deployment, native storage/phone/signing and Node-floor execution remain open. The prior Apple signature-documentation discrepancy remains unresolved; strict accepted RS256 behavior was preserved without live key/token calls. Optional test phase hooks intentionally permit deterministic transaction barriers and are not wired into a running server.

## Sources and recommended next task

The implementation follows the binding local Architecture proposal/review and current task handoff. External guidance is supporting context, not implementation proof:

- Apple's code-validation documentation states that codes are single-use with a five-minute validity period and describes identity/access/refresh token responses. Its normal page is JavaScript-only in the web reader; the official DocC JSON was read successfully for these claims. [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens), [official DocC content](https://developer.apple.com/tutorials/data/documentation/signinwithapplerestapi/generate-and-validate-tokens.json).
- PostgreSQL 17 documents row/advisory locking and consistent lock ordering. The PostgreSQL skill's short-transaction/least-privilege guidance informed review. Actual behavior is proved by the tests above. [PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).
- node-postgres requires one checked-out client for a transaction. Both claim and finalization use that pattern with guarded rollback/release. [node-postgres transactions](https://node-postgres.com/features/transactions).

**Next: independent HQ F1 re-review and acceptance of M1c.4b**, including target guard, privilege/lock review and reproduction of the new PG/native Node probes. After acceptance, a separately scoped next engineering handoff should define the fixed-endpoint real code-exchange adapter/client-secret signing and protected provider credential lifecycle; real credentials/configuration or provider calls still require explicit authorization. Public route/rate-limit and native/device integration remain later work. No next increment has been started.
