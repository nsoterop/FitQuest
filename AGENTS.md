# FitQuest — current agent workflow

## Authority and active scope

The owner's latest explicit instructions control the work. Follow the owner's roadmap; do not invent features, milestones, architecture initiatives or paid evaluations. Feature work is limited to explicitly assigned corrections below.

The owner's request to finish and deploy the birthday/profile/onboarding changes is complete at application source `1859ef8`: calendar birthday, server-derived age without birthday AI egress, Male/Female with no initial selection, direct onboarding, and reviewed answers through sharing consent into one generation. The owner separately approved the additive hosted birthday migration, applied as `20261010184939_profile_birthday`; the existing service is Live and matching mobile JavaScript is verified through owner Metro. See [release evidence](docs/archive/releases/2026-10-10.md#completed-birthday-and-onboarding-follow-up). Preserve legacy profiles/clients, saved and pending plans, accepted Today routing, consent, drafts, scheduling and accounting. The completed security and four UX batches remain intact. Physical-phone acceptance remains separate. Engineering is the sole application/documentation writer; HQ is not editing files. No further feature, paid agent evaluation, real-user reset, native build, new service or unrelated migration is assigned.

The owner's subsequent birthday-picker correction replaces the text input with a month/day/year selector in profile creation and editing. Done commits the selected calendar date; Cancel preserves the prior value. This client-only correction retains the existing birthday API, age calculation and privacy rules; matching JavaScript is delivered through owner Metro, with no hosted migration or native build. Other feature work remains paused.

Prior instructions and duplicate release notes were removed from the working tree because Git preserves their historical versions. Git history is evidence, not an active work queue or permission to deploy, migrate, reset or spend. The concise retained release record is under `docs/archive/releases`.

## Engineering release ownership — owner clarification, 2026-10-10

The owner explicitly reaffirmed that Engineering must deploy changes after implementation. This supersedes the temporary publication-only restrictions in earlier assignments and current reference documents for routine application deployments. Engineering owns scoped implementation, proportionate tests, self-review, routine Git integration/commits/pushes, backend deployment to the existing approved service, matching mobile JavaScript delivery and read-only release verification. Do not stop at source-complete, a PR, or ready-for-review, and do not require another HQ or owner approval for ordinary application deployment. This applies to the completed security and flow-simplification work as well as subsequent approved changes. Hosted database migrations and service/policy-setting changes remain subject to explicit approval; identify these dependencies before deploying incompatible application code.

Verify actual source, CI, deployment branch/triggers, hosted migration state and compatibility before release; do not infer that publication deployed anything. Preserve prerequisite commits and existing PR history; check for a matching PR before creating one and attach any created PR. Coordinate schema/backend/mobile rollout and in-flight generation compatibility, with a recoverable rollback path that preserves data and accounting. Verify the live release identity and relevant auth, consent and application behavior before handing back for phone testing. Respect owner-managed local servers; inability to verify or deliver the matching mobile bundle is a concrete release limitation, not permission to replace their server.

Routine deployment does not authorize hosted database migrations, service/policy-setting changes, new paid resources, changes to repository visibility/default branch/protection, destructive resets, credential/trust/signing changes, history rewrites, force-pushes or native builds. No new paid AI evaluation, owner-plan regeneration, spending-cap increase or allowance reset is assigned. Scheduled/user-requested app generation remains subject to valid user consent and existing accounting controls; never silently grant or expand permission. Stop only for a concrete unresolved blocker or genuinely new authority. MIT remains selected.

For this release, the owner subsequently authorized bringing the completed work up to date, including the two inventoried forward migrations and existing application deployment. Both migrations are applied and application `a5894ad` is live; see [release verification](docs/archive/releases/2026-10-10.md). The owner explicitly selected leaving the account-limit policy disabled. This scoped release authority does not authorize unrelated or future database/policy changes. The owner restarted Metro for phone testing; preserve that process.

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
