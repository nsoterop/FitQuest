# FitQuest — current agent workflow

## Authority and active scope

The owner's latest explicit instructions control the work. Follow the owner's roadmap; do not invent features, milestones, architecture initiatives or paid evaluations. Feature work is limited to explicitly assigned corrections below.

The current assignment is the owner's October 10 approval, “Let's bring main up to date and then go ahead with part 2,” verified in HQ's owner-authored message. Bring all tested work to private `main` without rewriting history, then deliver one standalone internal/ad-hoc iOS preview for one-to-two weeks of personal testing without Mac/Metro. Engineering is the sole writer; HQ is not editing. Feature work is frozen.

This narrowly supersedes the earlier no-main-integration/no-further-native-build restrictions. Recheck remote divergence, protections, exact CI and Render/Blueprint/EAS triggers before advancing main. Do not alter protection, visibility, service settings or credentials to get past a blocker. Add a separate preview profile that bundles current JavaScript/assets in Release configuration; retain the existing development profile. Reuse the existing project, bundle ID, scheme, keychain identity, signing and registered devices. Verify hosted API/auth settings, included build allowance, built artifact and install eligibility. Reuse only the three approved public client environment values; no backend secrets belong in the build, Git or logs. No added billing, plan/resource, credential/trust/signing replacement, device registration, App Store/TestFlight or EAS Update setup is authorized.

The current backend source `1859ef8` already matches the application backend/database graph. Keep the live API, scheduler, real records, consent and accounting unchanged; no backend deployment, hosted migration, reset or paid AI dispatch is assigned. Install the preview over the existing app without uninstalling it. Artifact/configuration/synthetic checks are distinct from physical-phone cold-launch and saved-data acceptance. Internet remains required for hosted features.

Prior instructions and duplicate release notes were removed from the working tree because Git preserves their historical versions. Git history is evidence, not an active work queue or permission to deploy, migrate, reset or spend. The concise retained release record is under `docs/archive/releases`.

## Publication boundary

Local scoped edits, proportionate tests, self-review, commits, normal non-destructive integration/push to private `main`, and the single existing-project preview build above are authorized. Check for a matching PR if protections require one; attach any created PR to this chat. Verify remote main and its CI, not only local state. Do not change visibility/default branch/protection, rewrite history, force-push, provision resources or change unrelated settings. The approved main/preview exception does not authorize a backend deployment, migration, policy change, real-data reset, additional spending or new feature. MIT remains selected. Do not reintroduce an HQ approval gate.

## Ownership and process control

Engineering is the sole application/documentation writer; HQ has finished its edits. Serialize edits and stop for a genuine concurrent-writer conflict. Do not revert someone else's work. Existing untracked design assets and local files remain protected. HQ review is only required when specifically requested, not a routine publication gate.

The owner controls long-running local development servers. Temporary servers are authorized for testing only: record which processes you start and stop them on success or failure. Never stop, restart, replace or work around an owner-started process by moving to another port. Prefer finite/offline checks. Do not leave hidden or supervised servers running.

## Preserve behavior and private data

Keep current prompts/model settings, five faithful intake answers, complete saved-week visibility, overview-before-acceptance, free acceptance/reopen, legacy readers, revision/idempotency protections, consent enforcement and account isolation unchanged unless explicitly assigned otherwise. Shared contracts live in `backend/src/shared`; production output must exclude tests, fixtures and evaluation tools.

Preserve accounts/profiles/Auth, other users, real journals/weight/food/library records, operation receipts, recoverable drafts, source snapshots, schedule enrollment, private evaluation artifacts and permanent accounting. Never infer training completion from prescriptions or deletion authority from an old release checklist.

Owner clarification, October 10, 2026: stop all real-user data deletion/reset for testing. All prior standing owner-only test-reset authority is revoked. Do not delete or reset the owner's or other real users' onboarding conversations, generated plans, profiles, logs or saved data for deployment, testing, regeneration or verification; use isolated fixtures and read-only verification instead. Disposable synthetic test databases may still be cleaned up. Explicit user-requested product deletions and established unrelated retention policies are unchanged. This clarification authorizes documentation only, not upcoming UI feature work, migrations, deployments or data changes.

All AI dispatches use the single existing ledger and caps: $7 lifetime, including a $0.25 cumulative evaluation sublimit. Preserve settled and uncertain charges; no fresh allowance, hidden retry, paid grader or automatic repair. Workout/weight history and health notes require the explicit existing OpenAI-sharing permission. Keep credentials, prompts containing private answers and real health records out of Git, logs, screenshots, fixtures and PRs.

If a real exposed credential is found, stop publication, report only its category/location and seek rotation/history-remediation authority. Do not treat a clean scanner result as exhaustive clearance. Preserve reviewed upstream-advisory exceptions and their expiry; do not suppress new findings or force a dependency downgrade.

## Verification and handoff

Use [development checks](docs/guides/development.md). Keep formatting separate from behavior changes. Use mocks and isolated disposable PostgreSQL, never a hosted or ordinary development database. Fresh installations use [the guarded installer](database/setup/README.md); never replay the historical account reset or overwrite an existing migration/spending ledger.

Report the actual source commit, local checks, CI/PR state, deployed backend revision, applied forward migrations and matching mobile verification. Distinguish source from deployment, simulator from phone acceptance, and mocks from coaching quality. Be concise and complete ordinary authorized release work without another approval round. Report concrete blockers and unresolved limitations honestly; old archives and product aspirations do not expand scope.
