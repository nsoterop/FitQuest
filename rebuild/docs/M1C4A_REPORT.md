# M1c.4a Engineering report — unused Apple identity-token verifier

Date: 2026-09-29. Starting checkout: `371b75d3d282b1f4e3f3d222e3bef12c7e39cb54`, with accepted M1c.3 implementation `f2b97feef47ba45b04633848d2a688f9dd7c532f`. The checkout was clean before edits. Scope follows the [HQ handoff](../../docs/ENGINEERING_M1C4A_HANDOFF.md); acceptance remains with HQ.

## Delivered boundary

- [appleIdentityVerifier.ts](../services/api/src/appleIdentityVerifier.ts) is an unused server module. Its runtime factory requires an exact native client ID from trusted server configuration and has no configured audience default. Verification requires the nonce from a stored server challenge. Neither token claims nor headers can select issuer, audience, algorithms or key URL. Import and construction do no provider I/O.
- The trust constants are Apple's issuer and HTTPS public-key endpoint. The sole algorithm is RS256. JWTs must be bounded compact strings (maximum 16,384 characters, matching the existing exchange contract); a bounded string `kid` is required. Token-supplied `jku`, `x5u`, embedded `jwk`/`x5c`, and unsupported critical/encoding extensions are rejected before key fetch. Signature verification and standard claim checks use JOSE, not custom cryptography or decoded claims as authority.
- Required claims are issuer, exact string audience, nonempty bounded subject, expiration, issued-at and matching nonce. Subject and nonce preserve their original case and spelling. Email/name/native-user fields do not establish identity and are omitted from the result. Numeric time claims must be nonnegative safe integer seconds; expiration must follow issued-at, and an optional not-before must precede expiration. Native audience arrays are rejected rather than broadening the exact audience.
- The only successful result is a minimal internal tuple containing provider, issuer, subject and audience. Failures return `invalid` or `keys_unavailable`; there are no raw claim bags, tokens, nonce, account IDs, bearer bundles, raw exceptions or logging calls. Invalid/unverifiable signatures, claims and nonunique/no matching keys produce `invalid`. Fetch/timeout/HTTP/malformed-set and resolver import failures produce `keys_unavailable`; an unusable key rejected later by JOSE's signature engine remains `invalid`. Neither result indicates FitQuest family revocation.
- The named `ForTest` factory injects time and a response transport explicitly. It still uses JOSE's real remote JWKS resolver, key selection, public-key import, signature verification and cache. There is no environment-selected test resolver, supplied runtime trust-root URL, seeded cache or fallback key set. The runtime factory uses the system clock and normal fetch.

`authSessions.ts`, its synthetic-only issuance input, provider mapping, repository, contracts, migrations, API entrypoints and mobile sources were not changed. A verified token does not establish a completed code exchange, consumed challenge or FitQuest sign-in. No token-pair comparison helper was needed in this slice.

## Timing and JWKS policy

The approved engineering defaults are preserved: JWT tolerance **60 seconds**, JWKS timeout **5 seconds**, missing-key refresh cooldown **30 seconds**, and cache maximum age **one hour**. Trusted configuration can reduce those values; all are finite bounded integers, cache/timeout must be positive, and tolerance/cooldown may be zero. No infinite cache age is accepted.

JOSE verifies expiration using `exp > floor(now / 1000) - tolerance`; expiration at the tolerance boundary fails. The module samples time again after key retrieval/signature verification and rechecks expiration, not-before and issued-at, so a delayed key fetch cannot extend the tolerance window. Not-before and issued-at allow at most the configured future tolerance. These are JWT checks only. The module neither accepts nor extends database challenge, attempt or session deadlines; future integration must enforce those deadlines strictly under its own transaction guard.

