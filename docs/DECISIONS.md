# FitQuest — Decisions

Updated: 2026-09-25 · Maintainer: Project HQ

Status meanings: **Approved** = owner-approved direction; **Execution choice** = reversible HQ scoping within that direction; **Pending** = not approved or not yet specified. Approval does not mean implemented or verified.

## D-001 — One product, clean restart

**Approved.** One public app with private accounts; owner first. Preserve prototype and deployment until a separately approved transition. No separate personal/demo app, no copying private health history into public seeds.

## D-002 — React Native, iOS first, Android later

**Approved, 2026-09-23.** React Native + TypeScript + Expo. Owner wants Android later without a second complete frontend. Share UI/domain code and isolate genuinely platform-specific integrations. Android still needs its own testing, permissions, integration, and release work.

This supersedes Architecture's Swift/SwiftUI recommendation. Do not carry over GRDB or treat SwiftUI-only UI components as the shared baseline. No exact dependency versions or minimum OS version approved yet.

## D-003 — Defer Apple Health

**Approved, 2026-09-23.** No HealthKit integration or HealthKit-specific native module now. Manual activity, nutrition, measurements, and check-ins supply initial coaching context. Future health integration must not require replacing the shared frontend.

Consequences: health import acceptance tests are deferred to that milestone; initial tests must prove missing wearable context is not presented as zero or as imported data. Preserve source/time/unit/uncertainty semantics without implementing a speculative ingestion platform. Expo/native dependencies needed for ordinary persistence/auth are not prohibited by this health-specific deferral.

## D-004 — Local SQLite and backend PostgreSQL

**Approved core direction.** SQLite durably captures active work and pending writes; PostgreSQL holds synchronized account state. Use a small purposeful local store, not a complete server replica. All server access passes through the API.

Required invariants: owner-scoped caches/outbox; idempotent retries; expected-revision conflict handling; visible saved/pending/synced/failed states; no silent cross-account replay. Detailed contracts and local library choice remain Architecture/Engineering work.

## D-005 — API, hosting, and identity direction

**Approved core direction.** TypeScript/Fastify API, PostgreSQL, Render as intended host, Sign in with Apple for the initial iOS sign-in path. Keep internal account identity independent of the sign-in provider for future clients.

This is not approval to provision services, enable Apple capabilities remotely, deploy, reuse old secrets, or apply remote migrations. The authentication verifier/session lifecycle, owner enforcement, and recovery/revocation behavior must be designed and tested before private-record functionality is accepted. A development identity fixture is not production authentication.

## D-006 — Budget and AI boundary

**Updated owner approval, 2026-09-24.** Render hosting is no longer constrained by the original $40/month combined operating ceiling. Do not sacrifice necessary hosting reliability to that superseded constraint. This does not authorize deployment, provisioning, upgrades, retirement of the old service, or unlimited AI spending. Present current Render costs before paid changes. The revised app-AI allowance is not specified; agree it before model usage, retain application-level spend controls, and include development evaluations unless separately funded. Developer-tool subscriptions remain a separate category; confirm Apple membership renewal and other optional costs before commitments.

Server-side AI credentials, bounded context, deterministic calculations, structured validation, measured evaluations, and application-level spend controls are required. No AI model, exact service size, or allocation is locked in. Architecture's earlier estimate is not a verified bill or a purchase authorization.

## D-007 — Truthful records and athlete control

**Approved product rules.** Distinguish plans from actuals, estimates from measurements, and recommendations from facts. Auto-save only unambiguous validated factual conversational logs, with visible confirmation and correction/Undo. Preserve historical records and overrides. No fabricated fallback coaching or progress presented as real.

**Pending:** policy for publishing or automatically applying plan revisions, changes to goals/phases/anchors, and consequential nutrition targets. Until settled, do not implement autonomous consequential changes.

## D-008 — Serialized additive rebuild

**Execution choice, 2026-09-23.** Put initial new implementation under `rebuild/`, with independent package configuration. Prototype directories and root lockfile remain unchanged. HQ owns shared docs; Engineering owns `rebuild/` during its scoped task. No simultaneous screen edits by Design.

At the start of the rebuild, the repository had no committed baseline. D-014 now authorizes HQ to establish one after Engineering's correction delivery. Never blindly commit all untracked files. The baseline excludes secrets, private data, generated artifacts, and the retained prototype. Folder consolidation and prototype retirement remain separate decisions.

