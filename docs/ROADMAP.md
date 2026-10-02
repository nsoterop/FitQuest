# FitQuest — Roadmap

Updated: 2026-10-02 · Maintainer: Project HQ

Statuses describe evidence, not aspiration. The roadmap is not blanket implementation or deployment permission. Maintain one implementation writer per working tree; separately approved read-only work may run alongside a non-overlapping implementation handoff.

## Foundation decisions — complete

- Product brief and core stack approved; React Native supersedes Swift.
- Apple Health explicitly deferred; shared Android path retained.
- Cross-task documents established. M0, M1a local logging, and M1b local synthetic-data synchronization are accepted. Real authentication and coaching remain unimplemented.

## M0 — Reproducible local foundation

**Status: Accepted by HQ on 2026-09-23 for local-scaffold scope.** Completed scope: [ENGINEERING_HANDOFF.md](ENGINEERING_HANDOFF.md). Evidence: [M0_REVIEW.md](reviews/M0_REVIEW.md) and [Engineering report](../rebuild/docs/M0_REPORT.md).

Outcome: an independent clean React Native/Expo workspace, minimal Fastify API, shared contract package, and repeatable local checks without disturbing the prototype.

Accept when:

- Clean setup instructions, compatible pinned dependency set/lockfile, and safe environment examples exist under `rebuild/`.
- iOS foundation screen and API health endpoint run locally with explicit scaffold-only status, no fabricated athlete data or coaching.
- Typecheck, lint, unit/contract tests, and production API build pass, or blocked checks are precisely identified without marking the whole milestone complete.
- Native iOS build/simulator evidence is recorded; physical-device verification is separately identified as pending if not performed.
- No HealthKit dependency/permission, hosted change, real health-data import, secret exposure, or prototype code/config change occurs.

HQ independently reran typecheck/lint/four tests/contract and API builds successfully. The [bounded development-loop follow-up](ENGINEERING_DEV_WORKFLOW_HANDOFF.md) is completed and accepted on 2026-09-23: Engineering observed Debug/Metro/Fast Refresh, restart recovery, and Release rendering with Metro stopped; HQ reviewed its evidence. Physical-device validation remains pending. A transitive dependency advisory is tracked in the [follow-up review](reviews/FOLLOWUP_REVIEW.md); no forced upgrade was applied.

## M1 — Durable authenticated mixed-activity logging

**Current, 2026-10-02:** hands-on delivery and final native verification are complete, but [HQ acceptance is withheld for F1](reviews/FIRST_HANDS_ON_REVIEW.md): reconnect existing conflict recovery to integrated accounts. HQ independently passed 596 automated tests and three compiled probes. This is one bounded UI/callback correction and focused re-review, not another foundation milestone. All review-started local clusters are stopped with data retained. The approved first AI slice remains queued immediately after integration acceptance and its scoped handoff.

Current step (2026-10-01): [M1c.4d.1 accepted](reviews/M1C4D1_REVIEW.md), 499 default tests and three offline probes freshly pass. Owner approved a shift to [first hands-on integration](ENGINEERING_FIRST_HANDS_ON_HANDOFF.md), Engineering's sole assignment. Connect the existing components before adding more provider infrastructure. C1's proposed policy/additive states remain unapproved; no live provider, physical phone, hosted or AI work is included. Historical snapshots below do not override this scope.

**Latest, 2026-10-01: M1c.4b accepted for internal simulated-provider/local PostgreSQL scope.** [F1 closed](reviews/M1C4B_REVIEW.md), 296 tests plus compiled checks and original reproduction independently pass. Full M1 remains incomplete. Correction and initial review snapshots below are retained as history; their withheld status is superseded.

M1c.4b correction dispatch (2026-10-01): owner-authorized F1 correction sent to Engineering after the review below. Correct disabled-account denial, retain security behavior and add regression coverage; then return for HQ re-review. D-024 permits routine in-scope review-fix coordination without repeated owner confirmation, not new milestones.

M1c.4b review update (2026-10-01): **acceptance withheld pending [F1 correction](reviews/M1C4B_REVIEW.md)**. All 294 tests and compiled checks independently pass, but a fresh disabled-account sign-in incorrectly reports bound-session revocation. No next milestone or correction was dispatched by this review; the latest accepted increment remains M1c.4a.

