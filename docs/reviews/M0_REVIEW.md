# M0 — Project HQ Acceptance Review

Date: 2026-09-23 · Scope: local scaffold only

Subsequent update: the Debug/Metro/Fast Refresh follow-up is now accepted for simulator development. See [FOLLOWUP_REVIEW.md](FOLLOWUP_REVIEW.md). The original findings below remain historical evidence; physical-device and product-feature checks are still open.

## Outcome

**Accepted for M0's bounded local-foundation scope.** No blocking finding was identified in the reviewed scaffold. This does not accept authentication, persistence, workout logging, coaching, deployment, Android support, or public-release readiness; none is implemented by this milestone.

Engineering completed its assigned task and stopped. Review inputs: [Engineering handoff](../ENGINEERING_HANDOFF.md), [M0 report](../../rebuild/docs/M0_REPORT.md), source/package/configuration files under `rebuild/`, and the saved simulator screenshot. No application source was changed during HQ review.

## Evidence and its limits

- **Independently rerun by HQ:** `npm run check` from `/Users/nicksoteropoulos/Code/FitQuest/rebuild` exited 0. Contract/API/mobile typechecks, ESLint, four tests across two files, and contract/API production builds passed.
- **Inspected by HQ:** the app is a truthful foundation screen; `/health` uses the strict shared contract; the API binds to loopback; there are no runtime athlete records, provider calls, database connections, or health permissions in the reviewed source/configuration.
- **Independently checked by HQ:** generated native/build/dependency files, environment files, local SQLite files, and private test artifacts are matched by subtree ignore rules. This is not a complete secret/dependency/security audit.
- **Engineering-reported evidence, not rerun by HQ:** clean install, Expo dependency compatibility check, HTTP liveness request, Metro bundle service, native Debug/Release builds, and the documented Release simulator command. Commands, outcomes, and warnings are recorded in M0_REPORT.md.
- **Artifact inspected by HQ:** `rebuild/docs/m0-simulator.png` shows the expected foundation screen. This corroborates the reported rendered UI; it does not prove live network behavior, authentication, or persistence.
- **Git limitation:** no committed baseline exists. Engineering reports prototype preservation; current Git status cannot independently prove a complete before/after comparison of untracked prototype files. HQ made no prototype edits in this review.

## Carry-forward work

1. **Development workflow:** Engineering's Debug build compiled but launched without a script URL; the verified screen uses a Release build with embedded JavaScript. Before depending on interactive M1 development, verify a repeatable Debug + Metro/Fast Refresh workflow, restart/relaunch behavior, and loopback-only configuration. Do not present this unverified path as working or assume the production app is broken from that launch mode alone.
2. **Physical device and signing:** not tested. Keep separate from simulator evidence; authorize required signing/account or network changes before taking them. Complete device-specific checks before accepting dependent authentication and durable logging behavior.
3. **Version control:** establish a reviewed, secret-safe initial baseline before worktree-based parallel work. Do not broadly stage all existing untracked content or publish private data.
4. **M1 prerequisites:** Architecture reviews minimal profile/session/result, SQLite/outbox, authentication/session, ownership, and conflict contracts; Design proposes onboarding/logging/save-state flows. No new task or M1 implementation was dispatched as part of this status review.

These are explicit next gates, not claims of features delivered by M0. The core stack and deferred Apple Health decision are unchanged.
