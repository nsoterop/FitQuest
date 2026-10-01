# FitQuest — Architecture: Protected Provider-Credential Lifecycle

Date: 2026-10-01 · Owner: Project HQ

Status: Owner-authorized next planning step. Assign to existing **Architecture** chat `01a0d09d-2bf8-79e0-8a59-6b4043aa18f5`, retaining model/reasoning settings. **Read-only proposal, not implementation.** Engineering and Design remain idle; HQ owns shared docs and captures the proposal.

## Outcome and verified baseline

Resolve the detailed contract for protecting retained Apple credentials and linking provider status to FitQuest sessions before connecting the accepted code transport to sign-in. Recommend the smallest coherent Engineering increment; avoid expanding this into an identity-platform rewrite or all release operations.

Accepted implementation `2a383a136c4e788e1e0f4b8db25dd70dee19fff5` was pushed to verified private main with a clean worktree. [M1c.4c review](reviews/M1C4C_REVIEW.md) records 423 independently passing tests, three compiled checks and separate concurrency/cancellation probes. Its signer/transport is unused, preserves unverified identity/access/refresh material and makes no account/session assertions. [M1c.4b](reviews/M1C4B_REVIEW.md) supplies a simulated-only challenge/claim/atomic pending-issuance path, not a ready real-provider integration seam. Default API remains health-only. All three test clusters were stopped with data retained. Do not treat generated-key tests as live Apple compatibility or prior credentials/configuration as current.

## Required reading

Read PROJECT_CONTEXT, PRODUCT_BRIEF, DECISIONS, ROADMAP, HANDOFF and DESIGN_SYSTEM, then the [M1c proposal](proposals/M1C_ARCHITECTURE_PROPOSAL.md), [binding review](reviews/M1C_ARCHITECTURE_REVIEW.md), M1c.3/4a/4b/4c reviews and Engineering reports. Inspect current `appleCodeTransport.ts`, `appleIdentityVerifier.ts`, `simulatedAppleSignIn.ts`, `authSessions.ts`, `repository.ts`, shared auth contracts, migrations 001–007 and guarded test scripts under `rebuild/`.

Use current official Apple, Node/JOSE and PostgreSQL sources as needed. Inspect tracked configuration examples only, not private test artifacts, environment secrets, old prototype credentials, Keychain or real athlete records. No database/server startup or tests that mutate state are needed for this proposal.

## Decisions to resolve

1. **Credential ownership and linkage.** Specify the relationship among provider identity, retained credential/version, internal account, exchange attempt and session family. Address multiple devices/families, repeated sign-ins and replacement credentials. Define exactly which families a confirmed provider invalidation may retire, and why. Preserve ordinary local-expiry policy and family-bound revocation classification; do not let one failed code exchange or unrelated credential invalidate another family.
2. **Secret protection and key lifecycle.** Recommend maintained authenticated-encryption primitives, binding metadata, versioned envelopes and narrowly scoped repository access. Separate provider-token encryption keys from Apple signing keys, database credentials and device encryption keys. Define key loading boundaries, active/readable versions, rotation/re-encryption, interrupted rotation, missing/wrong keys and recovery/retirement conditions. Propose a local generated-key test boundary and later hosted secret custody without provisioning anything. Specify which provider material needs retention and which can be discarded, when and why; no silent token loss at the transport boundary.
3. **Atomic issuance and uncertain external outcomes.** Show transaction/lock ordering and how identity verification/pair matching, fenced exchange completion, protected credential persistence and pending-session linkage commit or roll back together. Provider HTTP remains outside transactions. Explain successful external exchange followed by encryption failure, timeout, local rollback or lost response; prohibit authorization-code retries or secret response replay. Identify unavoidable orphan provider grants and the bounded recovery/cleanup policy rather than implying external and database work share a transaction.
4. **Provider standing checks.** Define scheduling triggers/cadence, freshness, claim/fence and captured credential/account versions; duplicate checks, timeouts, process crashes, replacement/rotation and logout races. State which session operations pause when status is unknown and which existing local access remains available. Distinguish definitive provider-credential invalidation from bad client configuration, key failure, transport outage or ambiguous response. The current transport's coarse `provider_rejected` code is not proof of revocation and implements code exchange only; specify any future refresh/validation contract separately.
5. **Logout versus provider revocation/deletion.** Keep ordinary FitQuest family logout distinct from provider consent withdrawal and account deletion. Define eventual provider revocation intent, retry/idempotency and crash behavior without unintentionally revoking another device's access. Identify records needed until external revocation is resolved, retention/cleanup implications, and which account-deletion/product choices remain later gates. Do not silently build the whole deletion feature into the first increment.
6. **Integration and test boundary.** Explain how future real-provider orchestration uses the accepted verifier/transport without promoting `apple_simulated` identities or widening a fixture bypass. Recommend additive migrations/roles/RLS, exact isolated test targeting and failure/race tests as design only. Preserve migrations 001–007 and retained fixtures. No new service/dependency unless a concrete need is justified. Keep React Native/Fastify/PostgreSQL/Render direction; do not reopen stack or hosting selection.

## Deliverable and acceptance

Return the proposal **in the Architecture chat**, without file edits or cross-chat messages. Include concise current-gap evidence; recommended ownership/state transitions and key/envelope contracts; lock and external-call sequence; threat/failure matrix; and small serialized Engineering increments with relevant files, acceptance tests and stop conditions. Clearly label verified facts, proposed defaults and unresolved external compatibility. Cite official sources and checked dates, including the existing Apple documentation discrepancies.

Ready for HQ review means Engineering can implement the first local/offline increment without inventing security or recovery semantics. Identify only genuinely blocking owner choices; use reasoned reversible technical recommendations otherwise. Flag conflicts with accepted policy for explicit review, not silent replacement. Test counts above are HQ baseline evidence, not newly executed Architecture results.

## Authority and stop

Repository inspection and public documentation research only. No file edits, dependencies, Git writes, database start/setup/migration/reset, credential access, actual Apple auth/key/token calls, account configuration, network exposure, native/device/UI work, hosted changes or new task dispatch. No engineering implementation is authorized by this planning handoff. Stop after the proposal for HQ review.

**D-019 remains unchanged:** no product AI code/scaffolding, prompts, goal interpretation, generation, embeddings/agents or evaluation implementation/calls before the owner receives the plan and gives fresh explicit approval.