M1c.3 review update (2026-09-29): **accepted for isolated local synthetic-data scope**. [F1/F2/F3 are closed](reviews/M1C3_REVIEW.md). HQ independently passed 138 default + 24 auth PostgreSQL + 4 preflight + 9 M1b PostgreSQL tests (175 total) and the original uppercase-UUID retry probe. Both review-started clusters are stopped with retained data.

**Status: M1a/M1b/M1c.1/M1c.2/M1c.3/M1c.4a/M1c.4b/M1c.4c accepted within bounded scopes. Full M1 remains incomplete.** M1c.4c adds an unused offline-tested signer/transport; 423 tests and all three compiled checks independently pass in [HQ review](reviews/M1C4C_REVIEW.md). Account/store separation and sessions still use synthetic authority. Protected provider credential lifecycle/API integration, live provider compatibility, native credentials and device evidence remain. No next implementation is dispatched by this acceptance.

Outcome: a private-account athlete completes required minimal profile setup, starts an unplanned session, records a strength result and a timed activity, resumes after interruption, and synchronizes without duplication.

Accept with local SQLite/outbox plus disposable local PostgreSQL evidence: persistence across restart; blank actuals remain blank; accurate start/end/local-date/unit/load-basis semantics; duplicate retries; revision conflicts; offline/reconnect; two-user API/cache isolation; logout/account-switch protection; clear local/pending/synced/error states. Production auth is not satisfied by a test fixture. Maps to AC-01/04/05/10 and outage-related AC-11.

This is the first reliable data slice, not the finished AI coach. Keep multimodal contracts extensible without implementing every activity editor now.

### Implementation increments

- **M1a — Durable local logging: accepted for local synthetic-data scope.** Shared validation, encrypted local persistence, profile/session UI, strength/manual-time logging, recoverable drafts/intents, terminal corrections, and truthful input/record/queue status exist. F1–F6 are closed within the [reviewed scope and evidence limits](reviews/M1A_REVIEW.md). Synthetic developer-only evidence is not real authentication. This increment did not include a sender; M1b adds local sync. No hosted services or private health-data entry.
- **M1b — Local API/database synchronization: accepted for local synthetic-data scope.** Disposable PostgreSQL/API and client synchronization, retry/receipt recovery, owner isolation, and explicit conflict resolution are implemented. [F1/F2 corrections](reviews/M1B_REVIEW.md) and final-source verification are accepted with the stated native/device limits. The owner approved checkpoint publication under D-016. Synthetic identity does not satisfy production authentication.
- **M1c — Real authentication and device integration: M1c.1–M1c.3 and M1c.4a/4b/4c accepted within test-bound scopes.** [M1c.2](ENGINEERING_M1C2_HANDOFF.md) covers account/store separation and local latches; [M1c.3](ENGINEERING_M1C3_HANDOFF.md) covers isolated PostgreSQL sessions/races/privileges. M1c.4a/4b cover the offline verifier and simulated transactional exchange; [M1c.4c](reviews/M1C4C_REVIEW.md) covers unused signing/code transport with no live calls or account wiring. Next: scope protected provider credential lifecycle before integration; API/rate-limit wiring, M1c.5 native credentials and M1c.6 approved Apple/device integration remain later gates.

HQ reviews each result before the next assignment. Accepted M1a was pushed to the verified private repository as `192dbfb0f32fb26ea27a15a1a48d6370b8eec321` on 2026-09-25. The owner subsequently approved accepted M1b/docs publication and routine future commits/pushes under D-016; retained prototype, secrets, databases, private data, and generated artifacts remain excluded. This does not authorize later implementation milestones or deployment. Phone setup was deferred in favor of this sequence.

## Near-term hands-on testing and AI path

The first assigned user-visible target is an integrated synthetic sign-in → profile → log → restart/offline → reconnect/sync flow in the same app's iOS simulator. It uses actual routes/session transactions/device persistence, with only the external identity provider simulated. This advances hands-on feedback without waiting for full real-provider hardening. The subsequent target is the same flow with actual Apple sign-in on the owner's iPhone. Simulator acceptance does not complete any unverified real-provider/phone gate below.

**Scope discipline, approved D-028:** preserve essential account isolation, credential protection, durable records and recovery. Defer automated fleet/key-rotation operations, scale optimizations, dashboards and optional session-continuity refinements. Use existing adapters/guards, not new frameworks. Tests should prove realistic security/data-loss boundaries and the walkthrough; test count or isolated module completion is not a substitute for a usable flow. No stack rewrite, separate demo app, weakened release access or real-data shortcut.

