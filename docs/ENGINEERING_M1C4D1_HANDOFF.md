# FitQuest — Engineering M1c.4d.1: Isolated Credential Protection

Date: 2026-10-01 · Owner: Project HQ

Owner authorized proceeding. Sole Engineering assignment: existing chat `01a0d053-66ed-79a0-a0bb-5b366646e723`, retaining GPT-6.1 Sol and current reasoning settings. Engineering owns the four new files below; HQ owns shared docs, Git and independent acceptance. Stop after delivery.

## Outcome and baseline

Implement an unused, server-only provider-credential encryption/rewrapping primitive. No integration or new service. Accepted implementation is `2a383a136c4e788e1e0f4b8db25dd70dee19fff5`; its 423 tests and three compiled probes are historical evidence, not a fresh run. Planning checkpoint before this assignment: `cc2fdf9b72af27e16d86b2a71656892c368fe876`.

Read PROJECT_CONTEXT, DECISIONS, HANDOFF, the [provider proposal](proposals/PROVIDER_CREDENTIALS_ARCHITECTURE_PROPOSAL.md), [HQ review](reviews/PROVIDER_CREDENTIALS_ARCHITECTURE_REVIEW.md), and accepted transport/verifier/entrypoint source. The [C1 addendum](proposals/PROVIDER_CREDENTIALS_C1_ADDENDUM.md) is later proposed policy, not permission to change auth outcomes. This primitive must not depend on its approval.

Allowed new files only:

- `rebuild/services/api/src/providerCredentialProtection.ts`
- `rebuild/services/api/src/providerCredentialProtection.test.ts`
- `rebuild/scripts/m1c4d1-compiled-check.mjs`
- `rebuild/docs/M1C4D1_REPORT.md`

If existing configuration prevents discovery/building these files, report the specific blocker before widening the allowlist. Preserve all existing runtime, contracts, migrations, manifests, lockfile, entrypoints and mobile files unchanged.

## Binding implementation contract

1. Use installed Node `node:crypto` AES-256-GCM, 32-byte secret KeyObjects, a fresh cryptographically random 12-byte IV on every encryption/rewrap, and full 16-byte authentication tag. Buffer decrypted bytes privately and return nothing before final authentication succeeds. No bespoke cipher, insecure randomness or production test-entropy fallback.
2. Accept an explicit key ring with exactly one active write key and explicitly named readable keys. Validate at construction; copy its mapping so caller mutation cannot change it. Reject duplicate/invalid IDs, missing active key, asymmetric/public keys and wrong key sizes. Key IDs are case-sensitive ASCII `[A-Za-z0-9_-]{1,64}`. No environment/file/secret-loader discovery, network access or import-time key generation. Generated test keys remain in memory; separate these keys from Apple signing, database and device keys.
3. Strict envelope fields only: `schemaVersion: 1`, `algorithm: "AES-256-GCM"`, `keyId`, `envelopeRevision`, `iv`, `ciphertext`, `authenticationTag`. Binary fields use unpadded canonical base64url, checked by round trip and bounded before decoding. IV/tag decode to exactly 12/16 bytes; ciphertext is 1–16384 bytes. Reject extra/missing fields, unsupported versions/algorithms, invalid types/lengths and noncanonical encoding. Return fresh owned buffers/envelopes, without caller-mutable internal state.
4. Encode AAD as UTF-8 of a fixed-order JSON array: format identifier `fitquest.provider-credential`, schema version, algorithm, key ID, environment, account ID, provider identity ID, issuer, client ID, credential ID, material version, token kind, source exchange/check ID, expiry-or-null, envelope revision. Document this exact versioned format. Obtain expected context and expected envelope revision independently from the caller; never trust an envelope's revision or ownership as its own expected authority. Envelope revision must match that expectation before decryption. Metadata bounds: environment ASCII `[A-Za-z0-9_-]{1,128}`; canonical lowercase UUIDs for IDs using the project's existing UUID semantics; issuer exactly `https://appleid.apple.com`; client ID nonempty, at most 255 UTF-8 bytes, preserved exactly without trimming/normalization; material/envelope versions positive safe integers; expiry null or nonnegative safe integer UTC seconds; token kind exactly `identity`, `access` or `refresh`. Validate context before encryption/decryption.
5. Protect opaque bytes, not verified identity. Accept a Uint8Array/Buffer of 1–16384 bytes and preserve all bytes exactly, including whitespace and non-UTF-8 bytes. Do not interpret tokens, return principals, calculate fingerprints, infer standing or grant authority. Successful decryption is not Apple verification.
6. Distinguish invalid input/configuration, unavailable key, integrity failure and cryptographic operational failure using fixed sanitized internal outcomes. Unknown key IDs are operational unavailability; wrong known keys/tag failures are integrity failure. No raw exceptions, plaintext, key material or token-derived values in logs/errors; no fallback, deletion, revocation or file persistence. Verify no partial plaintext escapes on failure.
7. Rewrap by authenticating with a readable old key and encrypting under the active write key with a fresh IV and revision exactly previous + 1; reject safe-integer overflow. Preserve all binding fields and material version. Rewrap under the same active key still uses a fresh IV/revision. Return a replacement envelope only; no mutation of input or persistence/CAS implementation. Persisted concurrency, snapshot rollback detection, fleet rotation, retirement and backup recovery are not proved by this module.

## Verification and acceptance

- Exact-byte round trip; independently decrypt/verify an envelope using Node crypto and the documented AAD, rather than testing only two mutually dependent module methods.
- Test every context binding substitution, envelope revision/key substitution, IV/ciphertext/tag tampering, malformed/oversized fields and canonical encodings, unknown fields/versions/algorithms, invalid/empty/oversized plaintext and invalid metadata.
- Test key-ring validation and caller mutation isolation, unavailable versus wrong known keys, multiple encryptions with different IVs, old/new-key readability, unchanged plaintext and binding through rewrap, stale expected revision and overflow, fixed sanitized failures and no partial plaintext.
- Run `npm run check` from `rebuild/`, `node scripts/m1c4a-compiled-check.mjs`, `node scripts/m1c4c-compiled-check.mjs`, and the new compiled probe. Probe the emitted module using generated keys, tamper negatives and default API route exclusion; assert no entrypoint or existing exchange imports it. No provider calls, filesystem secret access or default-test DB startup.
- No database changes or integration are included, so do not start PostgreSQL or rerun DB-only suites for this slice. Report this limitation explicitly rather than presenting the prior 423-test total as newly passed. Full DB regressions return with the later DB integration scope. Preserve stopped clusters and retained data, fixture authority, simulator stores and keys.
- Delivery report: exact changed files, public/internal API and encoding, test counts/commands, actual Node version, failure/redaction evidence, no-side-effect/import boundaries and honest verification limits. Do not claim the declared Node floor, native/device, live provider or production rotation was tested unless actually verified within authorized scope.

Stop for HQ's independent review; do not commit, push, edit shared docs, message other chats or begin the next slice. No dependencies, migrations, database/account/session wiring, refresh adapter, auth wire-code changes, UI, provider calls/credentials/configuration, hosted/device actions, real health records or deployment. **D-019: no product AI SDK/scaffolding, prompts, interpretation, generation, agents/embeddings or evaluation implementation/calls before the owner's fresh pre-AI approval.**