Each constructed verifier has one memory cache. JOSE fetches when keys are absent or reach maximum age; an unknown key ID refreshes only after the successful-fetch cooldown. Matching cached keys remain usable during their valid cache window even if the provider has removed them. Removal is observed after a successful cache refresh, not instantaneously. An expired cache cannot authorize a token if refresh fails. Concurrent cache misses/refreshes share one pending fetch in the tested Node runtime. Failed fetches do not update the successful-fetch timestamp; subsequent calls can try again, so later API rate limiting remains necessary.

The selected library supplies `AbortSignal.timeout` and `redirect: 'manual'` to fetch and accepts only HTTP 200 JSON key sets. Redirect responses fail rather than moving trust to another endpoint. The offline timeout transport honors the actual abort signal. No live network timeout/body behavior or Apple uptime was tested.

## Authoritative sources and compatibility

Read on 2026-09-29. Apple's web reader initially exposed a JavaScript shell, so Engineering retrieved the official public documentation JSON feeds through a read-only path; no authentication/key API was called.

- [Apple: Verifying a user](https://developer.apple.com/documentation/signinwithapple/verifying-a-user), read through [its documentation feed](https://developer.apple.com/tutorials/data/documentation/signinwithapple/verifying-a-user.json): signature, nonce, issuer, audience and expiration verification. Its signature wording says **“JWS E256”**, which conflicts with the RSA key direction below. It is not evidence for widening the allowlist.
- [Apple: identity-token claims](https://developer.apple.com/documentation/signinwithapplejs/authorizationi/id_token), read through [the claims feed](https://developer.apple.com/tutorials/data/documentation/signinwithapplejs/authorizationi/id_token.json): issuer/client audience, stable subject, issued-at/expiration and nonce semantics. FitQuest requires nonce unconditionally because its approved challenge flow supplies one; it does not implement Apple's optional-nonce fallback. This is an explicit application policy.
- [Apple: fetch public keys](https://developer.apple.com/documentation/signinwithapplerestapi/fetch-apple%27s-public-key-for-verifying-token-signature), read through [the endpoint documentation feed](https://developer.apple.com/tutorials/data/documentation/signinwithapplerestapi/fetch-apple%27s-public-key-for-verifying-token-signature.json): multiple keys and selection by `kid`. [Apple's key fields](https://developer.apple.com/documentation/signinwithapplerestapi/jwkset/keys-data.dictionary), read through [the fields feed](https://developer.apple.com/tutorials/data/documentation/signinwithapplerestapi/jwkset/keys-data.dictionary.json), specify RSA key type/modulus/exponent. **RS256 remains the approved strict engineering allowlist; this task did not independently establish the current live Apple key algorithm.** The documentation discrepancy and actual provider compatibility remain a later provider gate.
- [JOSE 6.2.12 README](https://github.com/panva/jose/blob/v6.2.12/README.md), [JWT verification](https://github.com/panva/jose/blob/v6.2.12/docs/jwt/verify/functions/jwtVerify.md), and [remote resolver options](https://github.com/panva/jose/blob/v6.2.12/docs/jwks/remote/interfaces/RemoteJWKSetOptions.md), corroborated by the installed release's implementation/types: supported CommonJS `require(esm)` thresholds, claim verification, fetch options, cooldown/cache and selection semantics. The README documents CommonJS loading on Node `^20.19.0 || ^22.12.0 || >=23.0.0`, which includes the rebuild's declared floor `22.13.0`.

Only the API manifest and rebuild lockfile gained exact dependency `jose: 6.2.12`; it has no transitive dependencies. npm metadata and lockfile integrity agree. Existing CommonJS compiler settings and Node engine declaration were retained. Actual runtime verification used **Node 24.12.0 / npm 11.6.2**. Node 22.13.0 was not available/executed; its compatibility has documentation/type evidence, not a floor-runtime test. No broader ESM conversion or toolchain upgrade was performed.

Read-only `npm audit --json` returned its advisory exit code with **10 moderate, 0 high and 0 critical** entries and no JOSE entry. The entries remain the tracked Expo/uuid chain; no automatic fix was applied. This is the npm advisory result at this date, not a full dependency security audit.

## Verification actually run

| Command from `rebuild/` | Result |
| --- | --- |
| `npm run check` | Passed typechecks, ESLint, contract/API builds and **211 default tests**: 75 API (73 new verifier + 2 retained), 12 contracts, 124 mobile |
| `node scripts/m1c4a-compiled-check.mjs` | Passed native Node loading/execution of emitted CommonJS verifier with JOSE ESM; valid signature, wrong nonce, sanitized key failure, memory cache and no outbound calls |
| `npm run test:pg:auth` | **24 PostgreSQL + 4 pure preflight tests passed** through the existing exact-target guards |
| `npm run test:pg` | **9 existing M1b PostgreSQL tests passed** |
| `git diff --check -- rebuild` | Passed |

Total automated tests: **248**; the compiled scenario is additional evidence and not counted as a Vitest test. Node's existing experimental SQLite warning remains. Early development checks exposed and corrected a test key type import and the unusable-RSA-key result expectation. Final source review added the completion-time recheck and two delayed-fetch expiry regressions, then reran the full default check and compiled scenario successfully. Database suites ran after dependency installation; the unused verifier's later time-check refinement did not change their sources or dependency boundary.

The 73 generated-key offline cases cover valid minimal identity; required/configured audience; tamper/different signer; symmetric/alternate/unsigned algorithm rejection; required/malformed/mismatched claims; exact expiry and tolerance boundaries, including expiry during delayed key fetch; future issued-at/not-before; malformed/oversized inputs; key URL/embedded-key manipulation; unknown/ambiguous/missing key IDs; wrong key metadata and empty/malformed sets; cooldown, overlapping rotation, cached removal then refreshed removal, stale refresh failure; first/stale concurrent fetch coalescing; abort timeout; redirect/non-200 failures; and negative diagnostic leakage. All keys are ephemeral and all identities invented. Global fetch is replaced with a rejecting stub in tests; the test transport supplies only generated public keys and never bypasses verification.

The [compiled check script](../scripts/m1c4a-compiled-check.mjs) blocks outbound fetch before importing the verifier. It also loads the compiled default app: health returns 200; profile/identity/sessions/commands and five Apple/activation/refresh/logout routes return 404. No listening server, provider request or configured sign-in is implied.

Both previously stopped clusters were started through the existing migration-free guards, used only for their established synthetic regression suites and stopped afterward with files/data retained:

- Auth: `rebuild/private-test-artifacts/m1c3-pg/data`, its Unix socket directory, port **55440**, database **`fitquest_m1c3_auth_test`**, existing four migration checksums verified before test cleanup.
- M1b: `rebuild/private-test-artifacts/m1b-pg/data`, its Unix socket directory, port **55439**, database **`fitquest_m1b_synthetic_test`**, no startup migrations/seeds or retained development database/authority access.

No setup/reset/manual migrations, real credentials, provider calls, personal records, native/device work or hosted changes occurred. No private signing key was written to disk or committed. Shared documents and Git writes remain with HQ.

## Handoff and next task

Stop for HQ independent M1c.4a acceptance. HQ owns the shared `docs/HANDOFF.md` integration and will retrieve this report; Engineering sent no cross-chat status message.

The smallest next task, after acceptance, is a separately scoped challenge/exchange integration design and implementation: exact trusted client configuration; exclusive fenced challenge claims; external authorization-code exchange outside database locks; independent verification of both tokens and issuer/subject/audience agreement; atomic still-valid finalization with account/session issuance; sanitized HTTP errors, rate limits and fixture exclusion. Real provider credentials/configuration and device/hosted testing require their own authorization/evidence. The Apple signature-documentation discrepancy should remain explicit until provider compatibility can be verified.

**D-019 remains a hard stop before any product AI implementation.** No AI scaffolding, prompts, model/provider calls or evaluations were added. HQ must present the feature/data/privacy/model/cost/safety plan and obtain fresh owner approval before that work.
