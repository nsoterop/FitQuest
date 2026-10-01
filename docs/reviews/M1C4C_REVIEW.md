# FitQuest — M1c.4c HQ Acceptance Review

Date: 2026-10-01 · Status: **Accepted for unused server-module/offline-test scope. No blocking findings.**

## Delivery and independent evidence

HQ reviewed Engineering turn `01a0f83b-c590-7a82-8cc6-0405573f1534` against the [handoff](../ENGINEERING_M1C4C_HANDOFF.md). Read the complete signer/transport, all 127 new test cases, compiled probe and [delivery report](../../rebuild/docs/M1C4C_REPORT.md). Delivery adds four files on `8be7d36b3492822bfe028af6e73c5a0cc7d88e67`; all pre-existing tracked source/configuration files and migrations remain unchanged. Import searches show the new module is used only by its tests/probe, not entrypoints, simulated exchange or session/database code.

Fresh HQ execution passed:

- `npm run check`: typechecks, lint, contracts/API builds and **338 tests** (202 API, 12 contracts, 124 mobile).
- Exchange PostgreSQL: **40 tests + 8 preflight checks**; existing auth PostgreSQL: **24 + 4**; existing synchronization PostgreSQL: **9**.
- **423 total automated tests**, plus all three native Node compiled probes. Default API remains health-only; checked private/auth endpoints remain absent.
- HQ's separate compiled probe independently verified ES256 signatures and trusted claims, ran concurrent requests through one transport, cancelled one without cancelling the other, confirmed preservation of the successful provider credentials, and verified one-time cancellation of the abandoned late body. An upstream stream exception returned only a fixed failure and released the reader. Zero unexpected outbound calls; no generated secret was printed or saved.
- Tracked/staged diffs were empty before HQ documentation edits. Node 24.12.0 was exercised; the declared Node 22.13.0 floor remains unexecuted. The existing experimental SQLite warning remains.

All three synthetic database clusters were initially stopped, started only through accepted migration/seed-free guards for their established suites, then stopped with files/data retained. No setup, migration, reset, retained development-fixture change, native/device work or hosted action occurred. Suites performed their guarded synthetic fixture cleanup; this is not a no-write database audit.

## Acceptance rationale

Configuration and signing material are explicitly trusted inputs; there is no ambient secret discovery, caller-selected endpoint/key or network work at construction. ES256 client-secret signing remains separate from RS256 identity verification. Copied configuration, fresh signing and pre-dispatch clock/key checks preserve the trusted client binding. The fixed native form request omits redirect URI, uses manual redirects, and dispatches at most once per call; this module does not itself persist one-use claims, which remain the orchestration layer's responsibility.

Timeout/cancellation applies through signing, headers, bounded streamed body consumption, parsing and the public return. Separate stop settlement handles ignored abort; late responses cannot become success. Error bodies are not surfaced. Credential fields remain sensitive, opaque and explicitly unverified, without account/session authority or storage. Extra fields cannot become claims. Case-insensitive token-type handling and ignoring unrecognized response fields agree with [OAuth 2.0 section 5.1](https://www.rfc-editor.org/rfc/rfc6749#section-5.1), checked during review.

No blocking defect was found within this bounded scope. This is not a comprehensive security audit or proof of working Apple sign-in.

## Limits and next gate

Generated signatures/intercepted fetch do not verify live Apple configuration, TLS/provider behavior, response sizes or end-to-end identity compatibility. Apple's cross-product client-secret documentation link and the earlier identity-algorithm discrepancy remain recorded in the report/handoff. Parser size/lifetime bounds are engineering limits, not provider guarantees. Provider rejection is intentionally coarse and must not later be mistaken for session revocation. A noncooperative injected dependency may retain its own pending work after the public operation settles; it cannot cause a successful late result.

Engineering's M1c.4c assignment is complete. HQ may publish the reviewed checkpoint under D-016; this acceptance does not dispatch another milestone. Next is a scoped design/implementation boundary for protected provider-credential storage, encryption-key versions/rotation, atomic identity/session linkage, fenced standing checks and eventual revocation. Resolve its detailed lifecycle contract before wiring the transport into sign-in. Public auth routes/rate limits, native/device and live/hosted integration remain separate gates.

**D-019 remains mandatory:** fresh owner explanation and approval before any product AI implementation, scaffolding, prompts or evaluation code/calls.