- **Available foundation:** the explicit synthetic Debug flow supports minimal profile, multiple sessions, strength/manual-time logging and local test synchronization in the iOS simulator. See the [rebuild walkthrough](../rebuild/README.md). Native evidence is previously reported, not freshly rerun on 2026-10-01. Do not enter real health records. Normal/Release is still locked without real authentication.
- **Gate 1 — authentication backend integration:** finish credential protection, atomic credential/account/session linkage and approved standing/revocation behavior; wire authenticated API operations and verify account isolation/recovery end to end.
- **Gate 2 — mobile authentication integration:** native Apple sign-in, durable device credentials, activation/recovery and connection to authenticated logging/sync. Exercise simulator flows and interruption/error states.
- **Gate 3 — approved physical-phone setup and smoke test:** verify Apple signing/configuration and a secure reachable API, then sign in, save/relaunch, log offline/reconnect and switch/logout without leakage. Simulator success, localhost endpoints and Apple membership do not prove phone readiness. Decide real-data eligibility from the actual security/privacy evidence.

These are several integration/review cycles, not one remaining patch; no reliable calendar estimate is established. Track these user-visible gates rather than imply each internal auth increment makes the app phone-ready.

**AI planning can begin before these gates are all complete.** The D-019 scope/privacy/provider/model/cost/safety discussion does not require finishing public-release operations, Android or HealthKit. A first proposed coach slice should collect relevant goals/equipment/availability/check-in context, produce a validated persistent mixed-modality/multi-session plan, capture actual work and revise remaining work without rewriting history. It need not wait for every broader M2 feature; reduced scope and synthetic versus real data must be explicit at approval. No AI prototype, prompt, SDK, eval implementation or model call is authorized by this planning note.

## Mandatory checkpoint — before any product AI implementation

**Satisfied for the bounded first slice on 2026-10-02, D-029.** Owner approved the presented goals → mixed-activity plan → actual work → confirmed revision experience, GPT-6.1 Sol as the initial candidate, and $10/month including evaluations. Start with synthetic athletes and server-enforced spend controls. No AI work has been assigned yet: final native verification is reported complete, but integration F1 correction and HQ acceptance remain. Deployment/real-data/phone gates remain separate. D-019 continues to require fresh approval for material expansion beyond D-029.

## M2 — Athlete intent, nutrition, and subjective context

**Status: Planned.**

Editable natural-language goals, priorities/phases, equipment, availability, check-ins, basic consumed-food records/reuse, and deterministic totals. Clarification preserves uncertainty; editing a recipe never changes historical consumption. Maps to AC-02/07/10. Goal interpretation model calls require the AI evaluation/privacy/spend gate, not an assumed API key.

## M3 — First adaptive-coach loop

**Status: Planned.**

Generate and persist purposeful mixed-modality/multi-session days or rest days from verified available context; record actual work; revise remaining recommendations using new evidence; preserve completed work, overrides, and versioned rationale. No dependency on Apple Health.

Accept only after multi-day use/evaluations prove history and program continuity matter, multiple goals are retained, missing context is honest, and invalid/provider/budget failures preserve records. Basic nutrition/check-ins must influence relevant context. Maps to AC-02/03/04/05/07/08/09/10/11; begin measuring AC-12.

## M4 — Public-release readiness of the same app

**Status: Planned; separate hosted/release approval required.**

Complete real-device authentication/logging/coaching tests, accessibility review, account isolation/security review, consent/privacy/export/deletion, backup/restore and rollback evidence, operational observability, measured budget, and accurate résumé/store claims. Satisfy all applicable AC-01 through AC-12; AC-06 health-import behavior remains explicitly deferred, with unavailable-data behavior verified.

No public release until the approved launch checks actually pass. Owning an Apple Developer subscription is not proof signing or distribution is configured.

## Later — Health integration and platform expansion

**Status: Deferred by owner; no fixed ordering or date.**

- Apple Health: dedicated native adapter if needed, explicit consent boundaries, provenance/freshness, duplicate/correction/deletion handling, real-device verification; complete AC-06 integration coverage.
- Android: reuse shared frontend/domain/API; implement platform-specific health/auth/permission needs, Android testing and release work. No second complete frontend planned.
- Broader nutrition, athletic assessments, goal-coverage reviews, richer history, and optional watch functionality based on demonstrated value.

Do not turn future possibilities into current infrastructure or fabricate a timetable.
