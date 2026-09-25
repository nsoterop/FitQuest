# FitQuest — M1c Architecture Proposal (Source Snapshot)

Captured by Project HQ: 2026-09-25. Source: **Architecture**, task `01a0d09d-2bf8-79e0-8a59-6b4043aa18f5`, completed turn `01a0d942-c8a8-73a3-8ba4-26e64ee6cb05`, final response timestamp `2026-09-25T16:00:09.932Z`.

The task reader returned no message items for the completed turn; HQ recovered the original final response from the exact local task transcript. This preserves the proposal, not implementation evidence. HQ acceptance and any binding qualifications are in [M1c review](../reviews/M1C_ARCHITECTURE_REVIEW.md); current authority is in [Engineering M1c.1 handoff](../ENGINEERING_M1C1_HANDOFF.md). Historical approval wording below is retained verbatim. Repository-local links have been made relative for portability.

## Original Architecture response

**Recommend M1c as a narrow authentication layer over the accepted M1b persistence and synchronization system.** Retain its durable records, immutable commands and conflict recovery; replace fixture authority with verified Apple identity and revocable FitQuest sessions.

This proposal follows the current [M1c handoff](../ARCHITECTURE_M1C_HANDOFF.md), D-010 recovery rules and D-012 local-access policy. It does not reopen the approved stack or expand into coaching or HealthKit.

I completed read-only inspection and official-source research. No files, dependencies, Git state, databases, credentials, devices or hosted services were changed. No tests were run.

**Verified repository facts:** the latest checkout is `1317c2a`, a documentation-only successor to accepted implementation `490f923`; the worktree is clean. HQ reports 49 baseline tests and nine PostgreSQL integration tests passing at acceptance. Native observations remain Engineering-reported. Real Apple authentication, physical-device operation and hosted integration remain unverified.

**Assumptions:** Engineering remains the sole implementation writer; initial real-provider tests use consenting test accounts and invented activity records. Apple configuration, signing and transport access will receive separate authorization.

Everything below is a **recommendation for approval**, including operational defaults.

The implementation gap is concentrated in six places:

| Boundary | Retain | Change for M1c |
|---|---|---|
| Shared contracts | Actual-session semantics, canonical commands, receipts and terminal outcomes | Add strict authentication contracts separately; preserve existing command hashes and stored outcomes |
| Local persistence | SQLCipher, migration checksums, atomic fact/history/outbox writes, drafts and recovery | Replace A/B ownership assumptions with explicit environment/account/store identity |
| Local access | Generation checks and serialized transitions | Persist real local authorization independently of rotating credentials |
| Synchronization | Dependency ordering, exact retries, receipt validation, explicit conflict resolution | Add real credentials, single-flight refresh and distinct expiry/revocation handling |
| API/database | Account guard, transaction-local ownership, RLS and atomic outcomes | Revalidate session state and generation **inside every private transaction** |
| Native/UI | Sessions-first flow, minimal profile, existing editors and status distinctions | Add Apple adapter and real account states; remove fixture coupling from normal paths |

The important source boundaries are [mobile access](../../rebuild/apps/mobile/src/access.ts), [local store](../../rebuild/apps/mobile/src/store.ts), [sync](../../rebuild/apps/mobile/src/sync.ts), [API](../../rebuild/services/api/src/app.ts) and [repository](../../rebuild/services/api/src/repository.ts).

Fixture isolation must remain explicit end to end:

- Keep existing A/B databases, keys, tokens and ownership markers synthetic. Never rename their owners or import their pending commands into real accounts.
- Put fixture access and loopback transport behind dedicated development adapters. Normal mobile startup must not discover or open fixture storage.
- Use distinct real-account namespaces containing environment, internal account UUID and store instance ID. Validate matching ownership inside the encrypted database.
- Keep the fixture API entrypoint loopback-only and explicitly enabled. The normal API must never accept fixture tokens or fall back to fixture verification when configuration is missing.
- Default and Release builds must reject fixture authority even when old fixture Keychain entries remain. A configured Release build may authenticate real accounts; an unconfigured one stays locked.
- Real-provider testing must use a separately marked database without A/B seeds. The retained M1b database stays synthetic.

