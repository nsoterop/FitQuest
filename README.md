# FitQuest

iOS-first adaptive fitness-coach project. The current deployment provides email accounts, a persistent athlete profile and conversational AI onboarding. Training-plan generation is outside this scope.

**Conversational onboarding is the only resumed scope.** The owner authorized its context fix, multi-turn verification, reviewed publication/activation on existing services and reconnection of the installed phone app. Engineering deployed and activated HQ’s reviewed SHA on October 3. Other paused work and native builds remain outside scope.

- [Product goals](docs/PRODUCT_BRIEF.md) — long-term vision, not an active roadmap
- [Development scope and ownership](AGENTS.md) — pause, permissions and chat responsibilities
- [iPhone setup and UI state](mobile/README.md)
- [Backend, database and deployment](backend/README.md)

## Stack and current state

| Area | Current state |
| --- | --- |
| Mobile | React Native 0.86 / React 19 / TypeScript / Expo SDK 57; iOS development build with Mac-hosted Metro |
| API | Fastify 5 / TypeScript / Node 24 on the existing Render `fitquest-api` service |
| Accounts and database | Supabase Free project `wqvxddvihlobnalxpzow`; email/password with confirmation; PostgreSQL private `fitquest.profiles` table |
| Published application | `675cccb5069613b50a3497fa4e95fda9a6606370` on `codex/reset-backend-connectivity`; deployed to Render |
| iPhone build | [67f13060-1006-4b6f-a2f5-f59eed28d594](https://expo.dev/accounts/nsoterop/projects/fitquest/builds/67f13060-1006-4b6f-a2f5-f59eed28d594), built from `49e1ff3`; owner confirmed launch after installation |
| Reviewed UI | `Hi <firstname>` after successful save or existing-profile load; included in this source checkpoint |
| Onboarding | Hosted AI active with GPT-6 Luna and the single $7 lifetime allowance. Latest local mobile UI (awaiting HQ review): concise disclosure → conversation/answer/Send; navigation/deletion in a secondary menu, with draft and conditional recovery retained. Phone acceptance pending. |

The repository is private at [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest). The active application branch is `codex/reset-backend-connectivity`; historical `main` is not the deployment source. Documentation commits do not mean a newer application was deployed.

## Current user flow

Signed out → email sign-in or account creation → required email confirmation → authenticated profile lookup.

- No saved profile: collect first name, last name, height, age, weight and gender, then save through Fastify.
- Current JavaScript: an existing profile or confirmed save opens **Hi &lt;firstname&gt;**. There is no profile-edit navigation from that greeting yet.
- Sign-out clears account-specific UI and returns to authentication. Backend status remains in a small footer.

The greeting now opens onboarding. This records an understanding, including reports, inferences and unknowns; confirmation is not independent verification or medical clearance. Plan generation, training logs, nutrition features and Apple Health remain outside this assignment.

## Latest fixes — accepted for deployment and phone testing

HQ follow-up review, October 3: independently passed all 48 backend tests (isolated PostgreSQL, no skips), 41 mobile tests, typechecks and diff checks. The duplicate closing invitation is fixed for the recorded cases without losing recap facts. This source checkpoint is accepted for publication and Engineering deployment to the existing service. Final keyboard behavior still requires native/device acceptance; test success is not a claim that the phone issue is resolved.

The owner’s keyboard/conversation feedback is implemented locally. Onboarding asks for materially missing practical context, treats mild discomfort proportionately, and shows a recap followed by explicit agreement and a saved acknowledgement. Completion is recorded in existing conversation turns, without silently confirming structured items or adding a migration. Corrections reopen the discussion. The mobile screen uses one keyboard adjustment and scroll container, with targeted composer/reply scrolling and a safe-area offset.

**48 backend tests** including isolated PostgreSQL, **41 mobile tests**, both typechecks and Metro’s actual iOS manifest/bundle pass. A 10-call synthetic v3/v4 comparison used **$0.003749** from the existing hosted evaluation ledger. Latest checked accounting: **$0.010895 total spent, $0.008426 evaluation spent, zero reservations**; the original local ledger remains frozen. The comparison reproduced the old shoulder loop and showed improved practical coverage, flexible/declined topics and recap/correction handling. It is a small qualitative sample, not a reliability guarantee.

Native iOS testing found an additional safe-area offset issue and Engineering adjusted it. The Mac locked before the final native retest; a subsequent Simulator access attempt timed out. Keyboard acceptance remains unverified. No new native build or schema/configuration change was needed. The last verified live backend remains `675cccb`; publication of this source checkpoint does not itself verify deployment.

## Reviewed onboarding checkpoint

Fastify owns authenticated conversation storage and model orchestration; private tables retain forced RLS. The forward migration `backend/supabase/migrations/20261003030745_conversational_onboarding.sql` was applied to Supabase with the exact reviewed SQL, recorded as version `20261003161540`. HQ accepted this source checkpoint on October 3 after independently rerunning 41 backend tests, 36 mobile tests, typechecks and diff checks, and reviewing the live synthetic evidence. No blocking findings remain. Hosted migration/configuration and [Render deployment](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db0iph2d0e5s73bqv0og) are verified at `675cccb5069613b50a3497fa4e95fda9a6606370`. The installed native build loads current JavaScript through Metro; physical-phone acceptance remains pending.

The owner approved OpenAI GPT-6 Luna, **$7 total including evaluations**, an initial evaluation ceiling of **$0.25**, adults 18+, and history retained until user deletion. Hosted accounting now uses the single permanent allowance ledger; settled costs and uncertain reservations survive deletion, restarts and month changes. Evaluation usage shares that ledger and cannot reset on reruns. Production AI is enabled after transferring all prior costs and permanently freezing local evaluation spending. Relevant data transfer and separate provider/backup retention are disclosed; `store:false` does not promise zero retention.

Reviewed checkpoint verification: backend typecheck and **41 tests**, including isolated PostgreSQL; mobile typecheck and **36 tests**, with Expo's offline dependency map. Coverage includes two-user isolation, exact review confirmation, provenance, duplicates/retries, lease recovery, stale/deleted/signed-out responses, lifetime/evaluation caps and private request handling. Prior iOS Hermes export evidence remains historical; no new native build was run.

**Context fix and multi-turn verification completed October 3:** requests now reference original source text instead of repeating it in values, quotes and recent user turns. Full transcript/provenance remain durable; the 24,000-byte request cap is unchanged. Two 3,200-character answers traversed the actual HTTP/service/store path in mock and live tests. Genuine limits roll back the rejected change, preserve an editable draft, and allow review/confirmation of saved content.

After the initial eight single-response checks, a live three-turn conversation carried actual responses/context forward, accepted a correction and skip, and confirmed/reopened exact reviewed revision 9 without another model call. One result exposed report paraphrases mislabeled as verbatim evidence; the strict source check remains, and report values now use the verified original quote when needed. A tested, explicit retry completed the conversation. **12 total live calls, $0.004677 conservatively accounted, $0 outstanding reservations** include that rejected result and retry. These costs were transferred into the hosted ledger at activation; the newer accounting above supersedes that historical balance. Live routes, provider configuration and restricted TLS connectivity are verified; provider balance and authenticated phone behavior remain unverified. See [backend evidence and activation steps](backend/README.md#local-real-ai-evaluation).

## Verification, with evidence boundaries

October 3 activation: `/health` 200; all signed-out onboarding routes and invalid-token requests 401/no-store. Runtime confirms GPT-6 Luna, approved key, exact SHA and verified TLS as `fitquest_app`. Private-table forced RLS/grants and aggregate account/profile preservation passed. No confirmed synthetic hosted test account was available; the owner’s private account was not used for testing.

- HQ independently passed 27 mobile tests, 12 backend unit tests and one isolated real-PostgreSQL integration test at `49e1ff3`, plus typechecks and online Expo dependency compatibility. Engineering verified the iOS bundle export.
- Engineering subsequently passed **28 mobile tests and typecheck** for the local greeting change and verified Metro's updated iOS bundle returned 200. Those tests mock native/Auth/network surfaces; they are not phone acceptance.
- Engineering verified [Render deployment `dep-db04s9c9v7es739ub95g`](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db04s9c9v7es739ub95g) at the exact application SHA, signed-out/invalid-token rejection and the restricted `fitquest_app` database connection over verified TLS. No reset migration was replayed.
- HQ rechecked `/health` = 200 and signed-out `/profile` = 401 with `Cache-Control: no-store` during this documentation checkpoint.
- The owner confirmed the refreshed app runs. Engineering's later aggregate hosted checks verified one profile linked to the sole confirmed account, without inspecting personal field values. The database is **not empty**; earlier zero-account reset results are historical.
- Physical-phone greeting behavior, reopen/session-refresh acceptance and hosted two-account isolation remain unverified. Local isolation tests do not substitute for those checks.

## Phone acceptance and scope boundaries

- HQ review, publication and scoped activation are complete. On the same Wi-Fi as the Mac, open the installed FitQuest development app and enter `http://192.168.87.227:8081`. The actual iOS manifest/bundle returned 200 and point to the approved Render backend.
- The owner checks greeting → Start onboarding → disclosure → conversation/answer/Send, then app reopen and sign-out/sign-in. These device behaviors are not established by server or bundle checks.
- Configure an owner-selected email-delivery solution before public signup or general two-account testing. Custom SMTP was disabled at the last Engineering check; default delivery is limited to authorized Supabase team addresses. The callback `fitquest-dev://auth` is configured and confirmation remains enabled.
- Revisit the previously reported dependency audit findings in the mobile README when scoped; no blanket dependency upgrade is authorized.

The owner alone provisions paid resources/subscriptions. Supabase remains Free; the existing Render API remains paid at its existing plan. The mistakenly created Render database was deleted and must not be recreated. Only the scoped migration, accounting and AI environment/deployment were changed; no resource or billing changes were made.

Local check commands:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

The backend command skips the opt-in database integration test unless its isolated local fixture is configured. The latest 48-test result above includes that fixture.
