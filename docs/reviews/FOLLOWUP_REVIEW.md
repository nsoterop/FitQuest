# FitQuest — Development Loop and M1 Recovery Review

Date: 2026-09-23 · Status: both bounded follow-ups accepted by HQ

## Outcome and authority

Engineering's simulator development workflow meets its handoff. Architecture's recovery addendum answers both required clarification requests and the transaction guardrail. No further broad Architecture cycle is needed before Design. Acceptance of the recovery baseline is not evidence that authentication, storage, or synchronization work: none is implemented in the rebuild. M1 implementation still needs a separate scoped assignment.

HQ changed shared documentation only. No app source, dependency, account, deployment, hosted database, Apple configuration, or Git history was changed by this review.

## Engineering evidence

Source: **Engineering**, task `01a0d053-66ed-79a0-a0bb-5b366646e723`, completed turn `01a0d0e2-c0d9-7061-87b2-8328e50f8789`; [full report](../../rebuild/docs/DEV_WORKFLOW_REPORT.md).

- Reviewed the actual package scripts, pinned development dependency, restored foundation screen, setup instructions, report, and [Debug screenshot](../../rebuild/docs/dev-debug-simulator.png).
- Engineering observed Debug loading, temporary-text Fast Refresh and restoration, app termination/relaunch, Metro stop/restart recovery, and a Release render with Metro stopped. Its report records exact commands, native warnings, and loopback-only listener evidence. These are Engineering's observed results; HQ did not independently repeat native builds or interactive Fast Refresh.
- HQ independently reran `npm run check` from `rebuild/`: contract/API/mobile typechecks, lint, four tests across two files, and contract/API builds passed (exit 0).
- The added `expo-dev-client` and separate watch-enabled Metro workflow match [Expo's local development guidance](https://docs.expo.dev/guides/local-app-development/). The IPv4-first script addresses the reported mismatch between the listener and advertised localhost address. This is a checked local setup, not a universal networking guarantee.

Physical iPhone, signing, Android, authentication, persistence, and hosted deployment remain unverified. A Debug app needing Metro is documented development behavior, not a claim of offline product functionality.

## Architecture closure

Source: **Architecture**, task `01a0d09d-2bf8-79e0-8a59-6b4043aa18f5`, completed turn `01a0d0e2-cb28-7f02-bd5d-060170306cc8`; [complete addendum](../proposals/M1_RECOVERY_ADDENDUM.md).

1. **Dependent saves:** unknown outcomes retry the identical immutable operation; definite failures block descendants. Recovery preserves the latest local projection, obtains the server revision, and atomically supersedes the blocked chain with an explicitly reviewed replacement. A local edit-sequence/account-generation guard prevents stale conflict resolution from overwriting newer edits. Rejected outcomes are retained; missing receipts are not interpreted as failure. This closes the A-expects-3/B-expects-4 example and profile-prerequisite behavior.
2. **Credential persistence:** pending credentials cannot access private records until activation after durable device storage. Lost unpersisted secrets require fresh sign-in without erasing the account or offline records. One versioned credential bundle records the refresh/storage phase. This replaces the original encrypted refresh-response replay proposal; do not implement both. Challenge claims, late responses, expiration, duplicate refreshes, and interrupted activation have explicit outcomes.
3. **Transaction races:** short per-account guarded transactions use a consistent account → auth-session → operation-claim → aggregate order. Claim account-wide operation IDs before aggregate mutation; state, revision, and successful outcome commit together. Apple/provider HTTP remains outside database locks. These choices align with [PostgreSQL locking guidance](https://www.postgresql.org/docs/current/explicit-locking.html).

The addendum supplies crash/race tests for each boundary. They are required future evidence, not passing tests. Exact durations (including the proposed five-minute activation deadline), adapter/encryption settings, supported OS policy, and operational limits remain implementation-gate decisions. Actual Apple configuration/signing and physical-device network access require separate owner authorization.

## Dependency finding — tracked, not remediated

HQ ran `npm audit --json --ignore-scripts --fetch-timeout=10000 --fetch-retries=0` against the current independent rebuild lockfile. It exited 1 with ten moderate package entries, zero high, and zero critical. The entries trace to one root advisory, **GHSA-w5hq-g745-h8pq**, in transitive `uuid@7.0.3` through `xcode@3.0.1` and Expo's configuration toolchain.

The [maintainer advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) concerns caller-supplied buffer bounds in the `v3`/`v5`/`v6` functions. Inspection of `node_modules/xcode/lib/pbxProject.js` found `uuid.v4()` as its generation call; no affected function call was found in the inspected xcode library. That is limited reachability evidence, not a complete dependency or production security audit.

Do not run a forced automatic fix: the current audit suggests changing Expo to 46.0.21, outside the validated SDK 57 stack. Engineering should evaluate a compatible upstream resolution in a bounded dependency task and recheck before private-data/release acceptance. This finding does not block a read-only Design proposal. No dependency was changed during triage.

## Next gate

Prepare and review the [M1 Design proposal](../DESIGN_HANDOFF.md), then issue incremental Engineering scopes: contracts/local capture; disposable local API/database synchronization; real authentication/device verification. Do not assign all of M1 at once or present this first strength/timed logging slice as the finished adaptive coach. No new task was created or dispatched in this review.

The Expo development-client and native-data-fetching skills focused the review on observable development behavior, credential persistence, and retry states; PostgreSQL guidance focused it on short, consistently ordered transactions. Their use did not authorize hosted changes or substitute for runtime failure tests.
