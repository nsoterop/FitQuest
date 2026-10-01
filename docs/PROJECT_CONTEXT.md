# FitQuest — Project Context

Updated: 2026-10-01 · Maintainer: Project HQ

## Product and authority

One public, private-account fitness/health/performance coach; the owner is the first user. Build iOS first with a shared React Native frontend that can later support Android. This is a clean restart, not an extension of the prototype. Do not create a separate demo app.

[PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) is the product contract. [DECISIONS.md](DECISIONS.md) records approved choices and unresolved decisions; [ROADMAP.md](ROADMAP.md) sequences work; [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) distinguishes approved UX direction from provisional visual details; [HANDOFF.md](HANDOFF.md) records current work and evidence. Explicit later owner instructions prevail and must be incorporated.

## Non-negotiables

- Dynamic, simultaneous natural-language goals; no fixed workout schedules or hardcoded personal plans.
- Required editable athlete profile; default pounds/miles; appropriate units for each activity.
- Multi-session days and rest days; strength, cardio, intervals, sport, mobility, coordination, and recovery.
- Structured records are authoritative. Prescribed is not performed; planned food is not consumed; unknown is not zero.
- Persistent history, provenance, scoped corrections, progression continuity, and truthful local-save/sync states.
- Training, basic nutrition, and subjective recovery context feed adaptive recommendations. Apple Health is deferred, not required to make the coach useful.
- Render is no longer constrained by the original $40/month ceiling (owner approval, 2026-09-24). Current hosting costs still need review before paid changes; app-AI allocation remains to be agreed and spend controls remain required. Existing Apple Developer membership; no new enrollment needed.
- No personal health data in public docs/fixtures, no exposed secrets, no hosted writes or destructive changes without explicit approval.

## Approved core direction

- Mobile: React Native + TypeScript + Expo; shared domain/UI code, platform-specific adapters only where necessary. iOS release first, Android release later. M0 selections and local checks are recorded in Engineering's report; new dependencies and upgrades require fresh compatibility checks.
- Local storage: SQLite for active sessions, pending changes, and selected cached records, not a mirror of every server table. M1a implements Expo SQLite with SQLCipher and SecureStore-backed keys for isolated synthetic local accounts. The earlier Swift/GRDB choice is superseded. Real identity, device/Keychain lifecycle, and production configuration remain integration gates.
- Backend: TypeScript/Fastify modular API; PostgreSQL for synchronized account records. All mobile access goes through authenticated API operations, never direct database credentials.
- Intended host: Render, subject to fresh configuration/pricing approval before provisioning. Initial iOS sign-in direction: Sign in with Apple, with provider-independent internal account IDs.
- AI: intended server-side provider boundary, bounded relevant context, deterministic calculations, validated recommendations/evaluations. No app model/version selected. **D-019 hard stop:** before any product AI code/integration/prompt/evaluation implementation, explain the scope, data/privacy, model/provider, costs and safeguards to the owner and wait for fresh explicit approval. Earlier broad approval does not waive this gate.
- Apple Health: no HealthKit module, health permission prompts, import jobs, or claims of wearable access in the current milestones. Manual records remain first-class later too.
- Initial UX: Sessions-first minimal profile/mixed logging flow with provisional neutral surfaces and teal actions, approved by the owner on 2026-09-23. This is not the final AI-coach dashboard. Approved ordinary-expiry local access and logout/revocation locking are recorded in D-012 of DECISIONS.

SQLite stores pending facts durably on the device. PostgreSQL holds server-confirmed shared account state. Unsent records are not silently available to backend coaching. The API must receive relevant changes or disclose stale context before a later generation request.

## Workspace and environment snapshot

Foundation snapshot verified 2026-09-23; M1a accepted 2026-09-24 and M1b accepted 2026-09-25, both for local synthetic-data scope:

- Workspace: `/Users/nicksoteropoulos/Code/FitQuest`.
- Private GitHub repository [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest) was established on 2026-09-24. `origin` is `https://github.com/nsoterop/FitQuest.git`; `main` tracks `origin/main`. Accepted M1b checkpoint `490f9239614d6f40cc63cbf3010c37ea34ff23a6` was pushed and remotely verified on 2026-09-25; the repository remained private and the worktree was clean. Later planning docs are separate from that implementation checkpoint. Routine reviewed commits/pushes are authorized under D-016; never broadly stage the checkout.
- The owner reports connecting Render. Its connection, service health, and billing have not been independently verified; no deployment or hosted changes are authorized by GitHub setup or the relaxed Render budget.
- Prototype occupies locally retained, ignored `apps/`, `services/`, `packages/`, root npm configuration, and historical deployment/database configuration. Its original README is preserved as `README.prototype.md`; the current root README describes the rebuild. These prototype files are excluded from the new repository, not deleted, and will not exist in fresh clones/worktrees.
- M0 under `rebuild/` is accepted. M1a adds encrypted synthetic-account local persistence, required profile, session strength/manual-time UI, recovery corrections, and truthful status. [Accepted M1b](reviews/M1B_REVIEW.md) adds real disposable local PostgreSQL/API synchronization, retries, owner isolation, and explicit conflict recovery. Real authentication, hosted synchronization, and coaching do not exist yet.
- HQ chooses an additive `rebuild/` directory for the first scoped local implementation. Keep its package manifest/lockfile independent of the prototype. Do not move/delete the prototype or change its root workspace configuration.
- HQ reran `npm run check` from `rebuild/` after the development-workflow follow-up: typecheck, lint, four tests, and contract/API builds passed. Engineering reports clean install, HTTP liveness, Debug/Fast Refresh/restart recovery, and Release iOS simulator render with Metro stopped. HQ inspected scripts, reports, and screenshots but did not repeat native builds or interactive Fast Refresh. See [M0_REVIEW.md](reviews/M0_REVIEW.md) and [FOLLOWUP_REVIEW.md](reviews/FOLLOWUP_REVIEW.md).
- Architecture's [M1 recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md) is the technical recovery baseline. Local persistence/UI corrections have M1a evidence; local client/API/PostgreSQL recovery now has accepted M1b evidence under synthetic authority. Real authentication and hosted recovery remain unimplemented/unverified. Automated timing coverage is not a native race-injection pass.
- The owner-created Design task completed a read-only proposal; its initial direction and M1a execution were approved. Historical [M1a evidence](reviews/M1A_REVIEW.md) includes 31 independently passing tests and repeated-Details source probes. Current [M1b evidence](reviews/M1B_REVIEW.md) supersedes the earlier final-source Release caveat: Engineering reports new Debug/Release builds, process-relaunch and recovery checks. HQ reviewed those reported observations but did not independently repeat native builds/interactions. Deterministic native timing races and physical-device gates remain open.
- A previously reviewed dependency audit reported ten moderate package entries tracing to one transitive uuid advisory, with no high/critical findings at that time. Limited reachability triage and the open compatible-remediation task are recorded in the follow-up review. No forced dependency fix was applied; this is historical evidence, not a fresh audit of the final M1a source.

