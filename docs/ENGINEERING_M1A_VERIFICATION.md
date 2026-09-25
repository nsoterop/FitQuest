# FitQuest — Engineering M1a Verification Follow-up

Status: Owner-approved, dispatched, and delivered on 2026-09-24 by **Engineering**, task `01a0d053-66ed-79a0-a0bb-5b366646e723`, local host; completed turn `01a0d38e-2365-7c90-b5b4-99db73d40a9f`. Its dated section of [M1A_REPORT.md](../rebuild/docs/M1A_REPORT.md) records 24 passing tests and native evidence, with deterministic native timing races explicitly unrun. The separately approved [status correction](ENGINEERING_M1A_STATUS_FIX.md) subsequently closed F6. **HQ accepted M1a for local synthetic-data scope on 2026-09-24**, with a final independent 31-test baseline and limits recorded in [M1A_REVIEW.md](reviews/M1A_REVIEW.md). The original assignment below is retained as completed scope; it does not authorize M1b or further implementation.

## Outcome

Finish the native checks interrupted by the locked Mac and supply evidence for HQ's F1–F5 acceptance review. Passing automated checks alone does not close the native gaps. Do not rerun unrelated completed milestones.

## Starting point and inputs

- Private repository baseline: `main` at `d5835ee` before this HQ handoff. Recheck current Git state and preserve changes; do not assume that SHA remains HEAD.
- Read [HANDOFF.md](HANDOFF.md), [DECISIONS.md](DECISIONS.md), [original M1a handoff](ENGINEERING_M1A_HANDOFF.md), [correction scope](ENGINEERING_M1A_CORRECTIONS.md), [HQ findings](reviews/M1A_REVIEW.md), and the dated correction section of [M1A_REPORT.md](../rebuild/docs/M1A_REPORT.md).
- Relevant implementation: `rebuild/apps/mobile/App.tsx`, `src/editor.ts`, `src/resultIntent.ts`, `src/accountTransitions.ts`, `src/access.ts`, `src/store.ts`, and their tests. Use [rebuild README](../rebuild/README.md) for the existing loopback-only Debug/Release workflow.
- HQ's last independent `npm run check` passed 24 tests, typechecks, lint, and contracts/API builds. This is prior evidence, not a substitute for checking the version exercised now.

## Focused verification and acceptance evidence

1. **F1 — Failure, retry, and restart:** complete the previously interrupted native failed-save/retry sequence. Show input retained, honest failure feedback, retry producing exactly one result/operation, and correct state after terminate/relaunch. Distinguish native observations from the automated committed-write/failed-readback regression; do not claim a crash point that was not exercised.
2. **F2 — Late acknowledgements:** exercise editing newer input while an earlier save/draft write is outstanding and changing editors before completion. Newer input must not be cleared or marked saved by the old completion. If deterministic native delay cannot be injected with existing developer controls or a test-only harness, report that limit and reference the actual coordination regression; do not invent native coverage or change production behavior to simulate success.
3. **F3 — Account switching:** verify active A → active B → A with unsaved profile/activity/result fields and pending work, plus stale callbacks and logout locking. B must not display A's text, errors, counts, or draft state; returning to A restores only eligible A drafts. The retained B fixture is revoked. Preserve it: use a separately identified disposable simulator/test environment if needed for two active fixtures, never clear revocation or overwrite retained authorization to bypass the gate.
4. **F4 — Finished-session corrections:** exercise corrections through the UI for both completed and ended-early sessions, including strength and manual-time results across those cases. Reopen and verify stable result identity/history and unchanged session outcome/times; do not create duplicate work or reopen the session implicitly.
5. **F5 — Final profile/activity edit:** on the final correction code, repeat incomplete/invalid profile and add-activity draft recovery, then valid save and reopen. Verify draft finalization accompanies the saved fact, raw drafts do not create actual records/commands, and input/status remain truthful through a failed save. The post-final-edit native interaction was previously unrun.
6. **Release boundary and baseline:** rerun `npm run check` and verify default/Release remains locked with fixture settings/data present. Record the exact source revision/local diff and native bundle used; do not present an older binary as verification of current code. Reuse existing encryption/migration evidence where unchanged, identifying its provenance rather than repeating unrelated fault drills.

Use synthetic data only. Evidence should include the expected and observed result, environment/build, exact commands, and pass/fail/unrun status for each check. Screenshots support observations but do not by themselves prove transaction or isolation invariants.

## Ownership and allowed work

- Engineering is the only runtime/test operator and evidence writer under `rebuild/`; HQ owns shared `docs/`. Design/Architecture have no simultaneous implementation assignment. Continue in the existing checkout; no new task or worktree is needed for this serialized follow-up.
- Run bounded local checks/builds and simulator interactions. Update `rebuild/docs/M1A_REPORT.md` with a dated verification section and synthetic screenshots as useful. Test-only artifacts may stay in the already-ignored private test-artifact directory. No broad dependency changes or app feature implementation.
- If a genuine defect is found, document a bounded reproduction, relevant source, expected/actual behavior, and affected checks. Report it to HQ before changing application logic, schema, or security behavior. Do not conceal a failed check by altering fixtures or weakening assertions.
- Preserve existing encrypted stores, Keychain keys, pending commands, and simulator data. Do not erase/reset/uninstall the retained app or simulator to make a test pass. Identify any new disposable environment explicitly and leave retained environments unchanged.
- No real health data, production credentials, real sign-in, synchronization sender, PostgreSQL setup, AI, HealthKit, network exposure beyond the approved loopback workflow, Apple account changes, Render changes, migrations on hosted systems, deployment, Git commits/pushes, or repository settings changes.
- If macOS is locked or UI control is unavailable, complete unaffected safe checks, report the exact remaining checks and user action needed, and stop. Do not change lock/security settings or repeatedly retry unchanged blocked UI access.

## Deliverable and stop condition

Return a concise F1–F5/native-gate evidence matrix, changed evidence files, automated results, and any failed/unrun checks. Stop for HQ's independent source/evidence acceptance review. Do not declare full M1 or production readiness, start M1b, or dispatch another task.
