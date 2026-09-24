# FitQuest — Engineering Follow-up: Development Loop

Status: Completed by **Engineering** and accepted by HQ on 2026-09-23 for simulator development-workflow scope. See [Engineering's report](../rebuild/docs/DEV_WORKFLOW_REPORT.md) and [HQ review](reviews/FOLLOWUP_REVIEW.md). The original assignment below is retained as completed scope, not authorization to begin M1 features. Physical-device validation remains separate.

## Goal and context

Make the ordinary iOS simulator Debug + Metro/Fast Refresh workflow reproducible for the existing `rebuild/` app. M0's Release simulator build is verified, but its Debug launch without a bundler URL showed an error screen. Diagnose the actual development path rather than assuming a compile failure.

Read current PROJECT_CONTEXT, DECISIONS, HANDOFF, [M0 review](reviews/M0_REVIEW.md), and [M0 report](../rebuild/docs/M0_REPORT.md). Use relevant Expo skills and current official documentation. Preserve the approved React Native stack and deferred HealthKit scope.

## Ownership and constraints

- Engineering is the only implementation writer; changes are confined to `rebuild/`.
- Allowed scope when dispatched: local run/configuration scripts, minimal compatible development tooling if justified, local README instructions, and an evidence report. Do not change HQ-owned docs or prototype files.
- No athlete/auth/database/AI/HealthKit features, visual redesign, dependency-wide upgrade, migration, real health records, global tool installation, paid/cloud build, hosted or Apple-account configuration, signing-identity changes, or Git commit/worktree.
- Keep Metro/API loopback-only. No tunnel, LAN exposure, or physical-device transport configuration without separate approval. Inspect generated native state before regenerating; preserve unexpected user changes.

## Acceptance and verification

1. Document a repeatable command sequence from `rebuild/` that launches the Debug app on the simulator and loads the correct Metro bundle.
2. Observe the actual foundation screen, not just a successful native compile. Confirm Fast Refresh with a temporary harmless development-only text change, then restore that change before handoff.
3. Verify app termination/relaunch and Metro stop/restart recovery. Document expected unavailable-bundler behavior honestly.
4. Preserve and smoke-check the existing Release path; rerun `npm run check` and record results.
5. Report network binding, commands, exact outcomes, file changes, screenshots where useful, and remaining physical-device limitations in `rebuild/docs/DEV_WORKFLOW_REPORT.md`.

Stop and report approval/tooling blockers rather than changing machine-global or hosted configuration. Do not start M1 afterward or edit shared project status. A verified development loop does not validate storage, authentication, or coaching.
