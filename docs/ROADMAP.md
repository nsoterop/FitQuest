# FitQuest — Roadmap

Updated: 2026-09-24 · Maintainer: Project HQ

Statuses describe evidence, not aspiration. The roadmap is not blanket implementation or deployment permission. Maintain one implementation writer per working tree; separately approved read-only work may run alongside a non-overlapping implementation handoff.

## Foundation decisions — complete

- Product brief and core stack approved; React Native supersedes Swift.
- Apple Health explicitly deferred; shared Android path retained.
- Cross-task documents established. M0 scaffold evidence reviewed and accepted; actual athlete/coaching behavior remains unimplemented.

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

**Status: M1a and the owner-approved F1–F5 correction pass delivered; HQ acceptance remains pending on 2026-09-24.** HQ's fresh baseline passes 24 tests, typechecks, lint, and builds. Engineering reports additional native evidence, with the final retry and post-final-edit profile/activity walkthrough interrupted by a locked Mac. Passing checks and a Git snapshot do not close acceptance findings. See [M1a review](reviews/M1A_REVIEW.md), [correction handoff](ENGINEERING_M1A_CORRECTIONS.md), [Architecture recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md), and [Design review](reviews/M1_DESIGN_REVIEW.md). M1b is not dispatched; full M1 remains incomplete.

Outcome: a private-account athlete completes required minimal profile setup, starts an unplanned session, records a strength result and a timed activity, resumes after interruption, and synchronizes without duplication.

Accept with local SQLite/outbox plus disposable local PostgreSQL evidence: persistence across restart; blank actuals remain blank; accurate start/end/local-date/unit/load-basis semantics; duplicate retries; revision conflicts; offline/reconnect; two-user API/cache isolation; logout/account-switch protection; clear local/pending/synced/error states. Production auth is not satisfied by a test fixture. Maps to AC-01/04/05/10 and outage-related AC-11.

This is the first reliable data slice, not the finished AI coach. Keep multimodal contracts extensible without implementing every activity editor now.

### Implementation increments

- **M1a — Durable local logging: correction pass delivered, acceptance pending.** Shared validation, encrypted local persistence, profile/session UI and strength/manual-time logging exist. The [HQ review](reviews/M1A_REVIEW.md) identifies the five original gaps; Engineering's dated report maps fixes and new tests to each. Review those changes and remaining native checks before closure. Synthetic developer-only evidence is not real authentication. No sender, hosted services, or private health-data entry.
- **M1b — Local API/database synchronization: planned, not dispatched.** Separately scoped disposable PostgreSQL/API transaction, retry/conflict, isolation, and client synchronization evidence. Fixtures still cannot close production authentication.
- **M1c — Real authentication and device integration: planned, not dispatched.** Verify actual identity/credential lifecycle and authenticated flow on device, with separate approval for Apple configuration, transport, and any hosted changes. Complete all M1 acceptance gates before declaring durable authenticated logging done.

HQ reviews each result before the next assignment. A live timer is outside M1a; manual timed logging already exercises the required modality. On 2026-09-24, the owner separately approved private GitHub creation and a reviewed baseline push; HQ is executing that setup after the correction delivery. It excludes the locally retained prototype, secrets, private data, and generated artifacts. See HANDOFF for verified repository state. Worktrees remain subject to explicit scope and integration ownership.

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
