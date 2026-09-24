# FitQuest — Design System and Interaction Constraints

Updated: 2026-09-23 · Maintainer: Project HQ; visual proposals owned by Design

## Approval status

The owner approved the initial M1 UX direction and provisional neutral/teal visual direction on 2026-09-23. The [complete Design proposal](proposals/M1_DESIGN_PROPOSAL.md) supplies textual wireframes and proposed tokens; [HQ's review](reviews/M1_DESIGN_REVIEW.md) defines acceptance and scope. Exact palette values, typography sizes, and component details are starting defaults for rendered review, not a permanently locked brand system. The prototype is not the accepted design baseline.

Approved initial UX: Sessions home with Account entry, minimal required profile setup, strength/manual-time actuals, multiple sessions per day, and explicit local-save/sync states. This navigation can evolve when goals and coaching become implemented features; do not add empty future-feature tabs now.

The following product interaction requirements continue to govern implementation:

- One coherent public product with private athlete accounts; no required demo mode.
- Required editable athlete onboarding and natural-language goals; do not force all goals into a lifting taxonomy.
- Accessible labels, readable contrast, text scaling, comfortable touch targets, and understandable loading/empty/error states.
- Distinguish prescriptions from entered actuals. Never prefill a target as completed work.
- Activity-appropriate controls: reps/load, duration/distance/intervals, effort and movement-quality fields as applicable.
- Clearly distinguish locally saved, pending sync, server-confirmed, and failed/conflicted records. Do not show an unconditional "Saved" toast for an unsuccessful write.
- Preserve unfinished sessions through interruption; allow partial, skipped, substituted, and unplanned work.
- Show estimates and missing information honestly; no fabricated charts, PRs, streaks, recovery scores, or connected-health status.
- No Apple Health permission or connection flow in the current milestones.
- Default pounds/miles, preserving meaningful alternate units and load basis.

## Initial Design assignment — completed; implementation direction approved

The owner created **Design M1 sign-in and profile**, task `01a0d101-4c19-7b63-8d49-5fa0e5f70129`, and supplied the [M1 Design handoff](DESIGN_HANDOFF.md). Its read-only proposal is complete. The owner approved HQ's recommended direction; no Design implementation writer is assigned.

Engineering now owns the first scoped UI implementation through [M1a](ENGINEERING_M1A_HANDOFF.md). Use manual duration entry initially; do not implement the proposal's optional live timer or backend-dependent recovery screens in this slice. Truthful unavailable-auth/sync states take precedence over showing a complete-looking but nonfunctional flow.

Avoid an app-wide visual redesign before the data flow is usable. Shared React Native components are the baseline; any platform-specific UI needs a stated reason and Android fallback strategy. Do not implement screens while Engineering owns them in the same working tree.

The expired-credential local-access policy is recorded in D-012 of [DECISIONS.md](DECISIONS.md). Rendered layout/accessibility review follows implementation. A screenshot or mocked interaction is not evidence of functioning persistence or authentication.