## D-009 — Verification before completion claims

**Approved process.** Report exact commands and results; distinguish tests actually run from planned or blocked checks. A simulator build is not physical-device validation, mocks are not live integration, and passing tests do not prove deployment. No feature is complete solely because a screen renders.

## M1 proposal review — no new blanket approval

On 2026-09-23, Architecture returned the [M1 proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md). HQ's [initial review](reviews/M1_ARCHITECTURE_REVIEW.md) requested clarification of dependent queued saves and interrupted sign-in/credential storage. The later [recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md) closes these requests and takes precedence where the original proposal conflicts. Adapter/encryption configuration, token/activation durations, and operational limits remain proposed technical choices. A read-only proposal is not implementation evidence or permission to configure Apple/hosted services.

## D-010 — M1 recovery baseline

**Execution choice, accepted by HQ on 2026-09-23 for future scoped work.** Keep immutable command content, durable terminal outcomes, and explicit dependency/replacement state. Unknown outcomes retry the same operation; definite failures block descendants. Reviewed recovery creates a new command against a current server revision while preserving all latest local intent and guarding concurrent local edits/account changes.

Use pending credential activation after durable storage, a versioned device credential bundle, and fresh sign-in when lost secrets cannot safely be recovered. Preserve offline records and their separate encryption key. This supersedes the original two-minute encrypted refresh-response replay mechanism; do not implement both. A short per-account transaction guard and consistent lock/claim order serialize account mutations; provider HTTP stays outside database locks.

The [follow-up review](reviews/FOLLOWUP_REVIEW.md) records rationale, evidence limits, and required failure/race tests. Exact duration defaults are not approved here. No M1 code, migration, provider configuration, or real-device access is authorized by accepting these design mechanics.

## Pending decisions by gate

- Before durable authenticated records: verified native adapter/encryption setup, session durations/configuration, supported iOS versions, compatible dependency remediation, and actual authentication/synchronization/isolation/recovery evidence. Initial Design direction and the M1a local implementation are now authorized; M1b and production authentication remain separate assignments.
- Before AI coaching: provider/model evaluation, spend allocation and enforcement, context freshness/revision policy, user acceptance, safety/quality thresholds, and provider-data disclosure.
- Before public release: privacy/retention/export/deletion, operational restore drills, current hosting quote, signing/store configuration, and release rollback.
- Future only: HealthKit data types/lookback, consent/reconciliation policy, Android health adapter, Android release, and watch app scope.

## D-011 — Initial UX and provisional visual direction

**Approved by the owner, 2026-09-23.** Sessions-first navigation, minimal required profile setup, mixed strength/timed logging, multiple sessions per day, and visible local-save/sync status. This is the first data slice, not the final coach dashboard or finished athlete onboarding. Neutral surfaces and teal actions are the provisional direction; exact tokens/components remain refinable through rendered review.

The [Design proposal](proposals/M1_DESIGN_PROPOSAL.md) and [HQ review](reviews/M1_DESIGN_REVIEW.md) record the accepted direction. Approval does not require building every proposed recovery screen, timer, or future tab in M1a.

## D-012 — Local access during ordinary credential expiry

**Approved by the owner, 2026-09-23.** A previously verified, locally authorized account may continue local logging through ordinary credential expiry while synchronization is paused. Resuming sync requires restored valid authorization through the permitted refresh/activation flow or fresh sign-in when needed. Explicit logout/account switch or confirmed revocation locks local access until identity is verified again. Missing/corrupt/inconsistent local authorization or store-ownership state cannot unlock records.

Retain pending records and their separate encryption key. On restart, validate durable local authorization/ownership; a cached account ID alone is insufficient. Offline clients cannot detect every remote revocation immediately; do not imply they can. Exact credential durations and additional device-unlock policy remain later authentication decisions. M1a verifies synthetic local boundary transitions, not production identity.

## D-013 — First M1 implementation scope

**Owner-authorized direction; HQ execution scope, 2026-09-23.** [M1a](ENGINEERING_M1A_HANDOFF.md) implements shared validation, native local persistence, minimal profile/session screens, strength/manual-time logging, durable drafts/pending commands, and evidence-driven restart/failure checks. Engineering is the only implementation writer under `rebuild/`; HQ owns shared `docs/`.

