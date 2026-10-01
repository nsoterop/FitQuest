# FitQuest — Provider-Credential Lifecycle Architecture Proposal

Captured by Project HQ: 2026-10-01. Source: **Architecture**, chat `01a0d09d-2bf8-79e0-8a59-6b4043aa18f5`, turn `01a0f874-b6cd-76e0-902f-91705e54bdd2`, final message `msg_0c050bd6f250a70b016abe96745cbc87d1b3288dd05bbaf32b`.

This is a source snapshot, not implementation authority. HQ's [review and qualifications](../reviews/PROVIDER_CREDENTIALS_ARCHITECTURE_REVIEW.md) distinguish the ready offline protection increment from unresolved later integration details. Original prose is retained; repository-local absolute links are made relative for portability.

## Original Architecture response

I recommend adding a small, server-only credential protection module first, then integrating it into a separately tested transactional sign-in flow. **The accepted Apple transport should remain disconnected from account/session issuance until encrypted credential persistence and session linkage commit atomically.**

This proposal follows the current [provider-credential handoff](../../docs/ARCHITECTURE_PROVIDER_CREDENTIALS_HANDOFF.md) and D-026. It preserves the approved React Native, Fastify, PostgreSQL and Render direction. It introduces no additional service or dependency.

**Verified baseline — 2026-10-01.** I read the required documents and inspected the relevant source, migrations and database guards. At accepted implementation `2a383a1`:

- [appleCodeTransport.ts](../../rebuild/services/api/src/appleCodeTransport.ts) preserves unverified identity, access and refresh tokens. It performs code exchange only; its coarse `provider_rejected` result cannot establish revocation.
- [appleIdentityVerifier.ts](../../rebuild/services/api/src/appleIdentityVerifier.ts) verifies identity tokens against an expected nonce. It does not establish durable credential ownership.
- [simulatedAppleSignIn.ts](../../rebuild/services/api/src/simulatedAppleSignIn.ts) provides a useful transaction/fencing reference, but deliberately rejects a real response containing access and refresh tokens.
- [authSessions.ts](../../rebuild/services/api/src/authSessions.ts) supports transaction-owned pending issuance, activation and rotation. Its authorization checks do not yet include retained provider credentials.

HQ’s **423 passing tests and three compiled checks** are accepted baseline evidence, not tests rerun for this proposal. I made no file changes, started no databases and accessed no private credentials or Apple authentication endpoints.

**Recommended ownership contract.** A provider identity identifies an account; a retained credential represents a particular Apple refresh capability; a FitQuest session family represents one installation’s renewable access. They must remain separate.

| Record | Ownership and invariant |
|---|---|
| Provider identity | Maps a verified Apple subject to one internal account. Scope by trusted environment, issuer and configured application namespace. Initially use the exact native client/team configuration; do not infer cross-app identity grouping. Never merge by email. |
| Provider credential | Belongs to exactly one provider identity/account/client. Represents a retained refresh capability, with its own status and current material version. |
| Credential material version | An immutable verified token-set snapshot. Records its originating exchange/check, verification times and encrypted material. Refresh validation can produce a new version while retaining the same refresh token. |
| Encryption envelope revision | Changes when ciphertext is re-encrypted. It does **not** change credential identity, standing, session generation or authorization. |
| Session-family binding | Binds a family to one credential and identity epoch. Records whether that binding is usable, requires fresh authentication or is revoked. |
| Exchange/check attempt | Captures trusted identifiers, expected versions, deadline and a unique fence. It is evidence of an operation, never identity authority by itself. |

Use composite foreign keys or equivalent database constraints to prevent cross-account identity, credential and family links. Real-provider pending issuance must require a valid binding; no nullable “attach the credential later” path.

For repeated sign-ins:

