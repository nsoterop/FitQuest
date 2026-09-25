# FitQuest — Current Handoff

Updated: 2026-09-24 · Maintainer: Project HQ

## Current decision

**M1a is accepted by HQ for local development with synthetic data.** Engineering completed the owner-approved F6 correction and repeated-Details follow-up; F1–F6 are closed within the [reviewed scope and verification limits](reviews/M1A_REVIEW.md). This does not accept full M1, production authentication, synchronization, real private-record use, or release readiness.

Engineering is idle. No M1b assignment has been dispatched. The recommended next steps are a reviewed Git checkpoint of the accepted local work, followed by a separately scoped M1b local API/PostgreSQL synchronization assignment. Both a new commit/push and new implementation work require owner approval.

## Current implementation and evidence

- Delivered under `rebuild/`: independent React Native/Expo mobile app, Fastify API scaffold, shared contracts, encrypted owner-scoped local persistence, required minimal profile, session/activity screens, strength/manual-time logging, recoverable raw drafts and stable result intents, pending commands, terminal-session corrections, and truthful input/record/queue status.
- Final Engineering delivery: task **Engineering**, `01a0d053-66ed-79a0-a0bb-5b366646e723`, local host; turn `01a0d3bc-6513-7a51-a4c5-6a0e91520d5e`. The dated [Engineering report](../rebuild/docs/M1A_REPORT.md) retains the implementation, correction, native verification, F6, and repeated-Details evidence.
- HQ independently ran `npm run check` on the final local source: **31 tests** (API 2, contracts 7, mobile 22), typechecks, lint, and contracts/API builds passed. Node's experimental SQLite warning remains. `git diff --check -- rebuild` passed.
- HQ reran the exact screen-used Details callback with the actual route/presentation helpers in an in-memory source harness. Repeated entry preserves draft context, account-record status, and Back origin for fresh profile, profile with one queued fact, and session with two queued facts. This is source-driven verification, not a native test.
- Engineering reports final Debug repeat-tap/Back checks on the current bundle. Earlier native checks cover failed-save/retry/relaunch, profile/activity recovery, completed/ended-early corrections, active A/B account separation, and Release fixture locking. HQ reviewed source, tests, reports, and selected screenshots; it did not independently operate the simulator or repeat native builds.
- Deterministic native delayed-callback and rapidly overlapping account-switch races remain unrun. Automated coordinator/SQL tests cover those timing mechanisms, not every device interaction. HQ accepts this boundary for the local synthetic-data increment; repeat relevant integration checks when sync/auth introduce new boundaries.
- Release locking evidence predates the last navigation-only helper edit; **Release was not rebuilt again after that edit**. Retain it as prior gate evidence, not a final-source Release-build claim. Refresh it at the next affected integration/release check.
- Physical-device/Keychain lifecycle, VoiceOver, Android runtime, real identity, backend sync, and hosted operation remain separate gates. A historical dependency audit reported ten moderate entries from one transitive uuid advisory, with no high/critical findings then; compatible remediation and a fresh release audit remain open. See [FOLLOWUP_REVIEW.md](reviews/FOLLOWUP_REVIEW.md).

Developer identities require explicit opt-in, use synthetic data and isolated key/storage namespaces, and are unavailable in default/Release access. They are neither production authentication nor a public demo mode. Preserve the existing encrypted fixture stores/keys, revoked B, and named disposable verification simulators; do not erase or un-revoke fixtures to make checks pass. No real health records should be entered yet.

## GitHub and working-tree state

- Private repository: [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest). `origin` is `https://github.com/nsoterop/FitQuest.git`; `main` tracks `origin/main`.
- Owner-approved initial baseline `1ddec34ae52865cdae62f09660edd3df90fc8ff6` was pushed and remotely verified on 2026-09-24. Subsequent documentation commits brought the last verified pushed/local committed HEAD to **`d5835eef393790bc9036777c332643043dd15c18`**.
- **The final accepted F6 source, new status helper/tests, verification report/screenshots, and HQ documentation remain local and uncommitted. GitHub does not yet contain these changes.** No new commit or push was performed in the acceptance review. Preserve and review this work before a fresh checkout or worktree.
- The reviewed 66-file baseline included only rebuild sources, curated shared docs, root README, and ignore rules. Allowlist/excluded-path/conflict/basic-secret checks and `git diff --cached --check` passed; 151 local links across 26 Markdown files resolved, and ten then-included images were inspected as scaffold/synthetic evidence. These historical baseline checks are not a comprehensive security audit and do not replace review of the next checkpoint.
- The old prototype is preserved locally and ignored: `apps/`, `services/`, `packages/`, old root npm/deployment/database configuration, and `README.prototype.md`. It is not part of new clones/worktrees. Never broadly stage the checkout or include secrets, databases, generated native/build files, or private artifacts. Public visibility needs a separate content/privacy review.