Still unverified: old Render service health/billing, live database state, production credentials, physical-device signing/runtime, and Android runtime. Engineering's reports record selected versions and simulator toolchain evidence; these do not establish a public supported-device policy. The owner reports a $7/month old Render service; count overlap until retirement is explicitly approved. No rebuild deployment exists as verified evidence.

Use disposable, explicitly identified local development/test data. Never inherit the prototype's environment files or credentials. Do not print secret values or real athlete records while inspecting configuration.

## Task ownership and workflow

Current assignment, 2026-10-01: owner authorized [M1c.4d.1 isolated credential protection](ENGINEERING_M1C4D1_HANDOFF.md), Engineering's sole implementation scope. Architecture's [C1 clarification](proposals/PROVIDER_CREDENTIALS_C1_ADDENDUM.md) is delivered; proposed residual active access/additive contracts await approval before integration. Architecture and Design are idle. Existing 423-test evidence is historical, not a new run for this handoff. See the [hands-on testing and AI path](ROADMAP.md#near-term-hands-on-testing-and-ai-path); phone/auth integration is incomplete and D-019 is unchanged.

**Latest acceptance, 2026-10-01:** [M1c.4b](reviews/M1C4B_REVIEW.md) is accepted within internal simulated-provider/local PostgreSQL scope; F1 is closed with 296 independently passing tests, both compiled checks and HQ's separate original reproduction. All review-started clusters are stopped with retained data. The review/dispatch snapshots below are historical. Working Apple sign-in, provider credential lifecycle, public routes, native/device/hosted evidence and D-019 remain separate gates.

On 2026-10-01, after the review below, the owner authorized the F1 correction and routine future bounded review-fix dispatch without repeated confirmation ([D-024](DECISIONS.md#d-024--routine-acceptance-review-correction-routing)). HQ sent F1 to the existing Engineering chat; independent re-review remains required. No expansion of implementation, hosted/deployment or pre-AI authority is implied.

M1c.4b was independently reviewed on 2026-10-01 and **is not yet accepted**. [Review F1](reviews/M1C4B_REVIEW.md) requires correcting pre-authentication disabled-account denial so it does not claim bound-session revocation. HQ passed 294 tests and both compiled checks; the separate probe reproduced F1. Next is a bounded correction and re-review, not further integration. No correction was dispatched by this review. All three review-started test clusters are stopped with data retained; no implementation commit/push occurred.

M1c.3 was accepted on 2026-09-29: [F1/F2/F3 closed](reviews/M1C3_REVIEW.md), with 175 independently passing tests, typechecks/lint/builds, and HQ's separate original-reproduction probe now passing. Both review-started clusters were stopped with data retained. This remains isolated local synthetic authority, not real Apple sign-in or production authentication.

- HQ owns product scope, priorities, acceptance, and shared status documents.
- Architecture owns technical contracts, boundaries, and decision proposals; no bulk implementation.
- Engineering owns scoped code, automated tests, debugging, and local integration.
- Design owns UX/visual proposals and approved UI work; no simultaneous edits to Engineering-owned screens.

One implementation writer in this working tree: Engineering, assigned M1c.4d.1 under D-027. M1c.4c is complete and accepted; Architecture's D-026 proposal and clarification are delivered. All chat model/reasoning settings are retained. HQ owns shared docs and routine reviewed Git checkpoints under D-016; routine correction dispatch is authorized by D-024. Carry the D-019 pre-AI stop into every handoff; no AI work is authorized.

Latest accepted implementation: [M1c.4c](reviews/M1C4C_REVIEW.md), unused signer/transport with 423 independently passing tests, all three compiled checks and a separate concurrency/cancellation probe; checkpoint `2a383a136c4e788e1e0f4b8db25dd70dee19fff5` is pushed and remote/private/clean verified at acceptance. Default private/auth routes remain unavailable. Node 24.12.0 was exercised; Node 22.13.0 floor execution and actual Apple algorithm/token compatibility remain unverified. Prior native fixture/Release evidence is not native UUID/Keychain or real-provider proof. No live Apple/provider calls, hosted/device setup or AI implementation occurred.

Unresolved before the relevant phase: authentication configuration/lifetimes and security verification, iOS minimum/version compatibility, production device/encryption lifecycle verification, dependency remediation, AI model/evaluation/spend allocation, plan-acceptance policy, retention/deletion/consent policy, and verified operating costs. These do not block a Design proposal, but do block claims that dependent features are complete.
