# M1c.4d.1 — Isolated provider credential protection

Date: 2026-10-01. Status: **Delivered for HQ independent acceptance; unused server primitive.**

## Scope and preserved baseline

Implemented only the [M1c.4d.1 handoff](../../docs/ENGINEERING_M1C4D1_HANDOFF.md), authorized under D-027. Read the five required project documents, provider proposal/review, C1 addendum and accepted transport/verifier/entrypoints. The clean starting checkpoint was `01bb4c8204cb3616c214fc3b02c283c33b504467`; accepted implementation remains `2a383a136c4e788e1e0f4b8db25dd70dee19fff5` until independent acceptance.

Exactly four new files:

- [providerCredentialProtection.ts](../services/api/src/providerCredentialProtection.ts)
- [providerCredentialProtection.test.ts](../services/api/src/providerCredentialProtection.test.ts)
- [m1c4d1-compiled-check.mjs](../scripts/m1c4d1-compiled-check.mjs)
- This report.

SHA-256 comparison of all 155 pre-existing tracked files found no changes. Existing source, contracts, migrations 001–007, manifests/lockfile, entrypoints, mobile files and shared docs are preserved. Builds produce ignored output only. No Git writes, source integration, provider calls, real credential/configuration lookup, database startup/change, native/device/hosted action, deployment, health records or product AI work occurred. C1 residual-access policy and proposed additive auth contracts remain untouched and unapproved for implementation. HQ owns shared HANDOFF updates; this report is Engineering's delivery handoff.

## Server module API

`createProviderCredentialProtection({ activeKeyId, readableKeys: [{ keyId, key }] })` returns `{ kind: 'ready', protection }` or the fixed `{ kind: 'invalid_configuration' }`. Keys must be Node secret `KeyObject`s of 32 bytes. The readable list must contain the active key, with no duplicate IDs; IDs are case-sensitive ASCII `[A-Za-z0-9_-]{1,64}`. There is exactly one active write ID. Strict own data properties are validated without invoking configuration getters or inheriting fields. The mapping is copied into a private Map; caller changes cannot replace the active ID/readable keys. These keys are separate from Apple signing, database and device keys; this module does not load/export/generate keys.

The frozen primitive exposes synchronous internal methods:

```ts
protect(plaintext: Uint8Array, context, envelopeRevision)
  // { kind: 'protected', envelope } or a fixed failure
unprotect(envelope: unknown, expectedContext, expectedEnvelopeRevision)
  // { kind: 'unprotected', plaintext: Buffer } or a fixed failure
rewrap(envelope: unknown, expectedContext, expectedEnvelopeRevision)
  // { kind: 'protected', envelope: replacement } or a fixed failure
```

There is no public HTTP/mobile API, test-entropy factory, environment fallback or secret loader. Context and expected revision must be supplied from independent trusted authority; the module cannot establish their provenance. Never use an envelope's revision as its own expected authority.

Protection uses Node `node:crypto` AES-256-GCM, a fresh `randomBytes(12)` IV on every encryption/rewrap, and `authTagLength: 16` on both cipher and decipher. Opaque byte input is 1–16384 bytes, including whitespace, zeroes and invalid UTF-8. Intrinsic typed-array size bounds allocation before a private copy, so a caller-shadowed size/getter cannot weaken the limit. Input is not mutated or interpreted. Decryption retains update output privately until final authentication succeeds, then returns an owned unpooled Buffer. Private update/final buffers and encrypt/rewrap working plaintext are cleared; nothing is returned on failed authentication. This does not prove whole-process/OpenSSL memory erasure, and successful decryption is not Apple verification or FitQuest authority.

## Envelope and AAD v1 protocol

The returned fresh frozen envelope has **only** `schemaVersion: 1`, `algorithm: 'AES-256-GCM'`, `keyId`, `envelopeRevision`, `iv`, `ciphertext`, `authenticationTag`. Binary fields are unpadded canonical base64url strings. Encoded size/alphabet are bounded before decoding; decoded size and exact encoding round trip are checked. IV/tag must be exactly 12/16 bytes; ciphertext 1–16384 bytes. Unsupported algorithm/version, missing/extra/symbol/accessor fields, malformed types, padding/whitespace and noncanonical unused bits fail before decryption.

AAD is exactly UTF-8 of `JSON.stringify` applied to this fixed-order array:

```text
[
  "fitquest.provider-credential", 1, "AES-256-GCM", keyId,
  environment, accountId, providerIdentityId,
  "https://appleid.apple.com", clientId, credentialId,
  materialVersion, tokenKind, sourceId, expiresAtSeconds, envelopeRevision
]
```

`sourceId` is the source exchange/check UUID; `expiresAtSeconds` is the supplied integer or explicit JSON null. Context requires exactly those ten named context fields, with environment ASCII `[A-Za-z0-9_-]{1,128}`, lowercase canonical UUIDs for all four IDs, exact Apple issuer, client ID of 1–255 UTF-8 bytes, positive safe material/revision integers, expiry null or nonnegative safe integer UTC seconds, and token kind `identity`, `access` or `refresh`. UUID validation uses installed `z.uuid()` semantics (versions 1–8 and nil/max), then requires lowercase spelling. Client ID is preserved exactly, including case/whitespace/Unicode; no normalization occurs. Expiry is binding metadata, not a freshness check.

