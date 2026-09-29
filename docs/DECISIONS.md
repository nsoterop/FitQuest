# FitQuest — Decisions

Updated: 2026-09-29 · Maintainer: Project HQ

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

## D-017 — M1c read-only planning

**Owner-authorized progression; HQ execution scope, 2026-09-25.** Following accepted/pushed M1b checkpoint `490f923`, the owner instructed HQ to move on. Dispatch [M1c planning](ARCHITECTURE_M1C_HANDOFF.md) to the existing Architecture task: inspect current code, verify current official platform guidance, specify real authentication/recovery/device boundaries and tests, and recommend the smallest safe Engineering increment. HQ reviews and records the proposal before assigning implementation. Engineering and Design remain idle; no parallel source writers.

This authorizes planning, not code changes, Apple configuration, real credential use, signing/phone installation, transport exposure, hosting/provisioning, migration execution, deployment, or paid builds. Routine project-document commits/pushes remain covered by D-016. Retain accepted local-access and recovery rules unless a proposed amendment is explicitly reviewed; do not add HealthKit or expand into M2/M3.

## D-018 — M1c design acceptance and first implementation increment

**Owner-approved progression, 2026-09-25:** the owner confirmed Architecture was done and required approvals count as approved. HQ captured the [full proposal](proposals/M1C_ARCHITECTURE_PROPOSAL.md), [reviewed it with binding qualifications](reviews/M1C_ARCHITECTURE_REVIEW.md), and dispatched only [Engineering M1c.1](ENGINEERING_M1C1_HANDOFF.md). Adopt the proposed identity/recovery separation and timing defaults as a configurable engineering baseline; production configuration, native persistence and provider behavior still require their own evidence.

M1c.1 adds strict separate auth contracts and a pure deterministic recovery coordinator with injected fake ports and crash/race tests. Preserve M1b runtime/contracts and fixture isolation. No new dependencies, runtime wiring, API routes, migrations, native changes, provider calls, Apple credentials/configuration, phone installation, network exposure, hosted changes or paid work. Later increments remain serialized and require HQ scoping/review; do not invent unresolved external targets from broad approval. Engineering is the only source writer, HQ owns docs/Git integration, and the task stops for acceptance after its report.

## D-019 — Mandatory owner checkpoint before product AI implementation

**Explicit owner instruction, 2026-09-25:** continue the project, but stop and explain what is happening before implementing any AI functionality. This supersedes earlier broad proceed/approval wording for AI work. Before the first AI implementation, HQ must present the proposed feature and user flow, provider/model options, what athlete data is used/sent and retained, expected costs and limits, safety/evaluation approach, failure behavior, and acceptance criteria, then wait for fresh explicit owner approval.

Do not begin provider SDK/integration scaffolding, product prompts, model-based goal interpretation, coaching generation, agents, embeddings, or AI evaluation implementation/model calls before this checkpoint—even if scheduled in M2 rather than M3. Preparing a read-only proposal is allowed; notification alone is not approval to proceed. This gate concerns AI features/infrastructure in FitQuest, not ordinary AI-assisted software development. Existing non-AI storage/auth work and routine Git approval remain in force. Carry this gate into every future task handoff.

## D-020 — M1c.2 account/store boundary implementation

**Owner-authorized progression; HQ scope, 2026-09-25.** Following accepted checkpoint `1f4aa5c`, continue with [M1c.2](ENGINEERING_M1C2_HANDOFF.md): isolate fixture adapters, generalize account/store ownership through trusted test boundaries, implement/test durable local authorization latches and preserve logging/sender behavior. Engineering is the sole `rebuild/` writer; HQ owns docs/integration. This remains local synthetic-data work, not real sign-in. Native rotating credentials/UI remain later work; no new API/session implementation, PostgreSQL migrations, Apple/phone configuration, hosted changes or AI work. Stop for HQ review after delivery.

## D-021 — M1c.3 transactional session implementation

**Owner-authorized progression; HQ scope, 2026-09-26.** Following accepted/pushed M1c.2 checkpoint `5f76b1c`, the owner instructed HQ to continue. Assign [M1c.3](ENGINEERING_M1C3_HANDOFF.md) to Engineering: server session issuance/activation/rotation/revocation and transactional private-operation guards, verified on separate task-marked local PostgreSQL using synthetic provider identities. Preserve original migrations, domain contracts, fixture authority and retained M1b development data. The existing marked M1b integration-test database may be used for its established regression suite only; new migrations are limited to the new auth-test target.

Engineering is the sole scoped `rebuild/` writer; HQ owns documents and Git integration. No live provider/Apple implementation, normal auth-route wiring, mobile/native/UI change, phone setup, hosted/remote migration, deployment, new dependency or AI work is included. Stop for HQ acceptance; M1c.4 is not automatically authorized. D-019 remains a hard owner checkpoint before any product AI implementation.

## D-022 — M1c.3 acceptance and bounded provider verification

**Owner-authorized continuation; HQ execution scope, 2026-09-29.** The owner approved proceeding with acceptance review, checkpointing and next steps. HQ independently accepted M1c.3 (175 passing tests and original F3 reproduction fixed), then committed/pushed `f2b97fe` to the verified private repository. Engineering was separately switched to GPT-6.1 Sol at the owner's request; this is a development-tool setting, not a FitQuest AI model selection.

Split M1c.4 into reviewable slices. Assign only [M1c.4a](ENGINEERING_M1C4A_HANDOFF.md): unused server Apple-token signature/claim verification, generated-key/JWKS offline tests, sanitized failure behavior and compiled-runtime compatibility. Permit one compatible pinned JOSE dependency and necessary local manifest/lockfile updates. No real Apple calls/credentials, challenge/exchange/account/session/API wiring, migrations, native/UI changes, device/provider-account/hosted configuration or product AI implementation. This verifier alone cannot authenticate a FitQuest account. Engineering owns scoped `rebuild/` work; HQ owns documents/Git and independent acceptance. Subsequent integration receives its own handoff after review; D-019 is unchanged.

## D-023 — M1c.4b transactional sign-in exchange

**Owner-authorized continuation; HQ scope, 2026-09-29.** After accepted/pushed M1c.4a checkpoint `959f740`, the owner instructed HQ to proceed. Assign [M1c.4b](ENGINEERING_M1C4B_HANDOFF.md): persisted one-use challenges, exclusive fenced exchange attempts, verification of generated token pairs and atomic account/pending-session finalization using a simulated provider exchange. Reuse accepted session behavior without a separate self-committing issuance step. Additive migrations and guarded cleanup are authorized only on the new task-marked `m1c4b-pg` / `fitquest_m1c4b_exchange_test` Unix-socket target, proposed port 55441; preserve existing migrations 001–004 and retained regression/development targets.

Engineering remains the sole `rebuild/` writer on GPT-6.1 Sol. HQ owns shared docs/Git and independent acceptance. No live provider transport/calls/credentials, public auth-route wiring, production provider credential lifecycle, native/UI/device/hosted setup, deployment or product AI work. Stop after the report; subsequent integration requires its own scope. D-019 is unchanged.
