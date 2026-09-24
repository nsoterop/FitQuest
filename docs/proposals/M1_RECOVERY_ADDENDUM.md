# FitQuest — M1 Recovery Addendum (Source Snapshot)

Captured by Project HQ: 2026-09-23. Source: task **Architecture**, ID `01a0d09d-2bf8-79e0-8a59-6b4043aa18f5`, completed turn `01a0d0e2-cb28-7f02-bd5d-060170306cc8`.

Status: **Recovery clarifications accepted by HQ as the technical baseline for future scoped M1 work; not implemented or runtime-verified.** See [follow-up review](../reviews/FOLLOWUP_REVIEW.md). This addendum takes precedence over conflicting recovery/refresh statements in the [original proposal](M1_ARCHITECTURE_PROPOSAL.md), including its encrypted refresh-response replay window. Exact token/activation durations, adapter/encryption configuration, and operational limits remain to be settled in the relevant implementation handoff. No hosted changes, Apple configuration, or M1 implementation are authorized by this snapshot.

## Original Architecture response

**This addendum closes the three recovery gaps without changing M1’s product scope.** I read the clarification request, HQ review, source proposal, and current DECISIONS/HANDOFF documents completely. No files or external state were changed; no runtime tests were run.

The recommendations below amend the [M1 proposal](M1_ARCHITECTURE_PROPOSAL.md). In particular, I recommend replacing its two-minute encrypted refresh-response replay mechanism with the simpler recovery policy described below.

**Outbox recovery must distinguish a failed operation from an operation whose outcome is unknown.**

Keep command content immutable. Store delivery state, dependency links and replacement links separately:

| State | Meaning and permitted transition |
|---|---|
| `queued` | Eligible only after prerequisites and predecessor acknowledgement |
| `sending` | One request in flight for this aggregate |
| `outcome_unknown` | Timeout, crash, malformed response or interrupted acknowledgement; retry the identical operation |
| `acknowledged` | Validated committed receipt durably recorded locally |
| `blocked` | Definite rejection/conflict, or dependency on a blocked operation |
| `superseded` | Explicitly replaced or discarded through a committed local resolution; never send again |

A missing receipt does **not** prove a request failed: an earlier request might still commit. Do not replace an operation with an unknown outcome until its terminal outcome is recovered. Offline edits can continue while this is unresolved.

Extend the existing operation lookup to return a terminal outcome:

```ts
type OperationOutcome =
  | { state: "committed"; receipt: CommandReceipt }
  | { state: "rejected"; error: ApiError };
```

For authenticated, well-formed commands, persist domain rejection outcomes alongside their request hash. This includes revision conflicts, validation failures and missing-profile prerequisites. Repeating the same operation returns its original outcome; changed content returns `409 OPERATION_ID_REUSED`. Malformed envelopes and authentication failures make no domain changes.

For the required example:

```text
Server revision: 3
A: expectedRevision 3
B: expectedRevision 4, depends on A
```

- **A commits:** acknowledge revision 4, then send B unchanged.
- **A definitely fails:** block A and B. Server revision remains unchanged by A. Never send B expecting 4.
- **A’s response is lost or malformed:** mark A `outcome_unknown`; B stays paused. Retry A unchanged or recover its outcome.
- **A conflicts because another client advanced the server:** block the chain and retrieve the current owned snapshot.

Recovery uses the **latest local projection**, including B’s edits—not merely A’s payload:

1. Obtain a definite outcome for every dispatched operation being replaced.
2. Fetch the current server snapshot/revision.
3. Review local intent against that snapshot and the last acknowledged base. Correct invalid fields; resolve conflicting changes explicitly.
4. In one SQLite transaction, check that the local edit sequence and account generation still match the reviewed version.
5. Mark the old blocked chain `superseded`, retaining original commands, outcomes and local revisions.
6. Create replacement C with a new operation ID, the fetched server revision and the reviewed merged snapshot.
7. Commit replacement links and the local projection together.

If the server is still at revision 3, C expects 3. If another writer advanced it to 5, C expects 5. A later server change can conflict again; there is no force-save bypass.

This is **recovery-only consolidation**, an explicit exception to the proposal’s prohibition on routine command coalescing. Old local history remains available. Adopting the server version also requires explicit resolution; local edits are retained as superseded history rather than silently erased.

While resolution is open, new input creates durable local revisions but no dispatchable successors. If another edit arrives before resolution commits, the local compare-and-swap fails with `LOCAL_RESOLUTION_STALE`; re-review the updated projection. This prevents an older resolution screen from overwriting newer work.

A rejected initial profile blocks session chains that depend on setup. Correct and acknowledge the profile first, then rebuild those chains against their actual server revisions—zero for a session that does not exist. Failed edits to an already established profile do not automatically block unrelated session logging.

