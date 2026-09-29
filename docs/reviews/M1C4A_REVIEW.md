# FitQuest — M1c.4a HQ Acceptance Review

Date: 2026-09-29 · Status: **Accepted for unused server-module/offline-test scope. No blocking findings.**

## Delivery and independent evidence

Engineering completed turn `01a0ef3e-7608-7300-aa84-6e353b8c84a4` against the [M1c.4a handoff](../ENGINEERING_M1C4A_HANDOFF.md). HQ read the complete verifier, generated-key tests, compiled-check script, dependency/lockfile diff and [report](../../rebuild/docs/M1C4A_REPORT.md). The only dependency addition is exact `jose` 6.2.12, with no transitive dependencies; existing module settings remain unchanged. Comparison against checkpoint `371b75d` confirms session/repository/API entrypoints, migrations, shared contracts and mobile sources are unchanged.

Fresh HQ checks passed:

- `npm run check`: **211 tests** (75 API including 73 verifier cases, 12 contracts, 124 mobile), TypeScript checks, lint and contract/API builds.
- `node scripts/m1c4a-compiled-check.mjs`: native Node loads the emitted CommonJS verifier and JOSE ESM; generated-token checks pass, unexpected outbound fetches are blocked, and default health returns 200 while all checked private/auth routes remain 404.
- `npm run test:pg:auth`: **24 PostgreSQL + 4 preflight tests**; `npm run test:pg`: **9 PostgreSQL tests**. Total: **248 automated tests**, plus compiled and HQ probe evidence.
- `git diff --check` and the unchanged integration-boundary comparison pass. Runtime verified by execution: Node 24.12.0. The existing experimental SQLite warning remains.

HQ additionally exercised the compiled **runtime factory**, independently of the provided `ForTest` tests, with an intercepted fetch returning generated public keys. Construction remained lazy, requests used only the fixed Apple key URL with manual redirects, valid tokens returned only the minimal identity, and wrong nonce/audience/expiry and token-supplied key URLs were denied. Matching calls reused the key cache; a separate resolver receiving a redirect returned sanitized key unavailability. No token/private key was printed or saved, and no provider network request occurred.

Both synthetic PostgreSQL clusters were initially stopped. HQ started them through their existing migration/seed-free guards, ran only the designated `fitquest_m1c3_auth_test` (Unix port 55440) and `fitquest_m1b_synthetic_test` (55439) suites, then stopped both with files/data retained. Existing preflight checks preceded suite cleanup. No migration, retained M1b development-data change, native/device or hosted action occurred.

## Acceptance rationale and limits

The module verifies real generated signatures through JOSE rather than trusting decoded claims. Trust endpoints/issuer/algorithm are fixed; the audience and nonce are server-supplied inputs. Required claims, exact audience, case-sensitive nonce, bounded time policy and completion-time expiry recheck fail closed. Result/diagnostic handling does not leak raw JWTs or provider exceptions. JWKS tests exercise the library's cache, rotation, cooldown, concurrency and abort behavior. Unavailability is not classified as FitQuest revocation. No account/session authority or public route consumes this module yet.

HQ independently retrieved Apple's public documentation feeds for [verification](https://developer.apple.com/tutorials/data/documentation/signinwithapple/verifying-a-user.json), [key fields](https://developer.apple.com/tutorials/data/documentation/signinwithapplerestapi/jwkset/keys-data.dictionary.json) and [claims](https://developer.apple.com/tutorials/data/documentation/signinwithapplejs/authorizationi/id_token.json) after the web reader could not render them. The reported signature-wording discrepancy is real: the verification text says “JWS E256,” while key-field documentation specifies RSA. Preserve the approved strict RS256 policy for this offline slice; neither that discrepancy nor generated-key tests prove current live Apple compatibility. Do not broaden algorithms to hide the inconsistency. Actual key/token compatibility remains an explicit provider gate, not an acceptance claim here.

The [JOSE 6.2.12 README](https://github.com/panva/jose/blob/v6.2.12/README.md) and installed README document CommonJS compatibility covering the declared Node 22.13.0 floor. HQ exercised only Node 24.12.0; a floor-runtime run remains unverified. The library's installed resolver implementation corroborates fixed-URL/manual-redirect fetches, abort signal, cache age and cooldown; real network/body behavior was not tested. Cached keys can remain accepted until cache refresh, so this does not prove instantaneous provider-key revocation detection. Later API rate limiting is still required.

Engineering's fresh dependency audit reports ten moderate, zero high/critical entries in the existing Expo/uuid chain and no JOSE entry. HQ inspected the bounded dependency diff but did not rerun that audit; compatible remediation and release auditing remain open. No comprehensive security audit or live sign-in, phone, hosted or production readiness is claimed.

## Next gate

Engineering's M1c.4a assignment is complete. HQ may checkpoint this accepted work under D-016. The next task is a separately scoped challenge/exchange integration slice: trusted client configuration, exclusive fenced attempt claims, provider exchange outside database locks, independently verified token agreement, atomic still-valid account/session finalization, sanitized errors, rate limits and fixture exclusion. It has not been dispatched by this acceptance. Existing synthetic issuance must not become Apple authority through a cast or fixture fallback. Native/UI and real Apple/device/hosted setup remain later gates.

**D-019 is unchanged:** stop and obtain fresh owner approval before any product AI implementation, including scaffolding, prompts or evaluation code/calls.
