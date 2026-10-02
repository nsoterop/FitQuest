# FitQuest — First Hands-On Integration Review

Date: 2026-10-02 · Project HQ · Acceptance withheld for one bounded integration regression.

## Outcome

The connected synthetic flow is delivered, including Engineering's final native verification. HQ found one user-visible regression (F1 below), not a need for another architecture or infrastructure milestone. Restore the existing conflict recovery in the integrated account, then return for focused re-review. The approved D-029 AI slice remains queued until this integration is accepted and its scoped handoff is issued.

Scope: [hands-on handoff](../ENGINEERING_FIRST_HANDS_ON_HANDOFF.md). Delivery: [Engineering report](../../rebuild/docs/FIRST_HANDS_ON_REPORT.md). Reviewed implementation is the uncommitted integration delivery over `180fc0e2b6f71aa55c9fb424d5790758c7498780`; that commit contains HQ's AI approval record, not this implementation.

## F1 — P2: integrated accounts cannot reach conflict recovery

Evidence in `rebuild/apps/mobile/App.tsx` at review time:

- Lines 124–127: the integrated sender's view callback updates sync status/pending count but never reloads recovery targets. Targets are loaded once when attaching the sender. The original fixture callback at lines 141–144 does refresh them after sender updates.
- Lines 406–416: every “Review blocked” action and both explicit conflict choices are inside the `__DEV__ && !integrated` card. The integrated card offers retry/pause/resume but no way to review or resolve a blocked profile/session.

A profile/session revision conflict therefore leaves the affected aggregate blocked with no in-app resolution in the new flow. Ordinary retry does not replace a rejected immutable operation with a reviewed new revision. This regresses accepted M1b functionality and the handoff's requirement to reuse the existing sender/recovery contracts; it is not a request for new conflict policy or UI design.

HQ independently reproduced the callback defect using the actual `attachLocalSync` function extracted from App.tsx with the TypeScript AST and executed with injected stores/sender/state setters: attach with no targets, change the store's targets to a blocked profile, then emit a blocked sender view. The recovery-target read count stays at one and the displayed target list stays empty. Separate source inspection confirms the controls' `!integrated` condition. This is a source-driven callback probe, not an independently operated native conflict walkthrough.

Correction acceptance:

1. Share the existing review/resolve controls with integrated accounts, without exposing fixture-token or fixture-authority controls there.
2. Refresh recovery targets after integrated sender changes, preserving active-store/context/sender guards across asynchronous reads and account changes.
3. Exercise a conflict that arises after initial attachment, both explicit choices, restored profile/session/editor state, and disappearance of resolved targets. Retain draft/history and account-isolation behavior; stale callbacks must not install another account's targets or review.
4. Add focused regression coverage tied to the actual screen wiring/callbacks. Observe a focused integrated Debug conflict/recovery walkthrough using only synthetic data. Reuse existing components; no new recovery framework, schema, dependencies or server policy is requested. Preserve Release gating and rerun relevant checks in proportion to changed files.

## Independent HQ evidence

Freshly passed on Node 24.12.0:

| Check | Result |
| --- | --- |
| `npm run check` | 506 tests: 363 API, 12 contracts, 131 mobile; typechecks, lint and builds pass |
| `npm run test:pg:integration` | 3 HTTP/PostgreSQL tests + 2 guard tests pass |
| `npm run test:pg:exchange` | 40 PostgreSQL tests + 8 guard tests pass |
| `npm run test:pg:auth` | 24 PostgreSQL tests + 4 guard tests pass |
| `npm run test:pg` | 9 PostgreSQL tests pass |
| Three existing offline compiled probes | M1c.4a, M1c.4c and M1c.4d.1 pass |

Total: **596 passing automated tests**, plus the three compiled probes. Passing suites do not cover the screen regression above. Existing experimental SQLite warning remains. HQ inspected route composition, transport, secure-row serialization, coordinator/native integration, harness/provider isolation, DB guards and relevant screen/sender code. PostgreSQL review emphasized existing transaction-bound authorization and restricted roles, not speculative scaling changes.

All four retained clusters were initially stopped. HQ started them through their existing migration/seed-free guards; the integration suite targeted only `fitquest_m1_integration_test`, never the durable demo database. All four review-started clusters were stopped afterward with data retained. No hosted changes, migrations, real-provider calls, real health records or paid model calls occurred.

## Native evidence and limits

Engineering reports completion of final Release locked-state observation, Debug reinstallation without erasing records, retained mixed records, expiry/refresh and process-restart recovery on the existing iPhone 17 iOS 26.4 simulator. The previous Mac-lock verification blocker is resolved. HQ inspected the final Release and recovery screenshots: Release shows records locked; recovered Debug shows Amber ready with nine confirmed operations and zero pending/uncertain. HQ did not repeat native builds or operate that flow independently. Build/device hashes and detailed observations remain in the delivery report.

This remains controlled synthetic simulator testing. Real Apple authentication, phone signing/runtime, real-data eligibility, hosted deployment, public release and C1's proposed provider policy are not accepted by these results. No AI implementation has started.

## Coordination

HQ dispatched F1 to the existing Engineering chat (`01a0d053-66ed-79a0-a0bb-5b366646e723`) on 2026-10-02 under D-024. Engineering remains the sole implementation writer under `rebuild/`; HQ owns this review and shared status docs. Architecture and Design remain idle. Do not checkpoint the unaccepted implementation or turn this correction into a broader hardening initiative.
