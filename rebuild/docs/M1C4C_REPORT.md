# M1c.4c — Offline Apple code transport delivery

Date: 2026-10-01. Status: **Delivered for independent HQ acceptance; unused server boundary only.**

## Assignment and preserved boundaries

Implemented the [M1c.4c handoff](../../docs/ENGINEERING_M1C4C_HANDOFF.md) under D-025 and the binding M1c Architecture proposal/review. Read the five required project documents, handoff, accepted verifier/exchange reviews, strict auth contracts and existing entrypoints. Started from clean HEAD `8be7d36b3492822bfe028af6e73c5a0cc7d88e67`, whose accepted implementation ancestor is `1cb7572935c786fc6f1371a755d30a2b8f67dd44`.

New files only:

- [appleCodeTransport.ts](../services/api/src/appleCodeTransport.ts): signer, native request, bounded transport and sensitive response parser.
- [appleCodeTransport.test.ts](../services/api/src/appleCodeTransport.test.ts): 127 generated-key/offline cases.
- [m1c4c-compiled-check.mjs](../scripts/m1c4c-compiled-check.mjs): native Node probe of emitted CommonJS and installed JOSE ESM.
- This report, serving as Engineering's handoff to HQ.

A SHA-256 comparison of all 145 pre-existing tracked files found zero changes. Migrations 001–007, accepted verifier/simulated exchange/session code, contracts, manifests/lockfile, mobile code, default/fixture entrypoints and shared `docs/` remain byte-for-byte unchanged. No new module import occurs in either entrypoint, app, simulated exchange or database code. Git writes and shared HANDOFF updates belong to HQ under this assignment. Default API remains health-only: health returns 200; all private/auth routes checked by the compiled verifier probe return 404.

## Trusted signing and request construction

Both factories require explicit own data properties: native client ID, ten-character uppercase alphanumeric Team ID/Key ID, and a Node private EC `KeyObject` with curve `prime256v1` (P-256). Plain/null-prototype configuration is copied and frozen; missing/inherited/accessor/unknown properties, unsuitable keys and invalid limits fail with one fixed configuration error. No PEM loading, key export, environment/configuration discovery or network work occurs during import/construction. Future secret loading/protection is outside this module.

Every exchange signs afresh with installed JOSE 6.2.12: ES256 header with configured `kid`; `iss` is Team ID, exact case-sensitive `sub` is native client ID, and `aud` is `https://appleid.apple.com`. UTC seconds come from the clock; lifetime is 1–300 seconds, default 300. UTC validity, backward time and expiry are checked before dispatch. Runtime uses the system clock; tests inject UTC and optionally monotonic clocks. A new factory with a replacement key signs under that key, with no cached client secret. The accepted identity verifier stays RS256 and is not invoked here.

One POST at most per call goes to `https://appleid.apple.com/auth/token`. Form fields are exactly `client_id`, `client_secret`, `code`, `grant_type=authorization_code`. Codes must be nonblank, valid UTF-8 round-trip strings of at most 4096 bytes; accepted code strings are not trimmed. There is no query, redirect URI, refresh grant, caller-selected endpoint/algorithm/audience, retry or provider revocation. Request options select manual redirects, omitted ambient credentials, no-store cache and no referrer. No custom TLS/agent/dispatcher or certificate override is installed.

## Deadline, reader and sensitive-result behavior

One total deadline covers signing, dispatch, headers, all body reads, parsing and the public result boundary: 1–10000 ms, default 10000. Timer/caller abort independently settle the public result even when injected fetch or cancellation does not settle. Monotonic checks also reject late work before timer delivery. Pre-aborted calls perform no signing/dispatch. Aborts use an internal controller, propagate no raw reason, and remove the caller listener afterward. Readers are cancelled on failure and released; timers are cleared. Late responses are cancelled and cannot become success. A deliberately noncooperative injected transport may retain its own unresolved work; the module cannot force that external promise to settle.

Response limit is 256–65536 bytes, default 65536. Content-Length is an early rejection hint; actual accumulated stream bytes are always bounded. Chunks are copied, decoded as fatal UTF-8 and parsed only after bounded consumption. Success requires HTTP 200, JSON media type and a complete non-array object. Redirect status/flag/foreign response URL fails. Non-success bodies are cancelled without reading or returning their contents.

