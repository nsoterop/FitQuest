# FitQuest — current agent workflow

## Authority and active scope

The owner's latest explicit instructions control the work. Follow the owner's roadmap; do not invent features, milestones, architecture initiatives or paid evaluations. Feature work is paused unless the owner explicitly assigns it.

The current assignment is the owner's October 10 documentation reconciliation: align current guides with source and verified release evidence, check links/commands, and commit/push the docs-only result to private `main` with passing CI. Engineering is the sole writer; HQ is not editing. Feature work is frozen during the owner's one-to-two-week personal test.

The earlier main integration and standalone preview assignment is complete. Private `main` includes all tested application work; internal iOS Release build 3 (`971aab97-99da-4f28-8c24-8e19851b2b39`) bundles source `1733958`. The backend remains Live at `1859ef8`, matching the current backend/database graph. The owner reports installing the preview and seeing saved data without another sign-in. Do not extrapolate that report to full phone acceptance, Mac-off cold launch, VoiceOver, Sunday dispatch or coaching quality.

This assignment authorizes documentation edits, proportionate finite checks, self-review and normal non-destructive private-main publication. It does not authorize application/configuration changes, another build, backend deploy, hosted settings/migrations, resource/billing changes, paid AI, user-data reset or public visibility changes. The completed build exception is not renewed. Routine application delivery remains Engineering's responsibility when assigned by the owner; these scope limits do not add a blanket future no-deploy rule or HQ approval gate.

Prior instructions and duplicate release notes were removed from the working tree because Git preserves their historical versions. Git history is evidence, not an active work queue or permission to deploy, migrate, reset or spend. The concise retained release record is under `docs/archive/releases`.

## Publication boundary

Local scoped documentation edits, checks, commits and a normal fast-forward push to private `main` are authorized for this task. Inspect actual deployment/Blueprint/EAS triggers and remote divergence before pushing. Check for a matching PR if protections require one; attach any created PR to this chat. Verify the remote revision and exact-source CI. Do not change protections, visibility/default branch, service settings or credentials to bypass a blocker; do not rewrite history or force-push. MIT remains selected. Future deployment, native build, migration, policy/resource or paid work follows the owner's applicable assignment and authority, not an old archive or completed exception.

## Ownership and process control

Engineering is the sole application/documentation writer; HQ has finished its edits. Serialize edits and stop for a genuine concurrent-writer conflict. Do not revert someone else's work. Existing untracked design assets and local files remain protected. HQ review is only required when specifically requested, not a routine publication gate.

The owner controls long-running local development servers. Temporary servers are authorized for testing only: record which processes you start and stop them on success or failure. Never stop, restart, replace or work around an owner-started process by moving to another port. Prefer finite/offline checks. Do not leave hidden or supervised servers running.

## Preserve behavior and private data

Keep current prompts/model settings, five faithful intake answers, complete saved-week visibility, overview-before-acceptance, free acceptance/reopen, legacy readers, revision/idempotency protections, consent enforcement and account isolation unchanged unless explicitly assigned otherwise. Shared contracts live in `backend/src/shared`; production output must exclude tests, fixtures and evaluation tools.

Preserve accounts/profiles/Auth, other users, real journals/weight/food/library records, operation receipts, recoverable drafts, source snapshots, schedule enrollment, private evaluation artifacts and permanent accounting. Never infer training completion from prescriptions or deletion authority from an old release checklist.

Owner clarification, October 10, 2026: stop all real-user data deletion/reset for testing. All prior standing owner-only test-reset authority is revoked. Do not delete or reset the owner's or other real users' onboarding conversations, generated plans, profiles, logs or saved data for deployment, testing, regeneration or verification; use isolated fixtures and read-only verification instead. Disposable synthetic test databases may still be cleaned up. Explicit user-requested product deletions and established unrelated retention policies are unchanged. This ongoing no-test-reset policy is independent of the current assignment.

All AI dispatches use the single existing ledger and caps: $7 lifetime, including a $0.25 cumulative evaluation sublimit. Preserve settled and uncertain charges; no fresh allowance, hidden retry, paid grader or automatic repair. Workout/weight history and health notes require the explicit existing OpenAI-sharing permission. Keep credentials, prompts containing private answers and real health records out of Git, logs, screenshots, fixtures and PRs.

If a real exposed credential is found, stop publication, report only its category/location and seek rotation/history-remediation authority. Do not treat a clean scanner result as exhaustive clearance. Preserve reviewed upstream-advisory exceptions and their expiry; do not suppress new findings or force a dependency downgrade.

## Verification and handoff

Use [development checks](docs/guides/development.md). Keep formatting separate from behavior changes. Use mocks and isolated disposable PostgreSQL, never a hosted or ordinary development database. Fresh installations use [the guarded installer](database/setup/README.md); never replay the historical account reset or overwrite an existing migration/spending ledger.

Report the actual source commit, local checks, CI/PR state, deployed backend revision, applied forward migrations and matching mobile verification. Distinguish source from deployment, simulator from phone acceptance, and mocks from coaching quality. Be concise and complete ordinary authorized release work without another approval round. Report concrete blockers and unresolved limitations honestly; old archives and product aspirations do not expand scope.
