# FitQuest — Provider-Credential Lifecycle HQ Review

Date: 2026-10-01 · Status: **Offline protection scope authorized as M1c.4d.1. C1 clarification delivered; later residual-access policy/integration awaits approval.**

## Current follow-up

Architecture's [complete C1 addendum](../proposals/PROVIDER_CREDENTIALS_C1_ADDENDUM.md) resolves the contradictory wording: it recommends blocking renewal and first activation after ambiguous grant rejection while preserving otherwise-valid active access until its original expiry. Explicit logout/disable/epoch/confirmed revocation still win. This recommendation and new contract/coordinator states are **not approved for implementation**; bring the policy to the owner before standing/session integration. No further Architecture work is currently assigned.

The owner authorized proceeding with [M1c.4d.1](../ENGINEERING_M1C4D1_HANDOFF.md): unused encryption primitive only. C1 does not affect this scope. Its default baseline/offline compiled probes are required; PostgreSQL suites need not be restarted because no existing source or database behavior may change. Historical evidence below remains historical.

## Evidence and decision

HQ retrieved and read Architecture's complete final response from turn `01a0f874-b6cd-76e0-902f-91705e54bdd2`; the [source snapshot](../proposals/PROVIDER_CREDENTIALS_ARCHITECTURE_PROPOSAL.md) preserves it. The current checkout is clean at `e389126` before HQ documentation edits; accepted implementation remains `2a383a1`. The 423 tests/three compiled checks are earlier acceptance evidence, not newly run tests. No database, provider, native or hosted actions occurred in this design review.

HQ checked the accepted transport/verifier boundaries, transaction-owned issuance and account/session guards against the proposal. The PostgreSQL review skill focused assessment on account-first ordered locks, provider I/O outside transactions and least-privilege access to credential material. Those are design requirements; proposed database changes have not been implemented or tested.

The first increment can be scoped without waiting for real Apple configuration or the later integration clarification below: an **unused provider-credential encryption module**, generated in-memory test keys and a native Node compiled probe only. No new service/dependency, database migration, secret loader, provider call, account/session wiring or UI change is needed. A design acceptance is not an Engineering assignment.

## Accepted protection direction and binding qualifications

- Use Node's maintained AES-256-GCM primitive with 32-byte secret keys, fresh cryptographically random 12-byte IVs and full 16-byte tags. Never return partial plaintext before authentication succeeds. HQ independently checked [Node 24.12.0 crypto guidance](https://nodejs.org/download/release/v24.12.0/docs/api/crypto.html#decipherupdatedata-inputencoding-outputencoding), including authentication at finalization and random/unique IV guidance. Generated tests will still be required.
- Bind ciphertext to independently supplied trusted ownership/context metadata, including token kind, material version and envelope revision. Strictly validate canonical bounded envelope/AAD encoding; do not trust metadata read solely from the envelope. Define concrete encoding/bounds in the eventual first handoff and test every binding field. Preserve exact token bytes; successful decryption is not provider verification.
- Explicit immutable key-ring input, one active write key and named readable keys; no ambient discovery or import-time I/O. Distinguish missing keys, malformed input and integrity failure without plaintext fallback, secret leakage, revocation or deletion. Encryption-only rewrapping changes the envelope revision, not identity, standing, token material version or session authority.
- Offline rewrapping can prove cryptographic interoperability and preserved binding; it cannot prove persisted compare-and-swap, fleet-wide rotation, key retirement, backup recovery or rollback detection. Those remain database/operational gates. The module must not claim to detect restoration of a complete old database snapshot.
- Preserve separation among provider identity, refresh capability, material version and FitQuest family. Future duplicate-token recognition must remain private, non-authoritative and constrained to the verified owner/client scope. Provider HTTP, encryption-key acquisition and JWKS retrieval cannot be held inside account transactions. Local bounded encryption may be part of the atomic finalization.

## C1 — Clarify later rejected-credential access policy

The proposal's invalidation table says a rejected refresh capability stops renewal, but its standing-state table says affected bindings lose server authority, including private access. These are observably different for a still-valid FitQuest access token. The new `reauthentication-required` binding state also needs explicit precedence against existing revoked/expired results before implementation.

Request a bounded Architecture addendum specifying one consistent matrix for private reads/commands, activation, refresh, identity and existing durable local access under: ambiguous grant rejection; confirmed credential/family revocation; provider outage; missing key/integrity failure; and fresh successful sign-in. Include already-active versus pending families, shared-credential families, late check/refresh races, no resurrection of old bindings and whether existing auth contracts need an additive change. Do not weaken explicit logout/account-disable/epoch enforcement.

HQ independently read Apple's official [TN3107 error definitions](https://developer.apple.com/documentation/technotes/tn3107-resolving-sign-in-with-apple-response-errors) via its DocC feed: `invalid_grant` can reflect invalid/expired material or client mismatch. That supports **not equating a raw rejection with confirmed revocation**, but does not itself choose FitQuest's still-valid-access policy. The accepted code transport's coarse 4xx result remains insufficient as standing evidence. C1 does not block the unused encryption primitive; it blocks accepting the later standing/session integration as implementation-ready.

## Retained gates and next step

Retention durations, daily dispatch reservations, refreshed-token nonce behavior, grant equality and cross-device revocation scope remain proposals/compatibility gates, not proven provider behavior or approved production policy. Do not weaken the sign-in nonce verifier or fabricate a nonce for refresh. Ordinary family logout makes no provider-revocation call. Deletion/consent withdrawal, orphan external grants and unresolved revocation intents require separate operational/product policy.

Next Engineering candidate: protection module and tests only, with strict tamper/ownership negatives, missing/wrong keys, key-ring mutation isolation, old/new-key rewrapping and no side effects; full baseline and compiled checks, then HQ review. No implementation handoff is dispatched by this review. A routine read-only C1 clarification can be routed under D-024. No product AI work; D-019 remains unchanged.
