# FitQuest — Provider-Credential C1 Clarification

Captured by Project HQ: 2026-10-01. Source: Architecture chat `01a0d09d-2bf8-79e0-8a59-6b4043aa18f5`, turn `01a0f89e-bf02-7570-bb25-e9e5b7e274c4`, final message `msg_0c050bd6f250a70b016abe9faa2d9087d18b98b577494f7260`.

Status: clarification delivered; residual active-access policy and additive contracts are **proposed, not approved for implementation**. This does not block the isolated protection module. See [HQ review](../reviews/PROVIDER_CREDENTIALS_ARCHITECTURE_REVIEW.md).

## Original Architecture response

**C1 clarification — proposed policy:** an ambiguous Apple `invalid_grant` blocks renewal and first activation, but **does not immediately invalidate an already-active, otherwise-valid FitQuest access generation**. Its existing expiry remains unchanged—currently a maximum fifteen-minute access lifetime.

This replaces the proposal’s statement that ambiguous rejection immediately denies all affected server access. **It is a product-policy recommendation requiring approval before standing/session integration**, not an already-approved consequence of D-012.

Apple’s TN3107 distinguishes client mismatch and invalid/expired refresh material; those possibilities do not establish consent withdrawal. Rechecked **2026-10-01**. The accepted code-exchange transport’s coarse rejection remains insufficient standing evidence. [Apple TN3107](https://developer.apple.com/documentation/technotes/tn3107-resolving-sign-in-with-apple-response-errors?language=objc)

**One consistent access matrix.** “Active” means the presented generation is current, activated, unexpired and passes account, epoch, ownership and revocation checks. Pending generations never authorize private reads/commands or active identity. An activation retry for an already-active generation is an idempotent acknowledgement, not first activation.

| Condition | Private reads/commands | Identity | Pending activation | FitQuest refresh | Durable local access |
|---|---|---|---|---|---|
| **Ambiguous grant rejection**, applied through a valid standing-check fence | Existing active generation continues until its original expiry. Pending denied. | Active identity succeeds, reporting renewal blocked. Expired/pending credentials cannot obtain active identity. | First activation denied: fresh authentication required. Already-active retry can acknowledge the still-valid generation. | Denied without consuming the FitQuest refresh token or issuing another generation. | Previously authorized local access continues, including after ordinary expiry. No new unlock solely from this outcome. |
| **Confirmed credential/family revocation**, explicit logout, account disable or applicable security-epoch invalidation | Denied immediately when enforced by the server. | Known bound credentials receive revocation; no active identity. | Denied, including already-active acknowledgements. | Denied; cannot renew revoked authority. | Locks when the client learns the applicable revocation. Pending records/key remain preserved. Offline detection is not instantaneous. |
| **Provider outage, timeout or ambiguous response** | Existing active generation continues. Pending denied. | Active identity remains available when FitQuest’s database/authorization checks are available. | Allowed within the existing deadline if committed standing remains sufficiently fresh; otherwise unavailable. Already-active retry follows active-access checks. | Paused when a required standing check cannot complete. No expiry extension or premature token consumption. | Previously authorized access continues. |
| **Missing provider-encryption key or credential-envelope integrity failure** | Existing active generation continues **if independent account/session metadata remains trustworthy**. Pending denied. | Same independent active-identity checks; never return fabricated revocation. | First activation paused until the protection failure is resolved. Already-active retry follows active-access checks. | Paused with an operational error. Preserve ciphertext; do not mark consent revoked. | Previously authorized access continues. This does **not** apply to corrupt/missing device authorization or ownership state, which stays locked. |
| **Established client/configuration error**, such as incorrect client binding or signing configuration | Existing active generation continues. Pending denied. | Active identity remains available. | Same freshness rule as outage; no activation dependent on the broken configuration. | Pause affected provider operations for operator repair. Do not terminally mark user bindings merely because configuration is wrong. | Previously authorized access continues; do not ask the user to repair server configuration. |
| **Fresh successful sign-in** | New family gains access only after durable bundle storage and activation. Old families retain their previous restrictions. | New active generation succeeds after activation. | New pending family follows normal activation checks. | New family becomes renewable only after activation and normal prerequisites. | Existing authorized access remains; a locked store unlocks only through the accepted verified-owner/activation flow. |

The outage rows concern provider dependencies, not a general FitQuest database outage: inability to establish account/session authority denies server access as unavailable.

**Scope and precedence.** Applying an ambiguous rejection marks the affected bindings **nonrenewable**, rather than revoked. Every family sharing that exact credential receives the same renewal restriction, but each active generation retains only its own remaining lifetime. Other credentials belonging to the account are unaffected. Pending bindings require fresh sign-in.

Confirmed credential-specific revocation covers its linked families; verified identity-wide consent withdrawal covers the verified identity/application scope. Ordinary family logout remains family-only.

Classification order must be:

1. Validate request and establish the presented credential’s trusted family binding. Unknown credentials or fresh sign-in failures cannot produce `SESSION_REVOKED` for another family.
2. Enforce explicit logout, account disable, applicable epoch invalidation and confirmed revocation. These override provider success, unavailability and ordinary expiry.
3. Preserve existing generation/replay enforcement. A consumed refresh token reused with a different operation still revokes its family; the same completed operation retains its existing recovery result.
4. Enforce current generation, active/pending state and endpoint-specific deadlines.
5. Apply provider prerequisites only to operations that create or extend authority. Ambiguous rejection blocks those operations; it does not override valid residual active access.

A demonstrable client/configuration failure is operational, not credential revocation. If the cause remains unresolved, classify it as ambiguous rejection. Later diagnosis must not silently resurrect bindings already made nonrenewable; recovery uses a new sign-in/family.

**Required additive contract/coordinator work.** The present coordinator maps generic `reauth_required` to `syncReady: false`. That cannot express the recommended residual-access policy.

For the later integration increment:

- Add a distinct **`AUTH_RENEWAL_REQUIRED`** outcome for a current active binding whose renewal is blocked. On refresh, this outcome guarantees that the request **did not consume the FitQuest refresh token or commit a new generation**. Keep generic `AUTH_REAUTH_REQUIRED` for lost-secret recovery, expired/noncurrent credentials and denied first activation.
- Add a strict session-status response containing the existing identity plus renewal status: `allowed`, `reauth_required` or `temporarily_unavailable`. Preserve `ActiveIdentitySchema` as the identity value rather than silently changing its meaning.
- Add a versioned persisted “active, renewal blocked” state tied to the exact environment/account/family/generation. Preserve its bundle, expiry and operation provenance. The coordinator may keep synchronization enabled only with valid local authorization and a confirmed current active generation.
- Extend activation outcomes to distinguish reauthentication required from unavailability. Operational failures must not invoke the local revocation-lock path.
- Do not infer usable residual access from a timeout or generic error. An unresolved refresh may already have committed. Preserve existing recovery and operation-ID rules; obtain current identity evidence before resuming use of an uncertain generation.

These changes require focused contract, persistence/restart and coordinator tests. They are outside the unused encryption module.

**Race rules.** Standing results apply only after rechecking their attempt fence, credential material version and account/identity epochs under the account-first transaction guard. Family issuance additionally checks the exact binding and FitQuest generation.

- If ambiguous rejection commits first, a competing refresh cannot issue another generation.
- If refresh commits first, the old access generation stays consumed. A subsequent valid rejection blocks first activation of the new pending generation; it never restores the old generation.
- If activation commits before rejection, that now-active generation retains its original expiry under the proposed policy. If rejection commits first, first activation fails.
- Confirmed revocation/logout wins against every later success. A command that already committed before revocation retains the existing serialization semantics.
- A shared credential’s standing result may affect other currently linked families even if the triggering family logged out, provided the credential-level fence remains valid. It cannot revive the logged-out family.
- Fresh sign-in creates a new binding. Even when Apple returns identical token bytes, it cannot clear old bindings’ revoked/nonrenewable states. Late responses for replaced material are discarded; encryption-only rewrapping does not change authority.

**Approval needed:** adopt residual active access after ambiguous rejection, with no renewal, no first activation and no extension of expiry, while preserving previously authorized local logging. Immediate server suspension would be a different product policy; neither is dictated by Apple’s error code.

C1 blocks later standing/session integration only. The unused protection-module direction remains unaffected. No files, Git state, databases, credentials or application behavior were changed. Stopping for HQ review.
