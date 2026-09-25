# FitQuest — Current Handoff

Updated: 2026-09-25 · Maintainer: Project HQ

## Current decision

**M1a and M1b are accepted by HQ for local development with synthetic data.** M1a F1–F6 and M1b F1/F2 are closed within their [local logging](reviews/M1A_REVIEW.md) and [local synchronization](reviews/M1B_REVIEW.md) evidence limits. This does not accept full M1, production authentication, hosted synchronization, real private-record use, or release readiness.

The owner approved the M1a checkpoint and M1b on 2026-09-25 and declined a phone-setup detour. M1a checkpoint `192dbfb` is pushed and verified. Engineering completed M1b and its bounded corrections; HQ accepts the result after independent checks and original-bug reproductions passed. Engineering is idle. No M1c, Render, deployment, remote migration, Apple configuration, or phone setup is included.

## Current implementation and evidence

- Delivered under `rebuild/`: React Native/Expo mobile app, shared contracts, encrypted owner-scoped local persistence, required minimal profile, multiple sessions, strength/manual-time logging, recoverable raw drafts/stable result intents, terminal-session corrections, and truthful local/queue/sync status. M1b adds explicit local-test Fastify API and actual PostgreSQL transactions/RLS, immutable operation receipts, dependency-ordered client sync, unknown-outcome retry, and explicit conflict adoption/replacement. Default API remains health-only.
- Latest accepted delivery: task **Engineering**, `01a0d053-66ed-79a0-a0bb-5b366646e723`, local host; correction turn `01a0d88e-bbd0-7200-be86-a6cca8a4ba89`. See [M1b report](../rebuild/docs/M1B_REPORT.md) and [HQ acceptance review](reviews/M1B_REVIEW.md). Earlier [M1a report](../rebuild/docs/M1A_REPORT.md) and review retain historical evidence.
- HQ independently reran final-source `npm run check`: **49 tests** (API 2, contracts 7, mobile 40), typechecks, lint, and builds passed. Fresh **9/9 real PostgreSQL integration tests** and `git diff --check -- rebuild` also passed. The task-owned local PostgreSQL cluster was stopped afterward with development data retained. Node's experimental SQLite warning remains.
- HQ reran the original source-driven F1/F2 probes: stopped sender/token-wait transport no longer dispatch new requests; actual screen callbacks restore adopted profile fields and saved status through an empty draft tombstone, including repeated profile entry. Details Back uses that restoration path. These are actual-class/callback in-memory tests, not native interaction.
- Engineering reports final-source Debug/Release builds, native pause/resume, expiry/account switching, clean process termination/relaunch with pending work, adopted profile followed by save, and session-result adoption/correction. HQ reviewed the report/source/tests but did not independently operate the simulator, repeat native builds, or inspect new M1b screenshot artifacts.
- Deterministic native delayed-callback/scheduler races remain unrun. Automated timing tests cover the cancellation/editor mechanisms, not every device interaction. HQ accepts this boundary for the local synthetic-data increment; repeat relevant integration checks when real auth/device/hosted boundaries are introduced.
- Engineering reports final-source Release remained locked despite retained fixture records/authority. This refreshes the older M1a Release caveat but is reported native evidence, not an independently repeated HQ build.
- Physical-device/Keychain lifecycle, VoiceOver, Android runtime, real identity/token lifecycle, hosted sync, production migrations/backup/restore, and release security remain separate gates. A historical dependency audit reported ten moderate entries from one transitive uuid advisory, with no high/critical findings then; compatible remediation and a fresh release audit remain open. See [FOLLOWUP_REVIEW.md](reviews/FOLLOWUP_REVIEW.md).

Developer identities require explicit opt-in, use synthetic data and isolated key/storage namespaces, and are unavailable in default/Release access. They are neither production authentication nor a public demo mode. Preserve the existing encrypted fixture stores/keys, revoked B, and named disposable verification simulators; do not erase or un-revoke fixtures to make checks pass. No real health records should be entered yet.

## GitHub and working-tree state

