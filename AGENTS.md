# FitQuest — current agent workflow

## Authority and active scope

The owner's latest explicit instructions control the work. Follow the owner's roadmap; do not invent features, milestones, architecture initiatives or paid evaluations. Feature work is paused.

The current assignment is the owner's October 10 request to organize the whole project and remove files no longer needed. Group mobile/backend source by feature, separate tests and support code, give documentation a clear index, and remove verified obsolete tracked artifacts. Preserve behavior, necessary legacy readers, migrations, accounting, private records and owner-managed files. MIT remains selected. Feature work remains paused.

Prior instructions and duplicate release notes were removed from the working tree because Git preserves their historical versions. Git history is evidence, not an active work queue or permission to deploy, migrate, reset or spend. The concise retained release record is under `docs/archive/releases`.

## Publication boundary

Local scoped edits, proportionate tests, self-review, commits and private publication through `codex/publication-safety` are authorized. Inspect the actual deployment branch and triggers before pushing. Check for a matching PR before creating one, and verify that it cannot start a preview/deployment or provision a resource. Attach any created PR to this chat. If trigger safety cannot be established, finish safe work and report the precise blocker.

Do not merge, change visibility/default branch/protection, deploy, apply hosted migrations, reset training content, modify credentials/trust/signing, rewrite history, force-push, provision resources or make a native build. No new paid AI call or owner-plan regeneration is assigned. Keep the live service and scheduler unchanged. MIT is selected; no further license-choice approval is required.

## Ownership and process control

Engineering is the sole application/documentation writer; HQ has finished its edits. Serialize edits and stop for a genuine concurrent-writer conflict. Do not revert someone else's work. Existing untracked design assets and local files remain protected. HQ review is only required when specifically requested, not a routine publication gate.

The owner controls long-running local development servers. Temporary servers are authorized for testing only: record which processes you start and stop them on success or failure. Never stop, restart, replace or work around an owner-started process by moving to another port. Prefer finite/offline checks. Do not leave hidden or supervised servers running.

## Preserve behavior and private data

Keep current prompts/model settings, five faithful intake answers, complete saved-week visibility, overview-before-acceptance, free acceptance/reopen, legacy readers, revision/idempotency protections, consent enforcement and account isolation unchanged unless explicitly assigned otherwise. Shared contracts live in `backend/src/shared`; production output must exclude tests, fixtures and evaluation tools.

Preserve accounts/profiles/Auth, other users, real journals/weight/food/library records, operation receipts, recoverable drafts, source snapshots, schedule enrollment, private evaluation artifacts and permanent accounting. Never infer training completion from prescriptions or deletion authority from an old release checklist.

All AI dispatches use the single existing ledger and caps: $7 lifetime, including a $0.25 cumulative evaluation sublimit. Preserve settled and uncertain charges; no fresh allowance, hidden retry, paid grader or automatic repair. Workout/weight history and health notes require the explicit existing OpenAI-sharing permission. Keep credentials, prompts containing private answers and real health records out of Git, logs, screenshots, fixtures and PRs.

If a real exposed credential is found, stop publication, report only its category/location and seek rotation/history-remediation authority. Do not treat a clean scanner result as exhaustive clearance. Preserve reviewed upstream-advisory exceptions and their expiry; do not suppress new findings or force a dependency downgrade.

## Verification and handoff

Use [development checks](docs/guides/development.md). Keep formatting separate from behavior changes. Use mocks and isolated disposable PostgreSQL, never a hosted or ordinary development database. Fresh installations use [the guarded installer](database/setup/README.md); never replay the historical account reset or overwrite an existing migration/spending ledger.

Report the actual source commit, local checks, CI and PR state. Distinguish source from deployment, simulator from phone acceptance, and mocks from coaching quality. Be concise and continue ordinary authorized work without another approval round. Report concrete blockers and unresolved limitations honestly; old archives and product aspirations do not expand scope.