`kind: 'parsed'` returns frozen, sensitive `UnverifiedAppleProviderCredentials`: exact identity/access/refresh token strings, normalized `tokenType: 'Bearer'`, and `accessTokenExpiresInSeconds`. Each credential must be nonblank and at most 16384 UTF-8 bytes; surrounding characters are preserved. Bearer type is case-insensitive with no surrounding whitespace. Expiry must be an integer from 1 through 2147483647 seconds. These are defensive engineering bounds, not claimed Apple size/lifetime guarantees. Missing credentials, invalid fields, an `error` member on success, malformed JSON/UTF-8, invalid media or oversize bodies fail closed. Extra provider fields are ignored and never returned as claims, profile data or authority. The generic Apple schema covers refresh responses too; this authorization-code boundary intentionally requires all three credentials.

There is no identity-token decoding/verification, FitQuest principal, account/session issuance, token logging, disk/cache persistence, public/mobile mapping or response replay. Parsing grants no authority. Later integration must verify identity signatures/claims, match the submitted and exchanged identities, and protect/link the provider credentials before use.

## Fixed internal failures

| Outcome | Meaning |
|---|---|
| Construction error `Invalid Apple code transport configuration` | Invalid trusted config/key/seam, with no input/exception disclosure |
| `invalid_input` | Malformed code/caller signal; no dispatch |
| `invalid_configuration` | Invalid signing clock, stale/reversed signing time, monotonic clock or signer failure |
| `cancelled` | Caller cancellation |
| `provider_rejected` | HTTP 4xx except 429; no raw provider diagnostic/classification is returned |
| `unavailable` / `timeout`, `network`, `redirect`, `http`, `response` | Deadline, operational failure, forbidden redirect, other status/429/5xx, or malformed/incomplete response |

No raw error/body/code/key/client secret is returned. Provider rejection is deliberately a coarse status result: this slice does not distinguish a rejected code from provider-side client configuration errors by consuming error bodies. No shared wire codes/domain outcomes changed; no result means `SESSION_REVOKED`, because there is no family binding.

## Verification evidence

Executed from `rebuild/`:

| Command | Result |
|---|---|
| `npm run check` | Pass: typechecks, lint, contracts/API builds; **338 tests** = 202 API (127 new + 75 accepted), 12 contracts, 124 mobile |
| `npm run test:pg:exchange` | Pass: 8 preflight + 40 PostgreSQL tests |
| `npm run test:pg:auth` | Pass: 4 preflight + 24 PostgreSQL tests |
| `npm run test:pg` | Pass: 9 PostgreSQL tests |
| `node scripts/m1c4a-compiled-check.mjs` | Pass: emitted verifier and health-only app |
| `node scripts/m1c4b-compiled-check.mjs` | Pass: emitted simulated exchange/session lifecycle and disabled-account denial |
| `node scripts/m1c4c-compiled-check.mjs` | Pass: emitted signer/form/parser, runtime/test factories, cancellation/timeouts, health-only app |

Total: **423 automated tests**, plus three compiled probes. Final full check and new/verifier probes passed after the completion-boundary fixes; PostgreSQL suites and existing exchange probe do not import the new module and passed unchanged. No baseline behavior changed.

Generated P-256 signatures were independently checked using both JOSE verification and Node `crypto.verify` with IEEE-P1363 encoding. Cases cover exact claims/form, client-ID case, changed keys, wrong curves/public/RSA/symmetric keys, invalid config/time, fresh secrets, bounded lifetimes and pre-dispatch failures. Transport cases cover one dispatch, all redirect variants, 429/4xx/5xx, malformed/incomplete responses, chunked UTF-8, exact/oversize byte limits, misleading length, stalled reads/cancellation, ignored abort, late headers/body/parser/public completion, and timer/listener/reader cleanup.