- Private repository: [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest). `origin` is `https://github.com/nsoterop/FitQuest.git`; `main` tracks `origin/main`.
- Owner-approved initial baseline `1ddec34ae52865cdae62f09660edd3df90fc8ff6` was pushed and remotely verified on 2026-09-24; subsequent documentation checkpoint was `d5835eef393790bc9036777c332643043dd15c18`. Both precede the accepted M1a checkpoint `192dbfb`.
- Accepted M1a was committed/pushed as **`192dbfb0f32fb26ea27a15a1a48d6370b8eec321`** on 2026-09-25 and remotely verified. The owner has explicitly authorized the accepted M1b source and HQ-document checkpoint and routine future commits/pushes under [D-016](DECISIONS.md#d-016--routine-private-repository-commits-and-pushes). This supersedes the earlier documentation-push approval blocker. Check current Git history/status and remote SHA for publication state; the M1b checkpoint is prepared from `192dbfb`, not a new implementation assignment.
- The reviewed 66-file baseline included only rebuild sources, curated shared docs, root README, and ignore rules. Allowlist/excluded-path/conflict/basic-secret checks and `git diff --cached --check` passed; 151 local links across 26 Markdown files resolved, and ten then-included images were inspected as scaffold/synthetic evidence. These historical baseline checks are not a comprehensive security audit and do not replace review of the next checkpoint.
- The old prototype is preserved locally and ignored: `apps/`, `services/`, `packages/`, old root npm/deployment/database configuration, and `README.prototype.md`. It is not part of new clones/worktrees. Never broadly stage the checkout or include secrets, databases, generated native/build files, or private artifacts. Public visibility needs a separate content/privacy review.

## Ownership and retained assignments

One implementation writer per working tree. HQ owns shared `docs/` and the root README; Engineering owns approved implementation under `rebuild/`. Architecture and Design are not concurrent source writers. A roadmap or completed handoff is not permission to start another increment.

- **Engineering** — task `01a0d053-66ed-79a0-a0bb-5b366646e723`, local host, idle. [M1b](ENGINEERING_M1B_HANDOFF.md) and [F1/F2 corrections](reviews/M1B_REVIEW.md) are complete and accepted. No further implementation, M1c, or Git writes assigned. Engineering owns `rebuild/`; HQ owns shared docs.
- **Architecture** — task `01a0d09d-2bf8-79e0-8a59-6b4043aa18f5`, local host, idle. The [M1 proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md) and [recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md) define contracts, transaction/retry/conflict boundaries, owner isolation, and credential recovery direction. Local synchronization now has M1b implementation evidence; real authentication remains future work. See [retained assignment](ARCHITECTURE_HANDOFF.md).
- **Design** — task `01a0d101-4c19-7b63-8d49-5fa0e5f70129`, no active implementation assignment. Previously titled **Design M1 sign-in and profile**. The [initial proposal](proposals/M1_DESIGN_PROPOSAL.md) and [HQ review](reviews/M1_DESIGN_REVIEW.md) retain the owner-approved direction; the task title was refreshed from the app listing on 2026-09-25.

## Completed foundations

- Product brief and cross-task source-of-truth documents established. React Native/TypeScript/Expo supersedes Swift; Android shares a future frontend path. HealthKit is deferred and not required for the initial coach.
- M0 accepted for local-scaffold scope: independent rebuild workspace, API liveness, shared contracts, setup/tests. See [M0 review](reviews/M0_REVIEW.md) and [report](../rebuild/docs/M0_REPORT.md).
- Debug/Metro/Fast Refresh and restart development workflow accepted from Engineering's observed simulator evidence and HQ artifact review. Physical-device evidence remains separate. See [development report](../rebuild/docs/DEV_WORKFLOW_REPORT.md).
- M1 recovery mechanics accepted as the technical baseline, including dependent outbox work, credential persistence, transaction races, and lock/claim ordering. Authentication lifetimes/configuration are still unresolved.
- Initial UX/provisional visual direction and ordinary-expiry versus logout/revocation local-access policy approved. See [DECISIONS.md](DECISIONS.md) and [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
- M1a and M1b accepted with the current evidence boundaries above. Historical findings and intermediate withheld decisions remain in the reviews/reports for traceability, superseded by final acceptance.

## Approved current scope and later gates

1. **Completed:** reviewed and pushed M1a checkpoint `192dbfb`. Fresh `npm run check` passed 31 tests, typechecks, lint, and builds; diff checks passed; 124 relative Markdown links in the checkpoint resolved. All 26 files matched the explicit allowlist; basic secret/conflict checks found no matches and all 13 new screenshots were inspected as synthetic-only evidence. These are bounded checks, not a comprehensive security audit.
2. **Completed:** [M1b local synchronization and F1/F2 corrections](reviews/M1B_REVIEW.md), with 49 baseline plus 9 PostgreSQL tests independently passing and reported final-source native evidence. Engineering is idle. The owner approved the reviewed M1b/docs commit and push plus routine future publication under D-016; perform exact-path, excluded-content, and remote checks without asking for repeated routine Git approval.
3. **Next proposed increment, not dispatched:** separately scope **M1c: real authentication and device integration**, starting with identity/configuration planning and explicit acceptance/security gates. Apple configuration, hosted transport/services, remote migrations, and deployment each require their relevant approval. Full M1 is incomplete until all its gates pass.

Natural-language multi-goals, nutrition/recovery context, and the adaptive-coach loop remain the subsequent M2/M3 priorities in [ROADMAP.md](ROADMAP.md). This reliability foundation is not a change to the AI-first, mixed-modality product vision.

## Hosted status and remaining decisions

Render connection, the old $7/month service, service health, billing, and live database state are owner-reported/unverified. No rebuild deployment is verified and no hosted resources, migrations, Apple configuration, or credentials were changed by this work. Repository deletion is not evidence of service retirement; verify the legacy service and current costs before proposing provisioning or retirement.

The owner removed the original $40 ceiling as a constraint on Render on 2026-09-24. This is not unlimited AI-spend or paid-service/deployment approval; AI allocation and spend controls still need their own gate. D-006/D-014 record the boundaries.

Open decisions before their relevant gates: public supported-OS policy, compatible dependency remediation, production device/encryption lifecycle, authentication configuration/lifetimes, AI model/evals/spend, plan/replan acceptance, retention/deletion/provider disclosure, and verified hosting/operational costs. Do not silently treat proposals, selected local versions, or prior credentials as current verified production configuration.
