# FitQuest — Engineering M1a Corrections

Status: Explicitly owner-approved, dispatched, and delivered on 2026-09-24 by **Engineering**, task `01a0d053-66ed-79a0-a0bb-5b366646e723`, local host. HQ independently passed the 24-test/typecheck/lint/build baseline for this correction delivery. The separately approved [verification follow-up](ENGINEERING_M1A_VERIFICATION.md) and subsequent [F6 status correction](ENGINEERING_M1A_STATUS_FIX.md) are also delivered and reviewed. **M1a is now accepted for local synthetic-data scope**, with a final independent 31-test baseline. The [HQ review](reviews/M1A_REVIEW.md) and dated [Engineering report](../rebuild/docs/M1A_REPORT.md) retain the evidence boundaries. This completed assignment is retained below, not reopened as broad implementation permission.

## Goal and inputs

Close findings **F1–F5** in [M1A_REVIEW.md](reviews/M1A_REVIEW.md), preserving the delivered local logging slice. Read that review, the [original M1a handoff](ENGINEERING_M1A_HANDOFF.md), current DECISIONS/DESIGN_SYSTEM/HANDOFF, and [Engineering's evidence report](../rebuild/docs/M1A_REPORT.md). The review contains source locations, bounded reproductions, and expected regressions. Reproduce against current code; line numbers may move during implementation.

Relevant files: `rebuild/apps/mobile/App.tsx`, `rebuild/apps/mobile/src/store.ts`, `access.ts`, existing repository tests, and shared contracts where a correction requires them. The prior 11-test baseline passes but does not cover these UI/lifecycle boundaries.

## Required outcomes

1. **F1 — Restart-safe draft-to-fact save:** interrupted saves and retries from the user flow create one logical result/save. Link durable save intent, stable result/operation identity, and draft finalization so a committed fact cannot return as an unsaved new entry after restart or failed readback. Keep command content/history immutable.
2. **F2 — Latest input preserved:** an earlier save/draft acknowledgement cannot clear, overwrite, or label newer input saved. Protect account, editor, and input-version boundaries through delayed writes, rapid edits, editor changes, and failure/retry. Do not solve this by discarding newer input.
3. **F3 — Complete account isolation:** no old account's transient fields, errors, counts, drafts, or late callbacks appear in another account. Guard overlapping account opens/selections and clear or safely scope UI state. Preserve eligible durable drafts for return to their original account; no database wipe as a workaround.
4. **F4 — Finished-session corrections:** corrections work for both completed and ended-early sessions, preserving result IDs/history and the session's existing outcome/times unless explicitly changed through an allowed action. Do not silently reopen or create duplicate performed work.
5. **F5 — Complete form-draft coverage:** profile/setup and add-activity drafts, as well as result drafts, recover for their owner after interruption. Invalid/incomplete drafts are not actual records or outbox commands. Visible saved status follows actual persistence.

Choose the smallest maintainable implementation. Extract testable editor/save/access coordination boundaries as needed, without a broad redesign or reopening the approved stack. If local schema changes are necessary, add a numbered forward migration that preserves existing synthetic records and pending commands; do not change an applied migration's checksum, reset stores, or regenerate encryption keys to bypass recovery.

## Ownership and constraints

Engineering is the only implementation writer under `rebuild/`; HQ owns shared `docs/`. Preserve unrelated changes and the old prototype. Use relevant Expo skills/current primary guidance where needed. No other task dispatch, Git commits/remotes/branches/worktrees, GitHub writes, dependency-wide upgrades, machine-global installs, Apple configuration, network exposure, real health data, real credentials, backend sync, real sign-in, AI, or HealthKit.

The owner reports connecting Render; this is **not deployment or hosted-change approval**. Do not inspect/use hosted data or alter Render services, settings, billing, or databases for this local correction pass. Keep fixture identities opt-in, developer-only, and separate from future real accounts; default/Release remains locked.

## Verification and completion

- Add automated regressions covering each finding through the actual UI coordination code or extracted boundaries used by the UI—not only repository calls or copies of the implementation in a test harness.
- Exercise crash/reopen points, a committed write followed by failed readback, delayed draft/save completion, edits during saves, rapid account changes, stale callbacks, all three form types, and post-completion corrections.
- Verify forward migration/reopen preserves existing synthetic history/drafts/pending commands if storage changes. Retain original encrypted fixture data; use separately identified disposable stores for injected failures.
- Rerun `npm run check`, including the added tests. Repeat affected native simulator workflows and default/Release gating; retain SQLCipher/key/rollback evidence as applicable. Do not infer native behavior solely from mocks or compilation.
- Update `rebuild/docs/M1A_REPORT.md` with a dated correction section mapping F1–F5 to changes, exact automated/native evidence, and any limitations. Update rebuild README if steps changed. Screenshots and test data must stay synthetic.
- Continue routine in-scope edits/tests until these checks pass or a specific authorization/tooling blocker remains. Report blocked/unrun checks honestly. Stop for HQ acceptance review; do not start M1b or GitHub setup.
