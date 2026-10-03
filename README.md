# FitQuest

iOS-first adaptive fitness-coach project. The last verified deployment provides email accounts and a persistent athlete profile; the reviewed source also includes conversational AI onboarding, not training-plan generation.

**Conversational onboarding is the only resumed scope.** The owner authorized its context fix, multi-turn verification, reviewed publication/activation on existing services and reconnection of the installed phone app. Engineering is holding deployment for HQ's reviewed SHA. Other paused work and native builds remain outside scope.

- [Product goals](docs/PRODUCT_BRIEF.md) — long-term vision, not an active roadmap
- [Development scope and ownership](AGENTS.md) — pause, permissions and chat responsibilities
- [iPhone setup and UI state](mobile/README.md)
- [Backend, database and deployment](backend/README.md)

## Stack and current state

| Area | State at pause |
| --- | --- |
| Mobile | React Native 0.86 / React 19 / TypeScript / Expo SDK 57; iOS development build with Mac-hosted Metro |
| API | Fastify 5 / TypeScript / Node 24 on the existing Render `fitquest-api` service |
| Accounts and database | Supabase Free project `wqvxddvihlobnalxpzow`; email/password with confirmation; PostgreSQL private `fitquest.profiles` table |
| Published application | `49e1ff3aed30a009172df44049bfae9ea405f897` on `codex/reset-backend-connectivity`; deployed to Render |
| iPhone build | [67f13060-1006-4b6f-a2f5-f59eed28d594](https://expo.dev/accounts/nsoterop/projects/fitquest/builds/67f13060-1006-4b6f-a2f5-f59eed28d594), built from `49e1ff3`; owner confirmed launch after installation |
| Reviewed UI | `Hi <firstname>` after successful save or existing-profile load; included in this source checkpoint |
| Reviewed onboarding | Greeting → disclosure → conversation → editable understanding → exact-version confirmation; resume, correction, skip, deletion and secure device draft recovery. Deployment pending; AI disabled by default. |

The repository is private at [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest). The active application branch is `codex/reset-backend-connectivity`; historical `main` is not the deployment source. Documentation commits do not mean a newer application was deployed.

## Current user flow

Signed out → email sign-in or account creation → required email confirmation → authenticated profile lookup.

- No saved profile: collect first name, last name, height, age, weight and gender, then save through Fastify.
- Published `49e1ff3`: show the form with restored data and display **User Data Saved** after a committed write.
- Latest local change: an existing profile or confirmed save opens **Hi &lt;firstname&gt;**. There is no profile-edit navigation from that greeting yet.
- Sign-out clears account-specific UI and returns to authentication. Backend status remains in a small footer.

The local greeting now opens onboarding. This records an understanding, including reports, inferences and unknowns; confirmation is not independent verification or medical clearance. Plan generation, training logs, nutrition features and Apple Health remain outside this assignment.

## Reviewed onboarding checkpoint

Fastify owns authenticated conversation storage and model orchestration; private tables retain forced RLS. The forward migration `backend/supabase/migrations/20261003030745_conversational_onboarding.sql` is verified only with synthetic local PostgreSQL. HQ accepted this source checkpoint on October 3 after independently rerunning 41 backend tests, 36 mobile tests, typechecks and diff checks, and reviewing the live synthetic evidence. No blocking findings remain. Hosted migration/configuration, deployment and phone acceptance are pending Engineering's activation of the published checkpoint; no new native build is required.

The owner approved OpenAI GPT-6 Luna, **$7 total including evaluations**, an initial evaluation ceiling of **$0.25**, adults 18+, and history retained until user deletion. Local accounting now uses a permanent ledger; settled costs and uncertain reservations survive deletion, restarts and month changes. Evaluation usage shares that ledger and cannot reset on reruns. Production AI remains disabled. Relevant data transfer and separate provider/backup retention are disclosed; `store:false` does not promise zero retention.

Current verification: backend typecheck and **41 tests**, including isolated PostgreSQL; mobile typecheck and **36 tests**, with Expo's offline dependency map. Coverage includes two-user isolation, exact review confirmation, provenance, duplicates/retries, lease recovery, stale/deleted/signed-out responses, lifetime/evaluation caps and private request handling. Prior iOS Hermes export evidence remains historical; no new native build was run.

**Context fix and multi-turn verification completed October 3:** requests now reference original source text instead of repeating it in values, quotes and recent user turns. Full transcript/provenance remain durable; the 24,000-byte request cap is unchanged. Two 3,200-character answers traversed the actual HTTP/service/store path in mock and live tests. Genuine limits roll back the rejected change, preserve an editable draft, and allow review/confirmation of saved content.

After the initial eight single-response checks, a live three-turn conversation carried actual responses/context forward, accepted a correction and skip, and confirmed/reopened exact reviewed revision 9 without another model call. One result exposed report paraphrases mislabeled as verbatim evidence; the strict source check remains, and report values now use the verified original quote when needed. A tested, explicit retry completed the conversation. **12 total live calls, $0.004677 conservatively accounted, $0 outstanding reservations** include that rejected result and retry. Provider balance, hosted onboarding and physical-phone behavior remain unverified. Production AI stays off until the reviewed checkpoint and accounting transfer. See [backend evidence and activation steps](backend/README.md#local-real-ai-evaluation).

## Verification, with evidence boundaries

- HQ independently passed 27 mobile tests, 12 backend unit tests and one isolated real-PostgreSQL integration test at `49e1ff3`, plus typechecks and online Expo dependency compatibility. Engineering verified the iOS bundle export.
- Engineering subsequently passed **28 mobile tests and typecheck** for the local greeting change and verified Metro's updated iOS bundle returned 200. Those tests mock native/Auth/network surfaces; they are not phone acceptance.
- Engineering verified [Render deployment `dep-db04s9c9v7es739ub95g`](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db04s9c9v7es739ub95g) at the exact application SHA, signed-out/invalid-token rejection and the restricted `fitquest_app` database connection over verified TLS. No reset migration was replayed.
- HQ rechecked `/health` = 200 and signed-out `/profile` = 401 with `Cache-Control: no-store` during this documentation checkpoint.
- The owner confirmed the refreshed app runs. Engineering's later aggregate hosted checks verified one profile linked to the sole confirmed account, without inspecting personal field values. The database is **not empty**; earlier zero-account reset results are historical.
- Physical-phone greeting behavior, reopen/session-refresh acceptance and hosted two-account isolation remain unverified. Local isolation tests do not substitute for those checks.

## Remaining work and scope boundaries

- HQ review passed; Engineering performs the already-authorized scoped activation after HQ publishes this source checkpoint.
- After live route and Metro verification, the owner checks onboarding, greeting, sign-out/sign-in and reopen on the phone.
- Configure an owner-selected email-delivery solution before public signup or general two-account testing. Custom SMTP was disabled at the last Engineering check; default delivery is limited to authorized Supabase team addresses. The callback `fitquest-dev://auth` is configured and confirmation remains enabled.
- Revisit the previously reported dependency audit findings in the mobile README when scoped; no blanket dependency upgrade is authorized.

The owner alone provisions paid resources/subscriptions. Supabase remains Free; the existing Render API remains paid at its existing plan. The mistakenly created Render database was deleted and must not be recreated. No infrastructure or billing changes are part of this pause.

Local check commands:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

The backend command skips the opt-in database integration test unless its isolated local fixture is configured. The current 41-test result above includes that fixture.
