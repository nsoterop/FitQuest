# FitQuest — Design: M1 Interaction Proposal

Status: Completed in the owner-created **Design M1 sign-in and profile** task (`01a0d101-4c19-7b63-8d49-5fa0e5f70129`). Initial UX direction and provisional visual direction approved by the owner on 2026-09-23. See [source snapshot](proposals/M1_DESIGN_PROPOSAL.md) and [HQ review](reviews/M1_DESIGN_REVIEW.md). The original read-only assignment below is retained; only the separate [M1a Engineering handoff](ENGINEERING_M1A_HANDOFF.md) authorizes implementation. No Design file-editing assignment is active.

## Goal

Design the smallest coherent iOS-first experience for required minimal profile setup and durable mixed-activity logging. FitQuest is an adaptive athletic coach, not a lifting-only tracker. M1 proves its data foundation; natural-language goals, broader athlete context, nutrition, and AI plans follow in later milestones. Do not imply they already work or design the initial profile as finished onboarding.

## Required context

Read PRODUCT_BRIEF, PROJECT_CONTEXT, ROADMAP, DECISIONS, DESIGN_SYSTEM, and HANDOFF in this directory, then [the M1 contract proposal](proposals/M1_ARCHITECTURE_PROPOSAL.md), [accepted recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md), and [HQ follow-up review](reviews/FOLLOWUP_REVIEW.md). The addendum supersedes conflicting recovery details in the original proposal. Inspect `rebuild/apps/mobile/App.tsx` and its package configuration only to understand the current foundation; no product screens exist yet.

## Deliverable

Return a concise proposal in the Design task, with a screen/interaction map, low-fidelity layouts or textual wireframes, a small provisional token/component set, and an acceptance walkthrough. Do not build a large app-wide design system or require an external design-service account.

Cover:

- Sign-in entry, required minimal timezone/unit/profile setup, validation, and returning-account states. Default pounds/miles; preserve activity-appropriate units and per-side/per-dumbbell load meaning. Keep broader goal onboarding explicitly deferred, not removed.
- Start/resume an unplanned session; record strength actuals and a timed activity; edit, leave values unknown, and finish or leave the session incomplete. Multiple sessions per day must be possible. No prescriptions prefilled as performed work.
- Distinct editing, saving locally, local-write failure, locally saved/pending synchronization, server-confirmed, rejected/conflicted, and needs-sign-in states. An older acknowledgement must not make newer edits look synchronized. Backend receipt uncertainty must not invite unsafe replacement/resubmission.
- Restart/offline continuation and safe reconnection. Conflict review preserves newer local work and prompts a new review if it changed during resolution. Translate technical states into understandable copy without exposing internal operation IDs.
- Logout/account switch with pending records: no silent discard, no cross-account display or replay, truthful server-revocation-pending state, and recovery when returning to the verified original account. Propose any destructive-action interaction separately; do not assume authorization to delete data.
- Accessibility: readable contrast, text scaling, labels, comfortable touch targets, non-color-only save status, keyboard/error focus, and long/loading/empty states. Propose a small reusable set of inputs, buttons, cards, status indicators, and error treatments suitable for shared React Native UI.

## Constraints and ownership

- Read-only proposal: no repo edits, installs, commits, implementation, hosted changes, new task dispatch, or external design-file writes. HQ incorporates approved decisions into shared docs; a future approved UI implementation must have exclusive file ownership.
- No HealthKit connection/permissions, wearable claims, AI output, hardcoded owner plans/goals/biometrics, fabricated progress, or populated personal-data demo. Any synthetic wireframe values must be clearly labeled illustrations, never seed data.
- Preserve React Native/Expo and the shared Android path. Do not reopen database/auth architecture; flag a genuine contract conflict to HQ. No platform-only UI without an explicit future fallback.
- Visual choices are recommendations, not already approved. Keep the first proposal narrow enough to decide and implement.

## Acceptance and verification

Map each flow to the existing contract and applicable AC-01/04/05/10 and outage-related AC-11. Walk through: new profile; mixed session; blank actual; local-write failure; offline save/restart; lost server response; conflict with another edit during review; expired credentials; account A with pending work switching to B and returning to A.

State which behavior is depicted versus actually implemented. A mockup does not verify storage, sync, or authentication. Identify only decisions needed for this slice and recommend defaults. Return the proposal and stop for HQ/owner review; do not begin Engineering work.