Keep React Native/Expo, SQLCipher/SecureStore, Fastify and PostgreSQL. Recommended additions are small: `expo-apple-authentication` for iOS, `jose` for provider JWT verification/signing, and a Fastify-compatible rate limiter. Expo SDK 57 currently recommends AppleAuthentication `~57.0.2`; its native adapter is iOS-specific, so keep shared account/session logic outside it. [Expo documentation](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/)

`jose` supports JWT verification and remote JWKS handling. Its CommonJS interoperability requires supported Node versions; the repository’s Node floor meets the documented threshold, but Engineering must prove the **compiled API entrypoint**, not only `tsx`, loads the selected version. No broad ESM conversion is warranted. [JOSE documentation](https://github.com/panva/jose)

Use Node’s cryptographic primitives for random tokens, SHA-256 token hashes and authenticated encryption of retained provider credentials. Do not implement JWT signatures or verification manually. A managed authentication service remains an alternative if maintaining these narrowly scoped sessions proves disproportionate; introducing one now adds an unapproved service and migration boundary without removing local recovery requirements.

The recommended wire contract is:

```ts
type AppleChallenge = {
  challengeId: UUID;
  nonce: string;
  state: string;
  expiresAt: Instant;
};

type AppleExchange = {
  challengeId: UUID;
  state: string;
  identityToken: string;
  authorizationCode: string;
};

type PendingCredentials = {
  accountId: UUID;
  sessionId: UUID;                 // One revocable session family
  credentialGeneration: number;
  accessToken: string;
  accessExpiresAt: Instant;
  refreshToken: string;
  refreshExpiresAt: Instant;
  sessionExpiresAt: Instant;
  revocationToken: string;
  activationExpiresAt: Instant;
};

type ActiveIdentity = {
  accountId: UUID;
  sessionId: UUID;
  credentialGeneration: number;
};

type AuthError = {
  code: AuthErrorCode;
  requestId: UUID;
  retryable: boolean;
  retryAfterSeconds?: number;
};
```

Use strict Zod schemas with bounded strings and integers. Account identifiers in responses are assertions from the authenticated server; clients cannot supply an account identifier to select their authority.

| Endpoint | Request and authentication | Result |
|---|---|---|
| `POST /v1/auth/apple/challenge` | Empty strict body | `AppleChallenge` |
| `POST /v1/auth/apple/exchange` | `AppleExchange` | `PendingCredentials`; secrets returned once |
| `POST /v1/auth/activate` | New access bearer; body `{sessionId, credentialGeneration}` | `ActiveIdentity`; no new secrets |
| `POST /v1/auth/refresh` | `{operationId, refreshToken}` | Next `PendingCredentials` |
| `POST /v1/auth/logout` | `{revocationToken}` | Idempotent `204`; revokes only its family |
| `GET /v1/identity` | Active access bearer | `ActiveIdentity`, checked inside the account transaction |

Authentication failures do not become domain-operation outcomes. Preserve the existing domain rejection contract.

Use distinct error codes:

- `ACCESS_EXPIRED`: attempt one shared refresh.
- `AUTH_REAUTH_REQUIRED`: fresh Apple sign-in needed; retain local work.
- `SESSION_REVOKED`: confirmed revocation of the bound session; lock local access.
- `AUTH_INVALID`: unknown or invalid credentials; never revoke an unrelated family.
- `AUTH_EXCHANGE_IN_PROGRESS` / `AUTH_CHALLENGE_REUSED`: duplicate or conflicting exchange.
- `AUTH_ACTIVATION_EXPIRED`: pending credentials cannot become active.
- `AUTH_PROVIDER_UNAVAILABLE`, `AUTH_RATE_LIMITED`, `AUTH_BAD_REQUEST`: recoverable operational or validation outcomes.

Only classify a response as confirmed revocation when it identifies a known credential’s family. An unknown token or provider timeout must not masquerade as revocation.

Apple sign-in should follow this sequence:

1. Generate independent, cryptographically random nonce and state values on the server. Bind them to one challenge and the configured client/environment.
2. Pass the nonce unchanged to the native Apple request; compare the returned state locally and again on the server. Expo’s SDK 57 implementation forwards `options.nonce` directly, so do not add undocumented double hashing. [Expo native implementation](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo-apple-authentication/ios/AppleAuthenticationRequest.swift)
3. Verify the identity token using the fixed Apple JWKS endpoint, an explicit algorithm allowlist, issuer, configured audience, expiration and challenge nonce. Reject caller-selected key URLs or audiences. Apple’s current published keys use RS256. [Apple public keys](https://appleid.apple.com/auth/keys)
4. Exclusively claim the challenge with an attempt ID, request digest and deadline. Commit that claim before contacting Apple.
5. Exchange the authorization code with Apple outside database locks. Verify the returned identity token and agreement of issuer, audience, subject and nonce.
6. Resolve a provider-independent internal UUID through a unique provider-identity mapping. Never identify or merge accounts by email, nickname or the unverified native `user` value.
7. Atomically finalize the still-valid attempt and create pending FitQuest credentials. Concurrent first sign-ins must resolve one account without orphan account creation.

Apple codes are single-use and valid for five minutes. A request whose exchange outcome is uncertain requires fresh authorization; it must not blindly resubmit the code. [Apple token validation](https://developer.apple.com/documentation/SigninwithAppleRESTAPI/Generate-and-validate-tokens?changes=_7&language=objc)

Use `jose`’s JWKS selection/cache facilities against Apple’s fixed URL. Proposed cache maximum: one hour, five-second fetch timeout and 30-second refresh cooldown. An unknown `kid` triggers a bounded refresh; failure must not authorize an unverifiable token. Key rotation tests must include overlap, removal, unknown keys and unavailable JWKS.

Native cancellation is a neutral outcome. Abandon the challenge and remain at sign-in. Cancellation after exchange dispatch cannot undo server work: reject late client installation by generation, revoke a received abandoned bundle when possible, and let an unreceived pending session expire.

Diagnostics should contain route, request ID, error code, timing and outcome category. Redact authorization headers, request bodies, Apple identifiers, codes, tokens, names, email and athlete records. Avoid displaying raw provider exceptions.

The following defaults make recovery bounded without changing the accepted mechanics:

| Setting | Proposed default |
|---|---|
| Random token material | 32 bytes per access, refresh, revocation, nonce and state value |
| Challenge lifetime | 5 minutes |
| Claimed exchange deadline | 30 seconds, never beyond challenge expiry |
| Apple HTTP timeout | 10 seconds; no automatic authorization-code retry |
| Mobile exchange timeout | 20 seconds |
| Other mobile API timeout | Retain 8 seconds initially |
| Pending activation | 5 minutes from issuance |
| Access token | 15 minutes from issuance |
| Refresh inactivity | 30 days |
| Session absolute lifetime | 90 days; rotation cannot extend it |
| Apple JWT clock tolerance | 60 seconds; server deadlines remain strict |
| Provider standing check | At most once per 24 hours per retained Apple credential |
| Cleanup | Every 15 minutes, bounded batches |
| Expired challenge metadata | Purge after 24 hours |
| Spent token/reuse metadata | Retain through family absolute expiry plus 7 days |

These are reviewable engineering defaults, not approved production policy. Expiry must be enforced during authorization even if cleanup stops.

For initial abuse controls, propose challenge/exchange limits of 10 per minute and 60 per hour per source IP, refresh 5 per minute per known family, activation 20 per minute per family, and private API traffic 120 requests per minute per account. Return `429` with retry timing. These need shared-NAT testing and trustworthy proxy configuration before hosting. The maintained Fastify rate-limit plugin documents Fastify 5 compatibility; a single-process limiter is adequate only while there is one API instance. [Compatibility documentation](https://github.com/fastify/fastify-rate-limit)

Credential recovery should implement the accepted state machine exactly:

```text
Server:
pending_activation → active → revoked / expired

Device credential bundle:
stable
  → refresh_prepared(operationId, old complete bundle)
  → activation_pending(new complete bundle)
  → stable
```

The whole rotating credential bundle belongs in one versioned SecureStore value. Persist and read back `refresh_prepared` before sending refresh. Persist and read back the replacement bundle before activation. Store no Apple JWT in that bundle; keep it small.

Pending credentials may only activate or revoke. Activation is idempotent for the same current generation and returns no secrets. If activation committed but its response was lost, retry with the stored bearer. The five-minute deadline applies while pending; an already-active matching generation can acknowledge an activation retry while its access bearer remains valid.

Refresh must be single-flight per active account/session:

- Atomically consume the old refresh token, record its operation ID, invalidate old access and install the next pending generation.
- After rollback, the exact request can retry.
- After committed rotation with a lost response, the consumed token plus the same operation ID returns `AUTH_REAUTH_REQUIRED`.
- Reuse with a different operation ID revokes the family.
- A delayed duplicate of the completed operation must not revoke a successfully activated generation.
- Unknown tokens have no revocation effect.

There is **no bearer-response replay cache**.

Each issuance may create a new revocation-only capability; previously issued capabilities remain valid only to revoke that same family until its absolute expiry. This allows an older device bundle to retire its family after an interrupted rotation.

Every asynchronous callback carries environment, account, session, local transition epoch and credential generation. Recheck after awaited storage/network calls and immediately before dispatch or applying results. Preserve the M1b fix that prevents fetch after transport closure during token lookup.

Durable local authorization must remain separate from rotating credentials and encryption keys. I recommend a protected record containing:

```text
version, environment, installInstanceId, accountId, storeId,
localEpoch, state, verifiedSessionId, verifiedAt
```

Its state is `authorized` or `locked`. It is created only after real activation and identity confirmation. Opening a store additionally requires its matching encrypted ownership metadata, matching authorization epoch and encryption key.

Use an authorization latch inside SQLCipher as well as the protected authorization record. Both must agree before records become accessible. On logout/switch, invalidate the in-memory epoch immediately, stop senders, clear visible state and durably lock a latch before reporting completion. A partial transition produces disagreement and therefore stays locked on restart. On verified return, update the two records in an order where intermediate states remain locked.

This is application recovery logic, not a claim that SQLite and Keychain share an atomic transaction.

| Device condition | Required behavior |
|---|---|
| Ordinary access/refresh expiry | Continue local logging with valid durable authorization; pause sync |
| Missing/corrupt rotating credentials, intact independent local authorization | Require sign-in for sync; never reconstruct tokens; local logging may continue |
| Contradictory owner/account bindings | Lock; require verified recovery |
| Missing/corrupt local authorization | Lock retained records until fresh identity verification |
| Explicit logout or switch | Lock old store, retain pending work and its key; retry server revocation separately if offline |
| Confirmed revocation | Lock immediately when learned; no claim of instantaneous offline detection |
| Missing/wrong encryption key | Preserve files; report inaccessible records; never create a replacement over them |
| Device locked / protected storage unavailable | Pause access and retry after unlock; do not interpret temporary unavailability as deletion |
| Reinstall or restore | Require a matching installation marker and fresh verification when absent/mismatched |
| Local save failure | Preserve draft/retry intent; never show “Saved” before commit |

Keep `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; do not add mandatory biometrics. Expo documents that Keychain entries can survive reinstall, that this is not a reliable recovery guarantee, and that device-only accessibility prevents migration to another device. An app-container installation marker must therefore be excluded from backup and checked alongside Keychain state. [SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/)

Close or suspend database access when protected data becomes unavailable; a previously opened connection must not bypass the intended locked-device behavior. Confirm this natively rather than assuming a SecureStore flag closes SQLCipher.

If **all** durable lock writes fail, the app can hide data immediately but cannot honestly promise crash-safe logout. Show a specific failure, block account switching, retry persistence and avoid claiming completion. That limitation must be tested explicitly.

The PostgreSQL changes should be forward migrations:

- Add account status and authorization epoch.
- Add unique provider identities keyed by configured provider namespace, issuer and subject.
- Add challenges and fenced exchange attempts.
- Add session families with status, generation and absolute/inactivity deadlines.
- Add credential-generation records containing token hashes, refresh consumption operation IDs and revocation hashes.
- Retain encrypted Apple refresh credentials for periodic validation and eventual provider revocation, with encryption-key version metadata.
- Add minimal, sanitized authentication audit events.

Keep migrations `001` and `002` unchanged. A later migration can generalize the synthetic-only account environment constraint to an explicit allowlist, without updating existing account values. The historical `m1b` schema name can remain temporarily; renaming it is not a security requirement.

A separate real-auth database bootstrap must omit fixture seeds and verify its exact environment marker. The existing M1b setup script must continue refusing other targets. Do not repurpose its retained synthetic development database.

Bearer lookup before a transaction may discover a **candidate** account/session. It cannot grant authority. Replace `verifyBearer(): accountId` with an internal principal context and revalidate it under the existing account guard:

```text
BEGIN
  establish transaction-local owner context
  lock account
  lock relevant session rows in stable order
  verify account/session status, token generation and expiry
  claim operation or read owned records
  commit domain state + history + terminal outcome
COMMIT
```

The order remains account → auth sessions → operation/attempt claims → aggregates. Apply it to commands, receipt lookup, identity, profile/session reads, activation, refresh and logout. Use one checked-out PostgreSQL client throughout each transaction. Keep provider HTTP outside locks and recheck the captured generation before applying its result. [node-postgres transactions](https://node-postgres.com/features/transactions)

Retain forced RLS and owner-qualified queries. Runtime roles must not own tables or have `BYPASSRLS`. Give pre-authentication token lookup a narrow authentication repository/privilege boundary; it must not expose athlete reads. New grants must not leave account environment freely mutable by ordinary runtime paths. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

The resulting race semantics are precise:

- A command that obtains the guard before logout may commit; logout then revokes.
- A command obtaining it after logout is rejected before domain work.
- Refresh and logout serialize; a late refresh result cannot revive a revoked family.
- A read authorized before revocation may already be in flight. Client generation checks suppress stale presentation after a local account transition.
- An old command committed before credential loss is recovered under fresh authorization using its original operation ID.

Apple standing checks should occur when due during session renewal, with a short database claim preventing duplicate provider calls. A provider outage pauses renewal; it is not proof of revocation. A definite invalidated provider credential retires the linked FitQuest families and requires fresh verification. Apple recommends refresh-token verification no more than once daily and native credential-state checks for account changes. [Apple verification guidance](https://developer.apple.com/documentation/signinwithapple/verifying-a-user)

The concise threat/failure matrix is:

| Threat or failure | Control and required evidence |
|---|---|
| Forged identity / token substitution | Signature, issuer, audience, nonce and exchanged-subject agreement tests |
| Replayed challenge / concurrent exchange | Exclusive fenced claim; one provider exchange; no late finalization |
| Lost exchange response | Fresh sign-in; inaccessible pending family expires |
| Lost refresh response | Same operation returns reauthentication; no secret replay |
| Stolen refresh token reused | Different operation revokes only the matching family |
| Logout racing with private work | Account-guard ordering and real PostgreSQL race tests |
| Late response after account switch | Epoch/session/generation checks before effects |
| Fixture promoted to real identity | Separate namespaces, entrypoints, database markers and Release exclusions |
| Keychain/SQLCipher failure | Fail closed without deleting pending records |
| Apple/JWKS outage | Bounded failure; existing authorized local logging retained |
| Offline remote revocation | Detect when connected/notified; disclose the unavoidable delay |
| Sensitive diagnostic leakage | Redaction tests including provider errors and malformed inputs |

External setup should remain a later, separately authorized task. Required **non-secret** configuration is:

- Confirmed Apple Team ID.
- Approved bundle identifier; `com.fitquest.rebuild` is currently only a tracked placeholder.
- App ID with Sign in with Apple enabled, including an explicit primary/grouped choice.
- Sign in with Apple Key ID and associated primary App ID.
- Exact native client ID/audience allowlist per environment.
- Signing team, valid signing certificate/profile and approved test-device registration.
- API environment identifier and exact HTTPS origin.
- Test device/iOS version and consenting test-account arrangements.

Native configuration needs `ios.usesAppleSignIn`, the Expo authentication plugin and the resulting `com.apple.developer.applesignin` entitlement. Inspect the signed binary and embedded provisioning profile later; app configuration alone is insufficient. [Expo configuration](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/)

The Apple `.p8` signing key belongs only in approved server secret storage, with a protected operator backup. Generate short-lived client-secret JWTs server-side; recommend five-minute validity. Rotate by introducing and testing a second key, switching issuance, then retiring the prior key. Apple allows two keys per primary App ID. Keep provider-token encryption keys separately versioned so rotation does not strand retained credentials. [Apple key configuration](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key)

A Services ID and browser return URL are not prerequisites for this native-only iOS flow; introduce them when a web/Android authentication path is actually scoped. A hosted notification endpoint is likewise a later configuration gate. [Apple environment configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple?changes=_5)

For the first phone test, recommend an explicitly approved **HTTPS reverse proxy to the real-auth local API**, restricted to the chosen private network/device, using a device-trusted certificate. Keep PostgreSQL on its Unix socket and the fixture API on loopback. Document the hostname, listener, firewall scope, certificate trust and teardown before authorization. Use a build with embedded JavaScript where practical to avoid adding Metro exposure to this gate.

Do not substitute the phone’s `127.0.0.1` for the Mac, disable certificate validation or add blanket ATS exceptions. If local certificate/network setup is unsuitable, a separately approved Render staging deployment is the alternative. [Apple transport security](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity?changes=_2_8&language=objc)

None of these prerequisites has been verified in an Apple account or on a phone.

The UX can reuse the approved screens:

| State | Minimal user-facing behavior |
|---|---|
| Sign-in cancelled | Return quietly to sign-in |
| Apple/API unavailable | “Couldn’t sign in. Try again.” Existing locally authorized logging remains available |
| Credential persistence failed | Do not claim sign-in success; allow retry while the received bundle remains recoverable |
| Ordinary expiry | “Saved on this device · Sign in to sync” |
| Offline logout | “Signed out on this device · Server sign-out pending” only after durable local lock |
| Pending records after logout | Explain that they remain locked to the original account |
| Verified return to same account | Reopen its existing store and recover the queue |
| Verified different account | Open only that account’s store |
| Key/ownership failure | Explain that retained records cannot currently be opened; offer recovery, not reset |
| Confirmed revocation | Require sign-in; retain records under the accepted policy |

Use the native Apple button. Do not request email or full name merely to populate the optional nickname. Native Apple sign-in uses the device’s Apple account, so “switch account” must not promise an arbitrary account picker. Two-user physical testing may require two devices or separately authorized OS account changes. [Apple authentication behavior](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple)

No new screen design is necessary before the first increment. Later rendered review should check the distinction between “sign in to sync” and “records locked.”

Engineering should proceed in serialized increments, each separately reviewed:

| Increment | Scope and relevant paths | Acceptance and stop condition |
|---|---|---|
| **M1c.1 — Contracts and recovery coordinator** | New auth contracts under `rebuild/packages/contracts/src/`; pure coordinator and injected ports under `rebuild/apps/mobile/src/auth/` | Deterministic transition/crash tests; runtime behavior unchanged; no dependencies, migrations or provider calls. Stop for review |
| **M1c.2 — Account/store boundary separation** | `access.ts`, `accountTransitions.ts`, `store.ts`, `sync.ts`; isolated fixture adapters | Real UUID ownership supported through test ports; dual-latch locking and namespace negatives; preserve all drafts/outcomes/migration regressions. No live sign-in |
| **M1c.3 — Transactional sessions** | API auth repository, `repository.ts`, forward migrations, guarded local-auth test setup | Real PostgreSQL activation/refresh/logout/race/RLS tests using synthetic provider identities; retained M1b databases untouched |
| **M1c.4 — Apple verifier and API wiring** | API provider adapter, auth routes, normal entrypoint, manifests/examples | Generated-key/JWKS tests, fake provider exchange failures, compiled-runtime compatibility, redaction/rate limits; default API rejects fixtures |
| **M1c.5 — Native credential and UI wiring** | Mobile auth adapters, `App.tsx`, app configuration | Simulator SQLCipher/SecureStore/restart faults, expired-local logging, locked transitions, Debug/Release exclusion. No signing or phone setup without authorization |
| **M1c.6 — Approved Apple/device integration** | Authorized Apple configuration and transport; physical build evidence | Actual Apple exchange, activation, renewal, cancellation, revoke, lock/unlock, restart and two-account isolation over HTTPS |
| **Later hosted gate** | Separately approved Render service/database configuration | TLS/proxy behavior, production-role isolation, secrets/rotation, migration and restore evidence; no claim based on local tests |

**The smallest useful first Engineering task is M1c.1.** It should encode the wire schemas and pure credential coordinator with fake clock, storage and transport ports. Test every recovery boundary—including same/different refresh operation IDs, lost responses, failed readback, activation expiry and late results after switching. This makes the next implementation steps executable without inventing semantics.

For local checks, retain `npm run check` from `rebuild/`. PostgreSQL changes must additionally run the retained `npm run test:pg` suite and a separately guarded new auth integration suite. Baseline counts are a minimum regression inventory, not a reason to freeze test totals.

Native tests must exercise actual SecureStore and SQLCipher; the existing Node SQLite harness does not establish native encryption or Keychain durability. Real-provider evidence requires actual Apple exchange. Expo explicitly states that `getCredentialStateAsync` must be tested on a physical device and errors in the simulator. [Expo testing limits](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/)

Before accepting private-data use, refresh dependency auditing and resolve or explicitly review the tracked transitive `uuid` advisory through a compatible SDK 57 path. Do not apply the previously suggested forced Expo downgrade. Before public release, complete deletion/export/retention, operational restore and rollback, signing/distribution, accessibility and measured-cost gates.

One policy distinction needs explicit later review: **FitQuest session logout is not Apple consent withdrawal or account deletion.** Apple’s deletion guidance includes provider-token revocation and data-removal responsibilities. The accepted retention of interrupted local work cannot silently become a permanent retention policy for deletion events. Implement revocable session plumbing now; settle event-specific deletion behavior before shipping that workflow. [Apple deletion and revocation guidance](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple?changes=__5_6&language=objc)

M1c advances AC-01, AC-05 and AC-10, preserves AC-04, and provides outage evidence for AC-11. It does not complete AI-context isolation, plan publication, nutrition or adaptive coaching. HealthKit remains deferred under AC-06. The current brief also supersedes the old $40 Render ceiling; this local first increment needs no new paid service, while hosted costs and the still-unspecified AI allowance belong to their later approval gates.

**No owner-specific information blocks M1c.1.** Approval of this proposal and that bounded implementation scope is sufficient; Apple identifiers, signing and phone transport can wait for their actual gate. All cited external guidance was checked on September 25, 2026.
