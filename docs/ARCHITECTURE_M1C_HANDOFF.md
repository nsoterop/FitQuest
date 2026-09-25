# FitQuest — M1c Authentication and Device Integration Plan

Date: 2026-09-25 · Owner: Project HQ

Status: Completed by Architecture on 2026-09-25; [proposal captured](proposals/M1C_ARCHITECTURE_PROPOSAL.md) and [accepted by HQ with scoped qualifications](reviews/M1C_ARCHITECTURE_REVIEW.md). The owner approved proceeding, and [Engineering M1c.1](ENGINEERING_M1C1_HANDOFF.md) is dispatched. This historical planning assignment does not authorize Architecture to edit source or configure external services.

## Outcome and baseline

Return an implementation-ready, bounded plan for replacing synthetic authority with real Sign in with Apple and revocable FitQuest sessions, preserving accepted local logging/synchronization and the future shared Android path. Recommend the smallest safe first Engineering increment and identify the later configuration and physical-device gates. Avoid expanding M1c into a new platform or delaying the AI-coach milestones with unrelated infrastructure.

Accepted M1b checkpoint: `490f9239614d6f40cc63cbf3010c37ea34ff23a6`, pushed and remotely verified on private `nsoterop/FitQuest`. HQ repeated 49 baseline tests, typechecks, lint, and builds before checkpointing; 9 real PostgreSQL integration tests passed during acceptance. Native Debug/Release and recovery observations are Engineering-reported, not repeated by HQ. No physical-device, production-auth, or hosted evidence exists. Reinspect current source/status; do not inherit old environment or credential claims.

## Required reading and inspection

Read PROJECT_CONTEXT, PRODUCT_BRIEF, DECISIONS, ROADMAP, HANDOFF, and DESIGN_SYSTEM under `docs/`, followed by:

- [M1 proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md), [recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md), and [follow-up review](reviews/FOLLOWUP_REVIEW.md). The addendum takes precedence over the earlier encrypted refresh-response replay proposal.
- [M1b acceptance](reviews/M1B_REVIEW.md), [Engineering report](../rebuild/docs/M1B_REPORT.md), and [rebuild setup](../rebuild/README.md).
- Current `rebuild/apps/mobile/App.tsx`, `src/access.ts`, `accountTransitions.ts`, `store.ts`, `sync.ts`, and related tests/configuration; `rebuild/services/api/src/app.ts`, `repository.ts`, `local-server.ts`, migrations and integration tests; shared contracts and package manifests.

Inspect only relevant tracked configuration/environment examples. Do not open private authority files, Keychain contents, real credentials, prototype environments, or personal athlete records. Use current official Apple/Expo/library documentation for changing behavior and cite it in the proposal. Distinguish repository facts, proposed choices, and unverified external prerequisites.

## Required decisions and deliverables

1. **Implementation gap map:** identify which M1b boundaries can be retained and which must change. Separate the development fixture from real identity end to end, including Release/configuration, storage namespaces, API entrypoints, and transport. Never silently relabel fixture records as a real user's data.
2. **Identity and API contracts:** specify challenge/exchange, verification of provider assertions, internal account mapping, activation, refresh, logout/revocation, and identity lookup. Include request/response/error shapes, replay and cancellation handling, challenge/token binding, signing-key retrieval/rotation, and sanitized diagnostics. Do not trust a client account identifier or email as account authority. Prefer maintained compatible primitives over custom cryptography; justify necessary dependencies against the installed stack.
3. **Credential recovery:** apply the accepted durable credential-bundle and pending-activation model; no bearer-response replay cache. Propose concrete bounded lifetimes, clock tolerance, timeout/rate-limit defaults, and cleanup semantics with rationale. Address single-flight refresh, lost exchange/rotation responses, activation retries/expiry, generation guards, session-family reuse/revocation, and late responses after account switch. Label policy defaults as proposals, not approved production settings.
4. **Local authorization and device lifecycle:** preserve D-012 ordinary-expiry local logging versus explicit logout/confirmed-revocation locking. Explain what constitutes durable local authorization, how a verified account unlocks its own retained database, and how missing/corrupt credentials, missing encryption keys, reinstall/restore, locked-device state, or storage failures recover without erasing pending work. Identify offline revocation limits honestly. Do not silently add mandatory biometric access or change approved local-access policy.
5. **Transactional security boundary:** describe the required identity/session records and forward migrations, integrating session/generation validation with M1b's account guard, RLS, command/receipt transactions, and private reads. Include refresh/logout/command races and provider HTTP outside database locks. Specify revocation semantics rather than relying only on signature/expiry checks. Do not execute migrations.
6. **Apple and device prerequisites:** inventory required non-secret identifiers, capabilities, signing/configuration, server credential custody/rotation, and a secure real-device-to-API transport path. State what is actually inspected versus unknown, what can be tested offline/local now, and what needs separate owner-approved external setup. Do not create Apple assets, invoke signing/provisioning, expose a LAN/tunnel, install on a phone, or provision/deploy anything. Existing Apple Developer membership is not proof of configuration. Render remains intended hosting; avoid a hosting-platform comparison unless a concrete blocker requires one.
7. **Minimal UX contract:** reuse approved sign-in/profile/session direction. Define user-visible states for cancellation, provider outage, credential storage failure, reauthentication, retained pending work, logout, and verified return to the same/different account. Identify only genuine new Design questions; no screen redesign or UI code.
8. **Verification and sequencing:** propose small, serialized Engineering increments with relevant files, acceptance criteria, commands/check types, and stop conditions. Separate local deterministic tests, real PostgreSQL security/race tests, native SecureStore/restart checks, actual Apple identity, physical-device tests, and hosted integration. Tests using generated signing keys or a fake provider do not establish real Apple sign-in. Retain all M1a/M1b regressions, default/Release fixture exclusion, and existing data/migration checks. Track dependency remediation and deletion/revocation/release requirements at the appropriate gate without silently pulling all M4 work into M1c.

## Acceptance and response format

Return the proposal in this task, not as edited files. Include: current gap summary; recommended contracts/state transitions and defaults; concise threat/failure matrix; increment-by-increment acceptance/tests; exact external prerequisites; and only the owner choices that materially block the first increment. Use recommended defaults for reversible technical details and explain tradeoffs. Provide official source links and checked dates. No fabricated test results or claims of configured accounts.

The plan is ready for HQ review when Engineering could begin a bounded local increment without inventing auth/recovery semantics, and each real-provider/device/hosted claim has a distinct evidence gate. If an accepted recovery rule is unsafe or infeasible, identify the conflict and propose an explicit amendment rather than silently replacing it.

## Authority and stop conditions

Read-only repository inspection and official-source research only. No file edits, dependency installation, Git writes, migrations, provider/API exchanges using real credentials, Apple configuration, device install, hosted changes, paid builds, or new task dispatch. HQ owns shared docs and will capture/review the response; Engineering and Design remain idle. Stop after delivering the proposal. The owner's routine commit/push approval remains HQ-owned and does not broaden this planning assignment.