**Credential recovery should use durable client state, a short activation step, and fresh sign-in when credentials are unrecoverable.**

Apple authorization codes are single-use. PostgreSQL, Apple and SecureStore cannot participate in one atomic transaction. Treat the boundaries explicitly rather than blindly retrying an exchange. [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)

Add a restricted credential state and one endpoint:

```text
pending_activation → active → revoked / expired

POST /v1/auth/activate
Authorization: Bearer <new access token>
```

Newly issued credentials—including rotated credentials—have a proposed five-minute activation deadline. Before activation, they can only activate or revoke their FitQuest session; they cannot access athlete endpoints or refresh.

Activation is idempotent for the same session and credential generation. It returns no new secrets. Extend `FitQuestSessionResponse` with `credentialGeneration` and `activationExpiresAt`.

This adds one small confirmation operation while avoiding storage and replay of encrypted bearer-token responses. The five-minute value is a proposed engineering default, not an owner-approved lifetime policy.

Initial Apple exchange proceeds as follows:

```text
Challenge:
issued → exchanging → completed
                    ↘ failed / expired
```

- Validate the identity token and challenge binding.
- In a short transaction, exclusively claim the challenge with an attempt identifier, request digest and deadline. Commit before contacting Apple.
- Only that claimant may exchange the authorization code. Concurrent duplicates receive `409 AUTH_EXCHANGE_IN_PROGRESS`; a different digest receives `409 AUTH_CHALLENGE_REUSED`.
- Once claimed, never return the challenge to `issued`. A crashed or timed-out attempt requires a new Apple authorization.
- Call Apple without database locks.
- Finalize only if the attempt still owns the claim and remains within its deadline. Atomically resolve the internal identity, create the pending session, and mark the challenge completed.
- A late provider response cannot finalize an expired or replaced attempt.

Failures have explicit outcomes:

| Failure | Recovery |
|---|---|
| Apple succeeds, API fails before commit | No usable FitQuest session; return/recover `AUTH_REAUTH_REQUIRED`; obtain a new challenge and authorization code |
| API commit outcome is uncertain | Do not exchange the code again; require fresh sign-in. Any committed pending session expires without activation |
| Session commits, response is lost | Fresh sign-in; no credential replay endpoint. Unclaimed session remains unusable and expires |
| Credentials arrive, SecureStore write fails | Do not activate or claim sign-in success. Retry persisting that same bundle while still available and before expiry |
| Process dies before credentials persist | Fresh sign-in; account and SQLite records remain intact |
| Credentials persist, activation response is lost | Retry activation with the stored credentials; an already active matching generation returns success |

Separate challenges for the same Apple identity may create separate legitimate sessions. A uniqueness constraint maps them to **one internal account**. Concurrent account creation must roll back the losing creation transaction completely and resolve the winning identity; it must not leave an extra account.

Pending-session expiry is enforced during authorization even if cleanup has not run. Cleanup later marks those sessions expired. It does not delete athlete accounts or offline data.

On the device, use one small versioned SecureStore record per account/environment containing the credential bundle and recovery phase:

```text
stable
  → refresh_prepared(operationId, old bundle)
  → activation_pending(new bundle)
  → stable
```

Before sending refresh, persist `refresh_prepared` and read it back successfully. After receiving credentials, persist the complete new bundle as `activation_pending` and read it back before activation. Only then may synchronization resume.

Do not split tokens, generation and recovery phase across independently updated keys. A missing, corrupt or inconsistent record leads to reauthentication; do not reconstruct credentials from partial values. SecureStore writes can fail, and its persistence behavior is not a substitute for application recovery logic. [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)

Refresh behavior is deliberately conservative:

- Single-flight refresh on the client.
- The server atomically records the refresh operation, consumes the old refresh token, invalidates old access credentials and installs the new pending generation.
- If the database rolls back, the old token remains current; the same request can retry.
- If rotation committed but the response was lost, retrying the consumed token with the same operation ID returns `401 AUTH_REAUTH_REQUIRED`. It never returns bearer credentials.
- Reuse of that consumed token with a different operation ID revokes the family and returns `401 SESSION_REVOKED`.
- Unknown tokens return a generic authentication error and cannot revoke an unrelated session.
- A delayed duplicate of the same completed operation does not itself revoke a successfully activated generation.

There is **no refresh-response replay window** under this amendment. The only short recovery deadline is activation. If the replacement bundle is stored, retry activation before expiry. If only `refresh_prepared` survives, retry the same refresh operation: either the original never committed and can now succeed, or the server requires fresh sign-in. Never invent a new refresh operation ID for the consumed token.

