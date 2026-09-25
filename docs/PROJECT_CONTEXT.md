# FitQuest — Project Context

Updated: 2026-09-25 · Maintainer: Project HQ

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
- AI: server-side provider boundary, bounded relevant context, deterministic calculations, validated recommendations and evaluations. No app model/version selected yet.
- Apple Health: no HealthKit module, health permission prompts, import jobs, or claims of wearable access in the current milestones. Manual records remain first-class later too.
- Initial UX: Sessions-first minimal profile/mixed logging flow with provisional neutral surfaces and teal actions, approved by the owner on 2026-09-23. This is not the final AI-coach dashboard. Approved ordinary-expiry local access and logout/revocation locking are recorded in D-012 of DECISIONS.

SQLite stores pending facts durably on the device. PostgreSQL holds server-confirmed shared account state. Unsent records are not silently available to backend coaching. The API must receive relevant changes or disclose stale context before a later generation request.

## Workspace and environment snapshot

Foundation snapshot verified 2026-09-23; M1a accepted 2026-09-24 and M1b accepted 2026-09-25, both for local synthetic-data scope:

- Workspace: `/Users/nicksoteropoulos/Code/FitQuest`.
- Private GitHub repository [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest) was established on 2026-09-24. `origin` is `https://github.com/nsoterop/FitQuest.git`; `main` tracks `origin/main`. On 2026-09-25 HQ freshly verified private visibility and pushed accepted M1a checkpoint `192dbfb0f32fb26ea27a15a1a48d6370b8eec321`; GitHub's commit API matched local HEAD and the worktree was clean after that push. Later coordination/implementation changes need their own review; never broadly stage the checkout.
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

- HQ owns product scope, priorities, acceptance, and shared status documents.
- Architecture owns technical contracts, boundaries, and decision proposals; no bulk implementation.
- Engineering owns scoped code, automated tests, debugging, and local integration.
- Design owns UX/visual proposals and approved UI work; no simultaneous edits to Engineering-owned screens.

One implementation writer in this working tree. Engineering has completed accepted M1b and is idle; no new implementation assignment, worktree, or parallel screen writer is authorized. The owner approved checkpoint publication and routine future commits/pushes under D-016. Inspect Git status and preserve any uncommitted work before creating another checkout. A new stack does not authorize porting old code wholesale. Each handoff states scope, ownership, acceptance, verification, and stop conditions.

Latest accepted implementation: [M1b local synchronization](reviews/M1B_REVIEW.md), with F1/F2 closed. HQ independently passed 49 baseline tests, 9 real PostgreSQL integration tests, typechecks, lint, builds, and the original cancellation/profile-adoption probes. Engineering's final-source native process-kill/relaunch, adoption, pause/expiry, and Release observations remain reported rather than independently repeated by HQ. The local PostgreSQL cluster is stopped with development data retained. The owner explicitly approved M1b/docs publication and routine commits/pushes under D-016, superseding the earlier publication blocker; verify current Git history/status for the checkpoint SHA. Separately scoped M1c planning is next proposed work. No phone setup, M1c, or hosted work is assigned.

Unresolved before the relevant phase: authentication configuration/lifetimes and security verification, iOS minimum/version compatibility, production device/encryption lifecycle verification, dependency remediation, AI model/evaluation/spend allocation, plan-acceptance policy, retention/deletion/consent policy, and verified operating costs. These do not block a Design proposal, but do block claims that dependent features are complete.