- A newly returned refresh token creates a new credential and new session family. Existing families keep their existing bindings.
- Do not assume Apple always returns different refresh tokens. Use a private, domain-separated SHA-256 fingerprint of the exact high-entropy refresh token, scoped to environment/client, to recognize equality. This fingerprint is for internal deduplication, not authentication, logging or public lookup.
- If an identical token already belongs to the same identity, a verified exchange can append a material version and create a new family binding. A different-identity match fails closed.
- A successful new sign-in never reactivates previously revoked or reauthentication-required family bindings.
- A different replacement refresh token creates a new credential. Do not silently move other families onto it.

This permits multiple devices without treating “the latest Apple token for this account” as an account-wide credential slot.

**Recommended invalidation scope.**

| Evidence | Permitted effect |
|---|---|
| Failed fresh code exchange | Reject that attempt only. No changes to existing families. |
| Rejected refresh capability | Stop provider-backed renewal for families currently bound to that credential. Require fresh authentication; do not infer consent withdrawal. |
| Confirmed credential-specific revocation | Revoke the families bound to that credential, including multiple families sharing the same token. |
| Verified Apple consent-revoked/account-deleted event | Retire bindings within the verified provider identity/application scope and advance its security epoch. |
| Explicit FitQuest family logout | Revoke that family only. |
| Explicit FitQuest account deletion | Disable account authority and retire all its families, with provider revocation handled separately. |

