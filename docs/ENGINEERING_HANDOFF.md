# FitQuest — Engineering Handoff: M0 Local Foundation

Status: Completed by Engineering and accepted by HQ on 2026-09-23 for M0 local-scaffold scope. See [M0_REVIEW.md](reviews/M0_REVIEW.md) for original evidence and [FOLLOWUP_REVIEW.md](reviews/FOLLOWUP_REVIEW.md) for the subsequently accepted Debug/Fast Refresh workflow. Physical-device checks remain open. The assignment below is retained as the completed scope, not authorization to rerun it or begin M1.

## Task and required context

Establish a small, reproducible local foundation for the clean rebuild. This is not permission to complete every roadmap milestone. Read all applicable repository instructions, then the complete PRODUCT_BRIEF, PROJECT_CONTEXT, ROADMAP, DECISIONS, DESIGN_SYSTEM, and HANDOFF files in `/Users/nicksoteropoulos/Code/FitQuest/docs/`.

React Native + TypeScript + Expo, TypeScript/Fastify API, shared framework-independent contracts, later local SQLite and server PostgreSQL. Initial iOS release; retain a shared Android path. No SwiftUI-only app scaffold. Apple Health integration is explicitly deferred, including the previously proposed HealthKit proof-of-concept.

## Ownership and environment boundaries

- You are the only implementation writer. Create all new application/package/test/setup files under `/Users/nicksoteropoulos/Code/FitQuest/rebuild/`.
- Keep an independent package manifest and lockfile; do not change prototype `apps/`, `services/`, `packages/`, root package files, database/deployment files, or HQ-owned `docs/`.
- Do not copy old environment files, real health records, fallback routines, or hardcoded demo progress. Inspect existing code only for lessons.
- Check whether `rebuild/` already exists and preserve any unexpected work; stop for coordination if ownership conflicts arise.
- No deployments, remote migrations, cloud/Apple account configuration changes, service provisioning, paid calls, credential creation, destructive Git operations, or prototype deletion. Do not create commits/worktrees or publish code in this task.
- Prefer local simulators/test fixtures and disposable test paths. Do not configure a server to accept public-network connections. Any device-LAN exposure or credential setup must be explained before changing it.

## In scope

1. Verify local toolchain and applicable instructions. Report Node/package manager/Xcode/simulator availability and compatibility using current official documentation. Do not assume prototype package versions are appropriate. Use relevant available skills when applicable.
2. Scaffold a minimal Expo/React Native TypeScript app with an honest foundation screen, a Fastify API with a testable health endpoint, and shared runtime-validated contract types. Use a coherent supported dependency set and lockfile, but do not make a Git commit.
3. Keep domain/contracts independent of React Native and Fastify. The first shared example can be the health response; do not invent a full athlete schema or AI system in M0.
4. Provide repeatable install/start/typecheck/lint/test/build commands, API endpoint tests, safe `.env.example` files, and a local README. Explicitly ignore secrets, local databases, generated native/build files, and private test artifacts in the new subtree.
5. Verify the app's local startup and, if tooling allows, an iOS simulator build. Prefer a reproducible development-build path; do not claim Expo Go alone proves native production readiness. No custom HealthKit module is needed. Do not purchase build services or change signing identities to make a check pass.
6. Record exact commands, exit results, test counts, app/API observations, unresolved issues, dependency/version rationale, and remaining native/device checks in `rebuild/docs/M0_REPORT.md`.

If an install or command would cross an approval boundary, stop that action and explain the required approval. A missing local tool does not authorize modifying the user's system globally or using the old hosted project.

## Explicit non-goals

No real authentication/session implementation, user database migrations, athlete records, workout generator, AI provider calls, nutrition workflow, HealthKit/Android health integrations, Android release testing, visual redesign, or old-project migration. No runtime dummy workouts or fake metrics. A local scaffold screen is not a separate demo product.

Do not start M1 automatically. Its actual-session/ownership/idempotency contracts and Design flow need review first.

## Acceptance and verification

- The prototype stays intact; changed files are limited to the new subtree.
- Documented commands work from `rebuild/`, without accidentally resolving prototype configuration or dependencies.
- API health endpoint behavior has automated coverage, runtime response validation, and a successful local check.
- Typecheck/lint/tests/API production build results are recorded. No suppressed errors or meaningless passing test placeholders.
- App startup and simulator/native-build status are separately reported; screenshots may corroborate UI but are not persistence tests.
- No HealthKit permission/dependency/import or fabricated athlete data is added.
- Environment examples contain placeholders only; logs and final response expose no secrets or personal health values.
- Clearly label blocked/unrun checks. Do not mark M0 complete when a required acceptance check remains unverified.

Conclude with the changed files, verification evidence, limitations, and the specific next gate. Do not edit HQ's shared status documents or dispatch additional tasks yourself.
