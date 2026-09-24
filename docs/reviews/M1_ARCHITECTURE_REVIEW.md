# M1 Architecture — Project HQ Review

Date: 2026-09-23 · Status: initial findings retained; recovery clarifications subsequently closed at design level

Follow-up: HQ accepted the [recovery addendum](../proposals/M1_RECOVERY_ADDENDUM.md) on 2026-09-23. See [FOLLOWUP_REVIEW.md](FOLLOWUP_REVIEW.md) for closure, evidence limits, and next steps. The requests below document the original review, not still-outstanding clarification work. Their failure/race tests remain required during implementation.

## Assessment

Architecture completed the requested read-only proposal. The [source snapshot](../proposals/M1_ARCHITECTURE_PROPOSAL.md) preserves the full contracts and rationale. No M1 code or verification evidence was produced. M0 remains the last accepted implemented milestone.

The direction fits the approved scope: one versioned session can contain strength and timed results; local capture and its pending command commit together; the API commits server state, revision, and retry receipt together. Owner-scoped storage, truthful save states, explicit conflicts, and production-versus-fixture authentication are appropriate boundaries. React Native and the Apple Health deferral remain intact.

This is not wholesale approval of SQLCipher configuration, session/token lifetimes, receipt windows, operational size limits, retention, or recovery policy. Those remain proposed technical choices to settle in the relevant handoff. No hosted/Apple-account/network-boundary changes are authorized.

## Required clarification 1 — Dependent outbox recovery

The proposal assigns expected revisions in advance and preserves immutable commands. It explains successful retries and conflict display, but does not fully specify what happens to every later queued command when an earlier command is rejected, superseded, or discarded.

Example to resolve: server revision 3; local commands A and B expect 3 and 4. A fails validation without advancing the server. B cannot simply proceed against revision 4. Likewise, replacing A after a conflict may invalidate B's payload/base assumptions.

Architecture should supply a small state-transition/recovery contract defining which descendants pause, which are superseded, how reviewed local intent is preserved, and how replacement commands receive valid bases and new IDs without mutating old commands. Preserve restart recovery and later edits made while conflict resolution is open. Include profile-prerequisite rejection and malformed/lost success responses in the test cases. Do not silently drop pending work or use last-write-wins.

## Required clarification 2 — Sign-in and credential persistence recovery

The proposal covers a short replay window for refresh rotation, but initial Apple exchange response loss and client credential-storage crashes need equally explicit outcomes. Apple's authorization code is single-use, so a blind retry after upstream success is not a complete recovery strategy. [Apple token validation](https://developer.apple.com/documentation/SigninwithAppleRESTAPI/Generate-and-validate-tokens?changes=_7&language=objc)

Specify safe behavior when Apple succeeds but the API cannot commit, the API commits but the phone misses the response, or the phone receives new credentials but cannot durably store them. Define challenge consumption, orphan-session handling, and either narrowly authenticated receipt recovery or an explicit fresh-sign-in fallback. The existing account and pending records must survive; a client must not claim signed-in state before credential persistence succeeds.

For refresh, specify crash-safe storage of operation ID/current credentials/replacement credentials and the exact restart decision when the recovery window has elapsed. These are contract gaps to close, not demonstrated implementation defects: no auth code exists yet.

## Additional implementation acceptance notes

- Declare a consistent lock order across authorization/revocation, operation receipts, and aggregates. Exercise reuse of an account-wide operation ID across different session aggregates, not only repeated edits to the same session. Map the losing race to the documented error without leaking records or committing a second effect.
- Keep provider HTTP calls outside long-lived PostgreSQL transactions. Test transaction-local owner context and pooled-connection reuse with the non-owner runtime role; RLS alone is not sufficient when a role can bypass it. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [node-postgres transactions](https://node-postgres.com/features/transactions)
- The proposed exclusive SQLite transaction path and SQLCipher option have official support, but adapter/encryption/key-loss behavior must be tested in the actual native build. SQLCipher is not supported in Expo Go. [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
- Real-device authentication remains a separate gate; Expo's credential-state check cannot be validated in the simulator. [Expo AppleAuthentication](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/)
- M1's timezone/units/nickname setup is an intermediate logging profile, not the completed athlete onboarding experience. Goals, equipment, availability, and broader context remain M2 and must precede acceptance of the adaptive coach.
- Strength and timed results are the first implementation slice, not a permanent restriction to two activity types. Future distance/interval/quality fields must have explicit contract extensions.

## Recommended next sequence

1. A bounded Engineering follow-up verifies the Debug/Metro/Fast Refresh development loop. It is independent of the two contract clarifications.
2. Architecture returns a short recovery addendum, not another full redesign. No stack reopening or implementation.
3. Design proposes the M1 onboarding/logging/save/conflict/account-switch flow, with provisional styling clearly marked unapproved.
4. After review, split M1 implementation into contracts/local capture, disposable local API/database synchronization, and production-path authentication/device verification. Each gets scoped acceptance evidence; fixtures never close the real-authentication gate.

The owner need not choose low-level recovery mechanics. Separate owner authorization is needed later for the bundle identifier/App ID, Sign in with Apple credentials/signing, and a restricted physical-device-to-local-API connection. No such changes were made or requested in this review.

## Review evidence

HQ read the full proposal and active project decisions, inspected current task/Git status, and checked current primary documentation. The Expo networking and PostgreSQL review skills focused this review on durable retry recovery, owner isolation, and short, consistently ordered transactions. No runtime checks were rerun because this task produced no application changes. Documentation checks do not prove these proposed contracts work.