Apple documents several causes for `invalid_grant`, including client mismatch and invalid or expired refresh tokens. It is therefore insufficient evidence for `SESSION_REVOKED`. [Apple error definitions](https://developer.apple.com/documentation/signinwithapplerestapi/errorresponse), [TN3107](https://developer.apple.com/documentation/technotes/tn3107-resolving-sign-in-with-apple-response-errors?language=objc)

The proposed distinction is:

- **`AUTH_REAUTH_REQUIRED`:** the credential cannot support further authentication.
- **`SESSION_REVOKED`:** a known family has been explicitly revoked or is covered by confirmed revocation evidence.

This needs explicit HQ review when integrating provider standing. It refines the previous proposal’s “definite invalidation” wording and preserves D-012’s distinction between unavailable authentication and confirmed revocation.

**Recommended encryption contract.** Use Node’s maintained `node:crypto` implementation of **AES-256-GCM**, with a random 32-byte key, fresh random 12-byte IV for every encryption and a full 16-byte authentication tag. Buffer decrypted output internally; return nothing until authentication succeeds. Node explicitly warns that output from `decipher.update()` is not yet authenticated. [Node 24.12.0 crypto documentation](https://nodejs.org/download/release/v24.12.0/docs/api/crypto.html#deciphersetauthtagbuffer-encoding)

Protect each token field separately so expiry cleanup does not require retaining unrelated material. The envelope contract is:

```text
schemaVersion = 1
algorithm = "AES-256-GCM"
keyId
envelopeRevision
iv
ciphertext
authenticationTag
```

Use strict, bounded, canonical encoding. Reject unknown versions/algorithms, malformed encoding, unexpected fields, invalid lengths and oversized input.

Authenticated additional data is a fixed-order encoded tuple containing:

```text
format identifier, schema version, algorithm, key ID,
environment, account ID, provider identity ID, issuer, client ID,
credential ID, material version, token kind,
source exchange/check ID, token expiry or null, envelope revision
```

Construct expected binding metadata from trusted repository context. Never accept an envelope’s own claimed account or credential binding as sufficient authority. This makes copying ciphertext between accounts, credentials, token fields or environments fail authentication.

Preserve exact token bytes: no trimming or normalization. Use the accepted transport’s 16 KiB per-token bound. The encryption module protects opaque material; **successful encryption or decryption is not proof of Apple verification**.

Key management should have these boundaries:

- A composition-root loader supplies an immutable validated key ring: one active write key and explicitly listed readable keys, represented as `KeyObject`s.
- The protection module performs no environment discovery, filesystem reads, network calls or key generation at import.
- Keep these keys separate from Apple’s signing key, database passwords and device SQLCipher keys.
- Validate the configured key ring before accepting code-exchange work. Missing protection capability must fail before consuming an authorization code whenever possible.
- The first increment uses generated, in-memory test keys only. Later hosted configuration supplies keys through an explicitly approved server secret mechanism, with independently recoverable operator custody.

Rotation follows **add → switch → re-encrypt → verify → retire**:

1. Load the new key as readable across processes.
2. Switch new writes to it.
3. Re-encrypt bounded batches using fresh IVs.
4. Commit each replacement only if the credential material version, envelope revision and old key ID still match.
5. Retire the old key only after no required live/revocation material references it, old processes have drained and retained backups have a tested recovery path.

Interrupted rotation leaves mixed key versions readable and resumable. Rotation must not update standing freshness or restore session authority.

Unknown key IDs produce an operational-unavailable result. Authentication-tag failure produces an integrity failure. Neither is provider revocation, and neither permits plaintext fallback or automatic deletion of the ciphertext. Permanent key loss requires fresh authentication for affected capabilities; it does not justify deleting athlete records.

This protects a database-only disclosure and detects ciphertext substitution. It does not protect against an attacker controlling both the application process and its keys, nor does it independently detect restoration of an entire old database snapshot.

**Recommended material retention.** Persist the verified exchange response deliberately rather than silently dropping fields. Apple’s current guidance calls for secure token-response storage, and its response schema says refresh validation does not return another refresh token. [Apple TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple?changes=__5_6&language=objc), [TokenResponse](https://developer.apple.com/documentation/signinwithapplerestapi/tokenresponse?changes=__1)

| Material | Proposed treatment |
|---|---|
| Authorization code and generated client-secret JWT | Transient memory only; discard after the attempt. Never cache for replay. |
| Identity token | Encrypt at successful issuance; retain until expiry, then remove the raw token. Keep minimal verified identity/time provenance. |
| Access token | Encrypt until its conservative expiry or replacement; retain when needed by an active revocation operation. |
| Refresh token | Encrypt while supporting a usable family or unresolved revocation intent. Never replace it with absence during refresh validation. |
| Token/version metadata | Retain only what is required for fencing, ownership, replay prevention and bounded diagnostics. |
| FitQuest tokens | Continue storing hashes under the accepted session design; no secret-response cache. |

For access expiry, capture dispatch time and calculate conservatively from `expires_in`; do not extend lifetime by adding network/queue delay.

Proposed cleanup defaults are **24 hours for credentials belonging only to abandoned pending families**, and **seven days after the last ordinary family retires**, unless a revocation intent needs the credential. Purging local ciphertext does not revoke Apple consent. These are reviewable defaults, not an approved production privacy schedule. Cleanup must preserve the existing session replay/revocation metadata for its required lifetime.

**Recommended atomic sign-in sequence.**

1. Validate trusted configuration and protection readiness. Verify the native identity token against the challenge nonce.
2. Claim the exchange durably with an exclusive fence. Preserve the existing single-use challenge/request-digest rules.
3. Release the database connection. Dispatch the authorization code **once**.
4. Verify the returned identity token independently, then require issuer, subject, audience and nonce agreement. Perform all JWKS work outside database transactions.
5. Begin finalization. Resolve identity under the existing identity-serialization mechanism, lock the account and recheck its status/epoch.
6. Under the same transaction, resolve/create the credential, encrypt and persist its material, create the pending family and binding, persist FitQuest token hashes, and complete the fenced attempt.
7. Recheck token validity and strict attempt deadlines immediately before commit.
8. Return the FitQuest bundle only after commit. The device still follows persisted/read-back bundle storage followed by activation.

The lock order extends the accepted order:

```text
identity serialization lock, when resolving identity
→ account
→ affected session families, sorted
→ provider identity / credential
→ exchange or standing-check attempt
→ domain records, if applicable
```

Workers first discover candidates without holding conflicting row locks, then enter this order. They must not lock an attempt and subsequently wait for its account. Bounded local encryption may occur inside finalization; provider HTTP and external key retrieval may not.

Identity mapping, protected material, pending issuance, linkage and attempt completion either all commit or all roll back. The existing transaction-owned issuance primitive is suitable for extension; a separately committing issuer is not.

**External exchange is not part of that transaction.** Recovery must acknowledge this explicitly:

| Failure | Required recovery |
|---|---|
| Apple succeeds; encryption or database finalization fails | No FitQuest authority is issued. Record a bounded nonsecret outcome if possible. Require fresh sign-in; do not retry the code. |
| Timeout/crash after dispatch, before a usable response | Treat external outcome as unknown. The durable claim prohibits redispatch. |
| Database commit outcome is uncertain | Query durable attempt state if possible, but never reconstruct/replay lost FitQuest secrets. Fresh sign-in remains the recovery path. |
| Commit succeeds; response is lost | The stored pending family expires under the existing deadline. Do not return cached secrets on retry. |
| Late provider response after cancellation/deadline | Discard it; it cannot finalize authority. |
| Unretained Apple grant remains | Accept that it cannot necessarily be identified or revoked automatically. Do not claim distributed atomicity. |

Do not automatically call Apple revocation to clean up an orphan exchange. Its effect is not proven to be limited to one FitQuest family, and it could affect other devices. Prevent avoidable orphans through readiness checks and short bounded work; handle unavoidable ones through fresh sign-in and later explicit consent/deletion workflows.

**Recommended standing-check contract.** Build a separately named refresh-validation adapter. Do not overload the accepted authorization-code transport.

Its result should distinguish:

```text
validated token response
grant rejected
client/configuration rejected
temporarily unavailable
invalid/unexpected response
cancelled
```

Require bounded response parsing, exact client binding, the accepted HTTP safety/deadline rules and sanitized errors. A successful refresh response preserves the stored refresh token and verifies the returned identity token against the credential’s identity. An unexpected replacement refresh token must be handled as an explicit protocol change, not silently adopted.

Use a distinct refresh-context verifier. Do not weaken the current nonce-required sign-in verifier or pass it a fabricated nonce. The proposed refresh policy permits an absent nonce in this separately authenticated refresh context; if present, require agreement with the retained originating nonce binding. Exact Apple behavior remains a live compatibility gate.

Continue using the pinned JOSE library for signature and claim verification. [JOSE 6.2.12](https://github.com/panva/jose/tree/v6.2.12)

The scheduling default is **on-demand when session renewal needs a check**, at most once per 24 hours per retained refresh capability. Apple explicitly documents a daily verification limit and possible throttling. [Apple verification guidance](https://developer.apple.com/documentation/signinwithapple/verifying-a-user)

The durable check claim captures:

- Account and provider-identity security epochs.
- Credential ID, material version and status.
- Triggering family, binding and FitQuest generation.
- Attempt fence, deadline, dispatch reservation and next permitted check time.

Reserve the daily dispatch window before network work. A crash between reservation and dispatch conservatively consumes that window. This favors bounded provider use over repeatedly guessing whether a request reached Apple. A fresh interactive sign-in is the recovery option; ordinary FitQuest refresh retries must not generate additional Apple calls.

Keep the existing engineering defaults of a ten-second provider deadline inside a thirty-second attempt window. On success, advance freshness from the captured dispatch time. On outage or ambiguous result, do not advance it.

Two checks are necessary when applying the response:

- **Credential result fence:** only the current attempt, account/identity epochs and credential material version can accept the standing result.
- **Family issuance fence:** the triggering family must still have the expected binding, generation and usable state before FitQuest rotation can proceed.

A family logout therefore cannot be undone by a late check. If another family shares the credential, a valid shared standing result may still update that credential, but cannot issue credentials for the logged-out family. Replacement material invalidates old check results. Encryption-only rewrapping does not change credential authority and cannot cause old ciphertext to overwrite the new envelope.

Do not consume the FitQuest refresh operation/token until provider prerequisites have succeeded and the normal rotation transaction can commit.

| State | Server behavior | Existing local behavior |
|---|---|---|
| Fresh usable standing | Normal activation/rotation/private operations | Normal access |
| Check due or transient provider failure | Pause new renewal; existing valid access remains usable until expiry | D-012 local logging remains available |
| Missing key or integrity failure | Block credential-dependent issuance; report operational failure | No fabricated revocation |
| Current credential rejected | Deny affected bindings’ server authority with reauthentication required | Proposed: preserve durable local authorization pending fresh sign-in |
| Confirmed bound-family revocation | Deny private operations and renewal | Lock when learned; preserve pending records and their key |
| Offline and remote status unknown | No claim of immediate revocation detection | Follow existing durable local authorization policy |

Existing pending activation normally falls within the five-minute window after a fresh exchange. If provider standing has nevertheless become unusable or revoked, activation must fail under the same transactional guard.

**Logout, consent withdrawal and deletion need separate operations.** Ordinary FitQuest logout should continue using the family revocation capability and should make **no Apple revocation call**.

For explicit provider disconnection or account deletion, create a durable revocation intent in the transaction that disables the relevant local authority. Capture scope, identity epoch, credential/version, encrypted token reference, attempt fence and next retry time. Do not delete the only usable revocation material before the external action is resolved.

A worker then claims an intent, performs HTTP outside locks and conditionally records the result. Apple documents `200` for both successful and already-completed revocation, supporting retry after a lost response. [Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens?changes=la)

Proposed retry policy: bounded exponential backoff with jitter, capped at daily attempts; configuration failures pause until configuration changes. After seven days unresolved, escalate to an explicit manual-resolution state instead of retaining secrets indefinitely by accident. That final retention/remediation policy requires approval before deletion ships.

A revocation intent must not race a new consent grant: block new issuance for that provider identity while its disconnect/deletion intent remains pending. Workers must never substitute a newly issued token into an old intent. A `200` resolves the submitted token intent; it is not evidence that every device token was independently revoked.

Verified provider notifications can establish broader identity-scoped consent withdrawal. Notification signature, audience, event type, replay protection and event ordering need their own implementation and tests. Email-forwarding changes are not revocation. [Apple account-change notifications](https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts?changes=latest___6__2)

Account deletion must still complete if no provider token is recoverable; Apple documents a manual consent-revocation fallback. Athlete-data deletion, device erasure, backup expiry, re-registration and export behavior remain later product gates. They should not be built into the first credential-protection increment.

**Repository and threat boundaries.** Add new tables/helpers through forward migrations only. Preserve migrations 001–007, historical hashes, fixtures and retained review evidence.

Separate access by purpose:

- Pre-authentication role: bounded challenge/claim helpers only.
- Auth repository: verified identity resolution, credential insertion and session linkage.
- Private data repository: credential standing metadata, never raw provider material.
- Credential worker: narrowly scoped encrypted-material retrieval and fenced state transitions.
- Lookup role: existing bounded session candidate lookup; no provider-token lookup.

Use forced owner-scoped RLS and restricted column/function grants. New privileged helpers should be strict where appropriate, fully qualify objects, fix a trusted search path including `pg_temp` last, and revoke default public execution. Explicitly test null arguments and caller-controlled owner context. [PostgreSQL 17 function-security guidance](https://www.postgresql.org/docs/17/sql-createfunction.html)

| Threat/failure | Required protection and test |
|---|---|
| Cross-account ciphertext substitution | AAD mismatch; no plaintext returned |
| Wrong key, truncated tag, malformed envelope | Typed sanitized failure; no fallback |
| Raw tokens in logs/errors | Canary-secret tests across success, parse failure and cancellation |
| Concurrent first sign-ins | One identity/account; correctly scoped credential/family records |
| Failure after each finalization write | Complete rollback; no partially authoritative family |
| Duplicate standing checks | One durable dispatch reservation |
| Late check after replacement/logout | Version and family fences prevent revival |
| Key rotation racing token updates | Compare-and-swap prevents stale overwrite |
| Revocation retry after crash | Same durable intent/token; idempotent completion |
| Fixture authority reaching real flow | Separate namespace/configuration and negative privilege tests |

**Unresolved external compatibility — checked 2026-10-01.** These are evidence gaps, not reasons to expand algorithm acceptance or configure Apple now:

- Apple’s verification article still says “JWS E256,” while its JWK schema specifies RSA. Preserve the reviewed RS256 identity verifier and ES256 client-secret signer until an explicitly authorized compatibility check establishes actual behavior. [Verification article](https://developer.apple.com/documentation/signinwithapple/verifying-a-user), [JWK schema](https://developer.apple.com/documentation/signinwithapplerestapi/jwkset/keys-data.dictionary?changes=_6)
- The discoverable client-secret article is under **Account and Organizational Data Sharing**. Its ES256 description supports the primitive, but is not independent proof of FitQuest’s Sign in with Apple configuration. [Client-secret article](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret?changes=__3_10)
- The token-validation page describes `redirect_uri` inconsistently in its parameter list and explanatory note. Preserve the accepted native-only omission when the initiating request supplied none. [Token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens?changes=l_1)
- Refresh-token equality across sign-ins, refresh-response nonce behavior and revocation scope across devices require later actual-provider evidence.
- Accepted compiled checks exercised Node 24.12.0; they do not establish the declared Node 22.13 runtime floor.

**Recommended serialized Engineering increments.**

| Increment | Scope and files | Acceptance and stop condition |
|---|---|---|
| **1. Protected credential envelope** | New `providerCredentialProtection.ts` and tests under `rebuild/services/api/src/`; one offline compiled probe under `rebuild/scripts/`. | Exact-byte round trips; all binding/tamper negatives; missing/wrong keys; old/new key interoperability; re-encryption; strict bounds; sanitized failures; import causes no I/O. No database, provider, route or mobile integration. Stop for HQ review. |
| **2. Atomic credential ownership and pending issuance** | New provider-credential repository, forward migration(s), bounded extension to transaction-owned session issuance and a new isolated test-target guard. | Identity/material/family/attempt atomicity; two-user and fixture denial; duplicate-token handling; encryption/commit failures; lost response; concurrent sign-ins. Stop for review. |
| **3. Fenced standing checks** | Separate refresh adapter/verifier context, standing repository and session-guard integration, exercised with fake provider transport. | Daily reservation; duplicate/crash/timeout behavior; refresh-token preservation; version/logout races; correct error classification; no premature FitQuest token consumption. Stop for review. |
| **4. Revocation intents and real orchestration boundary** | Durable revocation intent engine with fake transport; separately named real-provider orchestrator using accepted verifier/transport. | Idempotent retry, no logout-triggered Apple revocation, pending-intent/new-sign-in exclusion, no simulated identity promotion. Default API remains health-only until separately authorized wiring. |
| **Later gates** | API exposure, native storage/UI, actual Apple configuration/device checks and hosted operations. | Explicit target authorization plus provider, device, security and recovery evidence. Full deletion behavior remains separately scoped. |

For increment 2, use a new purpose-marked cluster—for example `fitquest_m1c4d_provider_test`, Unix socket only, proposed port `55442` after checking availability. Its guard must verify exact path, marker, database, socket, port, roles, schema and migration checksums before any action. Setup and migration-free startup remain distinct. Existing clusters retain their current ledgers and fixtures.

Do not widen the simulated factory to accept real credentials or reinterpret `apple_simulated` rows. Future real orchestration must receive identity exclusively from verification and have no request-selected account/environment bypass.

Increment 1 principally supports **AC-01/10** through isolation and protection. Increments 2–4 support **AC-05** through atomicity and race recovery, and preserve **AC-04/11** by keeping authentication failures from destroying local logs. None establishes real-provider, native-device or release acceptance.

**Approval boundary.** No external owner choice blocks the first offline encryption increment. The implementation handoff can use the reversible technical defaults above. Before provider/session integration, HQ should approve the proposed distinction between rejected credentials and confirmed revocation, including its local-access effect. Production retention, deletion behavior, hosted key custody and live Apple compatibility remain later gates.

**The smallest useful first task is increment 1: an unused, tested credential-envelope module with explicit binding and key-rotation semantics.** It needs no dependencies, database startup, Apple credentials or product AI work. D-019 remains unchanged.

This proposal is complete and read-only. I’m stopping for approval.