Unit tests block ambient fetch; both factories are intercepted explicitly. The native probe blocks unexpected fetch, HTTP/HTTPS requests, TCP/TLS connection helpers and DNS paths, then uses only intercepted fixtures. No auth/key/token endpoint is contacted. Private keys and synthetic provider materials remain in memory; no generated private-key/token export is performed. Sensitive exception/body markers return only fixed outcomes. Console spies and the native probe's suppressed log counters establish zero module logs; source inspection shows no filesystem/database/cache operations.

Executed versions: Node **24.12.0**, npm **11.6.2**, TypeScript **5.9.3**, Vitest **5.0.1**, ESLint **10.11.0**, JOSE **6.2.12**, PostgreSQL **17.11** (Homebrew). The declared Node >=22.13.0 floor was not executed. The existing experimental SQLite warning remains; no native/iOS visual claim is made for this server-only slice.

## Local process/data state

All three task-marked synthetic targets were initially stopped. Only the existing migration/seed-free `start` paths were used; exact guards preceded established regressions. No setup/migrate/reset/seed command was used. Stopped each cluster started here and rechecked status:

- M1c.4b: `fitquest_m1c4b_exchange_test`, Unix socket port 55441, seven existing migrations — stopped.
- M1c.3: `fitquest_m1c3_auth_test`, Unix socket port 55440, four existing migrations — stopped.
- M1b safe regression: `fitquest_m1b_synthetic_test`, Unix socket port 55439, two existing migrations — stopped.

Data directories/files are retained; established suites performed only their guarded synthetic fixture work. Retained M1b development fixture, fixture authority, simulator stores and keys were not opened or modified. No listener, server or database started by this task remains running.

## Public sources and compatibility limits

Rechecked public documentation on 2026-10-01; ordinary Apple pages rendered only a JavaScript shell, so read their official public DocC JSON feeds. Those were documentation GETs only; no account, key or token configuration was inspected.

- [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens) ([DocC feed](https://developer.apple.com/tutorials/data/documentation/signinwithapplerestapi/generate-and-validate-tokens.json)) supplies the fixed form POST, single-use five-minute code, conditional redirect URI and authorization-code credential response. Its client-secret link still targets Account and Organizational Data Sharing.
- [Apple client-secret creation](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret) ([DocC feed](https://developer.apple.com/tutorials/data/documentation/accountorganizationaldatasharing/creating-a-client-secret.json)) describes ES256/P-256, Team/Key IDs, Apple audience and exact client subject. **The cross-product link remains a source limitation; generated signatures do not establish live Sign in with Apple compatibility.** The five-minute lifetime here is an engineering choice.
- [Apple TokenResponse](https://developer.apple.com/documentation/signinwithapplerestapi/tokenresponse) ([DocC feed](https://developer.apple.com/tutorials/data/documentation/signinwithapplerestapi/tokenresponse.json)) describes credential fields and secure server retention of refresh material. Its lowercase bearer description differs from the endpoint's capitalized example; [OAuth 2.0 §5.1](https://www.rfc-editor.org/rfc/rfc6749#section-5.1) specifies case-insensitive token type and ignoring unrecognized response names, informing this parser.
- [JOSE 6.2.12 SignJWT](https://github.com/panva/jose/blob/v6.2.12/docs/jwt/sign/classes/SignJWT.md) and installed implementation support compact JWT signing with explicit key/header/claims. Native runtime execution establishes compatibility only on Node 24.12.0 here.

The accepted RS256 verifier's previously documented “JWS E256” versus RSA source discrepancy remains unresolved; its policy was preserved. No live Apple response sizes, rejection details, signing-key provisioning, TLS/provider behavior, end-to-end sign-in or production readiness is proven by offline tests.

## Recommended next engineering task / stop

Stop for HQ independent acceptance. Recommend a separately scoped protected provider-credential lifecycle: approved encryption/key versions and rotation, protected storage atomically linked to verified account/pending issuance, fenced standing checks and eventual revocation, followed by an explicitly scoped adapter/API/rate-limit integration. The preserved tokens must not be connected to the old one-field simulated port or used before those protections and signature/pair checks exist. Native/mobile/device and live-provider setup remain later gates. **D-019 still requires fresh owner approval before any product AI implementation.**
