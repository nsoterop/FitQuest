# FitQuest — Project Context

Updated: 2026-09-24 · Maintainer: Project HQ

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

Foundation snapshot verified 2026-09-23; M1a accepted for local synthetic-data scope 2026-09-24:

- Workspace: `/Users/nicksoteropoulos/Code/FitQuest`.
- On 2026-09-24, the owner approved private repository creation and a reviewed baseline push after Engineering's correction delivery. HQ created [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest), verified private visibility, pushed the 66-file baseline to `main`, and confirmed the remote commit matched local HEAD. `origin` is `https://github.com/nsoterop/FitQuest.git`; `main` tracks `origin/main`. The last verified pushed/local committed HEAD is `d5835eef393790bc9036777c332643043dd15c18`. Final M1a status fixes, evidence, and HQ updates are still uncommitted and not on GitHub; preserve them before a fresh checkout/worktree. Do not broadly stage local files.
- The owner reports connecting Render. Its connection, service health, and billing have not been independently verified; no deployment or hosted changes are authorized by GitHub setup or the relaxed Render budget.
- Prototype occupies locally retained, ignored `apps/`, `services/`, `packages/`, root npm configuration, and historical deployment/database configuration. Its original README is preserved as `README.prototype.md`; the current root README describes the rebuild. These prototype files are excluded from the new repository, not deleted, and will not exist in fresh clones/worktrees.
- M0 under `rebuild/` is accepted. Engineering's M1a contracts, encrypted synthetic-account local persistence, profile/session strength/manual-time UI, recovery corrections, and truthful status are also [accepted by HQ for local synthetic-data scope](reviews/M1A_REVIEW.md). Real authentication, backend synchronization, and coaching do not exist yet.
- HQ chooses an additive `rebuild/` directory for the first scoped local implementation. Keep its package manifest/lockfile independent of the prototype. Do not move/delete the prototype or change its root workspace configuration.
- HQ reran `npm run check` from `rebuild/` after the development-workflow follow-up: typecheck, lint, four tests, and contract/API builds passed. Engineering reports clean install, HTTP liveness, Debug/Fast Refresh/restart recovery, and Release iOS simulator render with Metro stopped. HQ inspected scripts, reports, and screenshots but did not repeat native builds or interactive Fast Refresh. See [M0_REVIEW.md](reviews/M0_REVIEW.md) and [FOLLOWUP_REVIEW.md](reviews/FOLLOWUP_REVIEW.md).
- Architecture's [M1 recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md) is the technical recovery baseline. Local persistence and UI-boundary corrections have reviewed M1a evidence within the stated synthetic-data scope; auth/backend recovery remains unimplemented and unverified. Automated timing coverage is not a native race-injection pass.
- The owner-created **Design M1 sign-in and profile** task completed a read-only proposal; its initial direction and M1a execution were approved. HQ accepted the final M1a correction on 2026-09-24 and independently passed typechecks, lint, 31 tests (API 2, contracts 7, mobile 22), and contracts/API builds. The repeated-Details source reproduction now passes for profile/session origins. Engineering's native evidence was artifact-reviewed, not independently repeated by HQ. The earlier Mac-lock interruption was resolved; deterministic native timing races remain unrun, and prior Release-lock evidence predates the last navigation-only edit.
- A previously reviewed dependency audit reported ten moderate package entries tracing to one transitive uuid advisory, with no high/critical findings at that time. Limited reachability triage and the open compatible-remediation task are recorded in the follow-up review. No forced dependency fix was applied; this is historical evidence, not a fresh audit of the final M1a source.

Still unverified: old Render service health/billing, live database state, production credentials, physical-device signing/runtime, and Android runtime. Engineering's reports record selected versions and simulator toolchain evidence; these do not establish a public supported-device policy. The owner reports a $7/month old Render service; count overlap until retirement is explicitly approved. No rebuild deployment exists as verified evidence.

Use disposable, explicitly identified local development/test data. Never inherit the prototype's environment files or credentials. Do not print secret values or real athlete records while inspecting configuration.

## Task ownership and workflow

- HQ owns product scope, priorities, acceptance, and shared status documents.
- Architecture owns technical contracts, boundaries, and decision proposals; no bulk implementation.
- Engineering owns scoped code, automated tests, debugging, and local integration.
- Design owns UX/visual proposals and approved UI work; no simultaneous edits to Engineering-owned screens.

One implementation writer in this working tree. Use worktrees only from a reviewed committed baseline that includes the work needed by the assignment; the latest accepted M1a fixes are currently uncommitted. A new stack does not authorize porting old code wholesale. Each handoff states scope, file ownership, acceptance criteria, verification, and stop conditions.

Latest implementation: the owner-approved [F1–F5 correction pass](ENGINEERING_M1A_CORRECTIONS.md), [native-verification follow-up](ENGINEERING_M1A_VERIFICATION.md), and [F6 status correction](ENGINEERING_M1A_STATUS_FIX.md) are delivered. **HQ accepted M1a for local synthetic-data scope on 2026-09-24** after final source, test, report, and screenshot review. Engineering is idle; M1b local API/PostgreSQL synchronization is the next proposed increment and is not dispatched. A reviewed Git checkpoint and new implementation assignment require owner approval. HQ owns shared `docs/`; Design/Architecture are not concurrent writers. The local slice uses explicitly opted-in developer-only synthetic identities in isolated storage; no public demo account or private health records. Real sign-in, backend synchronization, and hosted setup remain later gates. See HANDOFF for current status.

Unresolved before the relevant phase: authentication configuration/lifetimes and security verification, iOS minimum/version compatibility, production device/encryption lifecycle verification, dependency remediation, AI model/evaluation/spend allocation, plan-acceptance policy, retention/deletion/consent policy, and verified operating costs. These do not block a Design proposal, but do block claims that dependent features are complete.
