# FitQuest — Architecture Follow-up: M1 Contracts

Status: Historical assignment completed on 2026-09-23 in **Architecture**. The subsequent [M1c planning assignment](ARCHITECTURE_M1C_HANDOFF.md) is also complete and [reviewed](reviews/M1C_ARCHITECTURE_REVIEW.md); current implementation is [Engineering M1c.1](ENGINEERING_M1C1_HANDOFF.md). The original assignment below reflects its historical scaffold state, not today's implementation inventory. Its [proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md) and [recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md) remain the prior design baseline. No implementation is authorized by this historical document.

## Required context and changed decisions

Read the complete PRODUCT_BRIEF, PROJECT_CONTEXT, ROADMAP, DECISIONS, DESIGN_SYSTEM, and HANDOFF documents in `/Users/nicksoteropoulos/Code/FitQuest/docs/`.

The owner approved React Native + TypeScript + Expo, iOS first with a shared Android path. This supersedes Swift/SwiftUI/GRDB. Apple Health and its native module are deferred, so remove the early HealthKit proof/integration dependency. SQLite/PostgreSQL, TypeScript/Fastify, Render direction, private accounts, structured memory, and truthful actuals remain the foundation. Core-stack approval does not approve every privacy, model, auth, or replan policy in the first proposal.

M0 is now accepted as a local scaffold. Read [M0_REVIEW.md](reviews/M0_REVIEW.md) and [Engineering's report](../rebuild/docs/M0_REPORT.md), then inspect the minimal `rebuild/` package boundaries as needed. There is no authentication or database implementation to preserve; do not mistake the liveness route for a working athlete API. Selected dependencies have local evidence, while the Debug development workflow and physical-device checks remain outstanding.

## Bounded follow-up

Return a read-only contract review for M1: an authenticated athlete with a required minimal profile can durably log and resume an unplanned session containing a strength result and timed activity, then synchronize safely.

1. Recommend a React Native-compatible SQLite adapter and transaction/migration approach with current primary-source evidence; replace Swift-specific implementation details. Do not build a full backend mirror.
2. Specify minimal profile/session/result/quantity and command-response contracts, unknown versus zero, per-side/per-dumbbell load basis, units, timestamps/local dates, and future multimodal extension points. Prescriptions are not actuals.
3. Specify local capture/outbox and server transaction boundaries, operation IDs, payload mismatch on repeated IDs, expected revisions, conflict responses, retry recovery, owner-scoped caches, logout and account-switch behavior. Separate local persistence from server acknowledgement.
4. Specify Sign in with Apple verification and revocable FitQuest sessions, refresh/logout/revocation/security tests, and a provider-independent internal account ID. Clearly distinguish local test fixtures from production authentication. Flag any Apple configuration steps requiring owner approval.
5. Define API/DB owner enforcement and two-user negative tests, plus the safe disposable local database setup. No production data or remote migrations.
6. Map the minimal test matrix to AC-01/04/05/10 and relevant AC-11. Identify physical-device versus simulator versus backend checks, library risks, and genuinely blocking decisions.

No HealthKit adapter design expansion, runtime AI/model selection, comprehensive nutrition schema, full design system, speculative microservices, or implementation. Future health ingestion remains a domain boundary, not current functionality.

Use current official sources for changing platform details. Return the proposal in the task; do not edit files, install dependencies, change Git, run migrations, dispatch tasks, or touch hosted resources. HQ integrates approved decisions and issues the M1 Engineering handoff after review.