Use the Architecture-recommended native SQLite/encryption/key-storage path with compatible dependencies verified during implementation; no silent plaintext or in-memory substitute. Real sign-in and synchronization are later slices, so current verification uses explicit developer-only, opt-in synthetic identities isolated from real-account storage. This is not a second app/public demo, not a production auth bypass, and not permission to import private health data. Default/Release paths must fail closed without real authentication.

Manual time entry is sufficient for M1a; a live timer and server conflict UI are deferred. No hosted services, Apple account configuration, network exposure, Git commit, or broader M1 implementation is authorized by this slice.

## D-014 — Private GitHub baseline

**Explicitly approved by the owner, 2026-09-24.** HQ may create a fresh private FitQuest repository and push a reviewed baseline after the bounded Engineering correction pass. That pass is delivered; its remaining native checks and HQ acceptance are separate from recording a stable source snapshot.

GitHub account verified as `nsoterop`; HQ created [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest), verified private visibility, and pushed the reviewed baseline to `main`. Local and GitHub commit IDs matched; see HANDOFF for evidence. The baseline includes `rebuild/`, curated shared documentation, a current root README, and ignore rules. The prototype is preserved locally but excluded from Git; its previous README is retained as ignored `README.prototype.md`. No prototype code/configuration was migrated or deleted.

Public visibility, Render deployment/connection changes, paid services, remote migrations, secrets, and real health data are outside this authorization. Future implementation still needs a bounded assignment; a Git baseline is not blanket permission for parallel edits or roadmap execution.

## D-015 — Accepted M1a checkpoint and local synchronization increment

**Explicitly approved by the owner, 2026-09-25.** HQ may commit/push the reviewed accepted M1a work to the existing private repository and assign [M1b local API/PostgreSQL synchronization](ENGINEERING_M1B_HANDOFF.md) to Engineering. M1a checkpoint `192dbfb0f32fb26ea27a15a1a48d6370b8eec321` is pushed and remotely verified. Publishing this coordinating handoff/status documentation is included; unreviewed future M1b source publication is not.

M1b permits project-local code/dependencies, guarded migrations on explicitly identified disposable local synthetic databases, loopback-only API/client integration, and focused simulator evidence. It uses an explicit isolated test identity boundary, disabled in normal/production/default Release paths; it is not approval for a production auth bypass. Engineering remains the only implementation writer under `rebuild/`; HQ owns shared docs and checkpoint Git operations. Accepted architecture/recovery mechanics apply; real Apple authentication and device integration remain M1c.

The owner declined the proposed phone-testing detour. No phone signing/install, Apple configuration, Render/hosted change, remote migration, deployment, real private data, global software installation, prototype retirement, or later roadmap milestone is included. Routine in-scope work does not require repeated approval; material scope/tooling expansion does.

Execution update, 2026-09-25: an earlier coordination-doc commit/push was blocked before staging. HQ subsequently accepted M1b after its bounded F1/F2 corrections; 49 baseline tests and 9 PostgreSQL integration tests independently pass, with native/device evidence limits retained in the [review](reviews/M1B_REVIEW.md). The owner has now explicitly approved publication of accepted M1b and updated docs; D-016 supersedes the earlier publication blocker. Engineering is idle and M1c is not dispatched.

## D-016 — Routine private-repository commits and pushes

**Explicitly approved by the owner, 2026-09-25:** commit and push the accepted M1b implementation and updated project documents. Routine commits and pushes for authorized project work to the existing private `nsoterop/FitQuest` repository no longer require repeated owner approval. HQ retains checkpoint/integration ownership unless explicitly delegated; this does not create concurrent source writers or authorize unrelated implementation.

Inspect changes and exact remote/branch before publication; exclude secrets, health records, databases, generated output, and the retained prototype. Preserve unrelated user changes. This approval does not authorize force pushes, destructive history changes, public visibility, new repositories/remotes, deployment, hosted-service changes, remote migrations, or paid provisioning. Tool-required permission gates still apply. Current M1b checkpoint is prepared from `192dbfb`; use Git history and remote verification for its resulting SHA rather than embedding a self-referential commit ID here.