## Ownership and retained assignments

One implementation writer per working tree. HQ owns shared `docs/` and the root README; Engineering owns approved implementation under `rebuild/`. Architecture and Design are not concurrent source writers. A roadmap or completed handoff is not permission to start another increment.

- **Engineering** — task `01a0d053-66ed-79a0-a0bb-5b366646e723`, local host, idle. Completed scope: [M0](ENGINEERING_HANDOFF.md), [development-loop follow-up](ENGINEERING_DEV_WORKFLOW_HANDOFF.md), [M1a](ENGINEERING_M1A_HANDOFF.md), [F1–F5 corrections](ENGINEERING_M1A_CORRECTIONS.md), [native verification](ENGINEERING_M1A_VERIFICATION.md), and [F6 correction](ENGINEERING_M1A_STATUS_FIX.md). Stop conditions remain in force; no M1b work assigned.
- **Architecture** — task `01a0d09d-2bf8-79e0-8a59-6b4043aa18f5`, local host, idle. The [M1 proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md) and [accepted recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md) define contracts, transaction/retry/conflict boundaries, owner isolation, and credential recovery direction. They are design evidence, not implemented backend/auth behavior. See [retained assignment](ARCHITECTURE_HANDOFF.md).
- **Design M1 sign-in and profile** — task `01a0d101-4c19-7b63-8d49-5fa0e5f70129`, idle. [Initial proposal](proposals/M1_DESIGN_PROPOSAL.md) and [HQ review](reviews/M1_DESIGN_REVIEW.md) record owner-approved Sessions-first minimal profile/mixed logging and provisional neutral/teal visuals. This is not the final AI-coach dashboard. No new Design implementation assigned.

## Completed foundations

- Product brief and cross-task source-of-truth documents established. React Native/TypeScript/Expo supersedes Swift; Android shares a future frontend path. HealthKit is deferred and not required for the initial coach.
- M0 accepted for local-scaffold scope: independent rebuild workspace, API liveness, shared contracts, setup/tests. See [M0 review](reviews/M0_REVIEW.md) and [report](../rebuild/docs/M0_REPORT.md).
- Debug/Metro/Fast Refresh and restart development workflow accepted from Engineering's observed simulator evidence and HQ artifact review. Physical-device evidence remains separate. See [development report](../rebuild/docs/DEV_WORKFLOW_REPORT.md).
- M1 recovery mechanics accepted as the technical baseline, including dependent outbox work, credential persistence, transaction races, and lock/claim ordering. Authentication lifetimes/configuration are still unresolved.
- Initial UX/provisional visual direction and ordinary-expiry versus logout/revocation local-access policy approved. See [DECISIONS.md](DECISIONS.md) and [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
- M1a accepted with the current evidence boundaries above. Historical findings and intermediate withheld decisions remain in the review/report for traceability, superseded by the final acceptance.

## Recommended next scope — not yet authorized

1. Review the exact pending file set, synthetic evidence, ignore rules, and secret/privacy checks; checkpoint the accepted M1a work to the existing private GitHub repository if the owner approves.
2. Prepare and dispatch **M1b: disposable local API/PostgreSQL synchronization** to Engineering after owner approval. Bound it to the accepted architecture and test profile/session/result transactions, immutable command retries, dependent-command ordering, revision conflicts, owner isolation, restart/offline/reconnect, and truthful client pending/synced/error states. Require explicit synthetic test identity, a named disposable local database, and repeatable integration evidence. Do not imply fixture credentials satisfy real authentication.
3. Review M1b before separately authorizing **M1c: real authentication and device integration**. Apple configuration, hosted transport/services, remote migrations, and deployment each require their relevant approval. Full M1 is incomplete until all its gates pass.

Natural-language multi-goals, nutrition/recovery context, and the adaptive-coach loop remain the subsequent M2/M3 priorities in [ROADMAP.md](ROADMAP.md). This reliability foundation is not a change to the AI-first, mixed-modality product vision.

## Hosted status and remaining decisions

Render connection, the old $7/month service, service health, billing, and live database state are owner-reported/unverified. No rebuild deployment is verified and no hosted resources, migrations, Apple configuration, or credentials were changed by this work. Repository deletion is not evidence of service retirement; verify the legacy service and current costs before proposing provisioning or retirement.

The owner removed the original $40 ceiling as a constraint on Render on 2026-09-24. This is not unlimited AI-spend or paid-service/deployment approval; AI allocation and spend controls still need their own gate. D-006/D-014 record the boundaries.

Open decisions before their relevant gates: public supported-OS policy, compatible dependency remediation, production device/encryption lifecycle, authentication configuration/lifetimes, AI model/evals/spend, plan/replan acceptance, retention/deletion/provider disclosure, and verified hosting/operational costs. Do not silently treat proposals, selected local versions, or prior credentials as current verified production configuration.