On expiry, require fresh sign-in and use the existing revocation-only capability to retire the previous family when available. Fresh sign-in must resolve the same verified internal account before its outbox resumes. Signing into another account leaves the original records locked to their owner.

Keep database encryption keys separate from disposable authentication credentials. Reauthentication must not erase or regenerate the key for a database containing pending work.

**All account-bound transactions should use one consistent lock order.**

For M1, choose a short **per-account transaction lock**. This intentionally serializes mutations within one athlete account, including operations on different sessions. It removes unnecessary lock complexity at M1’s scale; different accounts remain independent.

Acquire locks in this order:

1. Account row.
2. Authentication-session rows, ordered by ID if more than one.
3. Operation/attempt claims, ordered by namespace and ID.
4. Domain aggregates, ordered by kind and ID.

Token lookup before the transaction only discovers a candidate account/session. Revalidate token generation, expiry, revocation and ownership after acquiring the guards. Establish transaction-local owner context before athlete queries.

Logout, refresh, activation, session expiry and authenticated commands follow this same ordering. Relevant private reads must also revalidate authorization under the guard. No path locks a session or operation and then reaches backward for the account lock.

For commands, claim the **account-wide operation ID before touching the target aggregate**. Store the target identity and canonical request hash with its outcome:

- Same account, ID and hash: return the recorded outcome.
- Same account and ID, different session/payload: `409 OPERATION_ID_REUSED`.
- Rejection: commit only the operation outcome; no domain revision change.
- Success: commit aggregate state, immutable revision and operation outcome together.

Thus, if the same operation ID races across sessions X and Y, the first terminal claim wins. The loser receives the documented 409 before any change to its target session. Keep the unique database constraint as a second guard.

Apple challenge claiming is a separate transaction that touches only the challenge. Provider-identity creation is another short bootstrap transaction with uniqueness enforcement. Neither holds locks while entering the account-bound finalization transaction. Finalization rechecks the challenge’s attempt/deadline under the ordering above.

Provider HTTP requests—including Apple verification during refresh—always occur outside these transactions. Capture the relevant generation beforehand, then revalidate it when committing the result. Concurrent revocation or rotation makes an obsolete provider result unusable.

Use one PostgreSQL client per transaction. On deadlock, lock timeout or connection loss, roll back or treat commit as unknown; retry/recover the same operation ID. Consistent ordering reduces deadlocks but does not eliminate the need for recovery. [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html), [node-postgres transactions](https://node-postgres.com/features/transactions)

Required crash/race acceptance tests are:

| Scenario | Required evidence |
|---|---|
| Revision 3; A expects 3, B expects 4; A rejected | B never sends; latest local edits survive; replacement uses actual server revision |
| A committed but acknowledgement lost/malformed | Exact retry yields original receipt; one effect; B starts only after durable acknowledgement |
| Conflict resolution plus a concurrent local edit | Stale resolution fails; newer input remains; replacement IDs and links survive restart |
| Initial profile rejection | Dependent sessions remain local; corrected profile acknowledgement precedes valid replacement chains |
| Crash before/after replacement transaction | Either old blocked chain or complete replacement exists—never a partial mixture |
| Two concurrent Apple exchanges for one challenge | At most one upstream exchange; no duplicate pending session |
| Apple success followed by API/commit failure | Fresh-sign-in path; no usable unactivated orphan; same verified identity resolves existing account |
| Credential write failure/crash at each phase | No activation before successful persistence; no false signed-in state; SQLite/outbox unchanged |
| Refresh before commit, after commit, after response, after storage | Each restart follows the recorded phase; consumed token never issues another generation |
| Expired activation; stale refresh; late responses after account switch | Reauthentication/revocation as specified; no cross-account activation or replay |
| Same account-wide operation ID races across X/Y | Exactly one terminal claim; other request gets 409; no loser revision or partial audit rows |
| Logout races with command/refresh/activation | A transaction ordered before logout may finish; one ordered after revocation cannot authorize |
| Provider call stalls while logout runs | Logout is not blocked by provider HTTP; stale provider result cannot finalize |
| Transaction failure at every write boundary | Aggregate, revision and success outcome commit together or all roll back; pooled owner context does not leak |

These tests support the existing AC-01/05/10 and outage-related AC-11 mapping; they are **required evidence, not tests already passed**. SecureStore and native restart behavior require the actual adapter, with physical-device authentication still a separate gate.

No owner choice is needed for these low-level recovery mechanics. HQ can accept or amend them in the Engineering handoff. Apple configuration/signing and physical-device network access still require separate authorization. **The addendum is complete and implementation remains unstarted; stopping for HQ review.**