Envelope revision must match the independently expected revision **before decipher construction**. All bindings, including key ID/revision, authenticate through the tuple. Rewrap first authenticates with a readable old key, then encrypts under the active key with a fresh IV and exactly previous revision + 1. Overflow is rejected before decryption. Same-key rewrap follows the same rule. Material version and all other binding fields remain unchanged. Input envelope is never mutated; no persistence or compare-and-swap is implemented.

## Fixed failures and redaction

| Result | Classification |
|---|---|
| `invalid_configuration` | Construction key-ring/key/shape validation failed |
| `invalid_input` | Invalid plaintext, context, expected revision, envelope, encoding, or rewrap overflow |
| `key_unavailable` | A valid envelope names an unreadable key; no decipher attempt |
| `integrity_failure` | Expected revision mismatch, wrong known key/AAD/tampered bytes, or GCM final authentication failure |
| `crypto_failure` | Entropy/cipher setup/update/encryption-finalization/output operation failed |

Failures contain only `kind`; no raw exceptions, plaintext, keys, token-derived values, attempted envelope or context are returned. Crypto finalization on decryption is the authentication boundary and its failure is classified as integrity failure. There is no plaintext fallback, deletion, revocation, fingerprint, inferred standing, principal or cached response. Failed rewrap returns no replacement. Unknown keys remain operational unavailability, not provider revocation.

## Fresh verification

Executed from `rebuild/` against final source:

| Command | Fresh result |
|---|---|
| `npm run check` | Pass: all typechecks, lint, contract/API builds; **499 default tests** = 363 API (161 new protection + 202 existing), 12 contracts, 124 mobile |
| `node scripts/m1c4a-compiled-check.mjs` | Pass: emitted verifier and default-route exclusion |
| `node scripts/m1c4c-compiled-check.mjs` | Pass: emitted native signer/transport with intercepted fixtures |
| `node scripts/m1c4d1-compiled-check.mjs` | Pass: emitted protection, independent crypto/AAD verification, failure/rewrap and health-only routes |

The 161 new cases include independent Node decryption and externally authored ciphertext; exact non-UTF-8/min/max/view round trips; every valid binding substitution; invalid issuer/metadata; key ID/revision substitution; IV/ciphertext/tag tampering; strict fields/canonical encoding/size limits; key-ring mutation isolation; old/new/same-key rewrap; fresh IVs; stale expected revision and safe-integer overflow. Failure instrumentation verifies cleared unauthenticated update buffers and cleared owned encrypt/rewrap plaintext even on backend finalization errors, with unchanged caller data and no partial plaintext/replacement result.

Independent checks construct the documented tuple directly; they do not import a module AAD helper or rely solely on mutual protect/unprotect agreement. Native Node loads emitted CommonJS directly without tsx/Vitest. The compiled probe denies entropy/cipher operations during import/construction, denies synchronous file operations during primitive use, suppresses/counts console logs, blocks unexpected fetch/HTTP/HTTPS/TCP/TLS/DNS paths and uses generated in-memory keys. All observed counters are zero. Source inspection corroborates no filesystem/network/ambient secret access. Canary exception markers yield only fixed failures; generated keys are never exported or saved.

The compiled probe checks source and emitted `app`, `server`, `local-server` and `simulatedAppleSignIn` for imports of the new primitive. None imports it. Health returns 200; checked private/auth routes return 404. Default tests contact no provider and start no database.

Executed runtime/toolchain: Node **24.12.0** with OpenSSL **3.5.4**, npm **11.6.2**, TypeScript **5.9.3**, Vitest **5.0.1**, ESLint **10.11.0**, installed Zod **4.6.5**. The declared Node >=22.13.0 floor was not executed. The existing experimental SQLite warning remains.

## PostgreSQL/process state and verification limits

Read-only status checks at start and completion show the M1c.4b exchange, M1c.3 auth and M1b synthetic PostgreSQL targets **stopped**. They were not started; no database-only suite or M1c.4b database-dependent compiled probe ran. Existing retained data, development fixture/authority, simulator stores and keys were not opened or modified. **The accepted historical 423-test total, including its database evidence, is not a fresh run for this slice.** Required fresh evidence here is the 499 default tests and three specified offline probes.

No account/session/credential persistence, atomic issuance/linkage, standing-check policy, revocation engine, rate limits, live Apple behavior, native/device/hosted evidence or production key custody is implemented/proven. Rewrap demonstrates cryptographic interoperability only: persisted concurrency/CAS, complete-snapshot rollback detection, fleet key rotation/retirement, nonce usage policies and backup recovery remain later integration/operational gates. No full security audit or production-readiness claim is made.

Rechecked [Node 24.12.0 crypto guidance](https://nodejs.org/download/release/v24.12.0/docs/api/crypto.html#decipherupdatedata-inputencoding-outputencoding): decryption update output is not authenticated until finalization; [cipher IV guidance](https://nodejs.org/download/release/v24.12.0/docs/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options) calls for unpredictable/unique IVs. The exact envelope/AAD format and limits come from the authorized handoff and [binding HQ review](../../docs/reviews/PROVIDER_CREDENTIALS_ARCHITECTURE_REVIEW.md), rather than a live-provider compatibility assumption.

## Stop / recommended next task

Stop for independent HQ acceptance. Next candidate, separately scoped after acceptance: atomic provider-credential ownership/protected material and pending issuance with a forward migration, forced ownership/security checks, version/CAS fencing and a new isolated database target. C1 residual-access policy/additive contracts require owner approval before later standing/session integration. No next increment is started. **D-019 remains a hard fresh-approval gate before product AI implementation.**
