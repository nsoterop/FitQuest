# FitQuest

iOS-first adaptive fitness-coach project. Current implementation is email accounts and a persistent athlete profile—not AI coaching yet.

**Paused at the owner's request on October 2, 2026 (America/New_York).** Implementation, deployment and build work must not resume automatically. This documentation checkpoint does not stop existing services or Metro.

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
| Newer local UI | `Hi <firstname>` after successful save or existing-profile load; code/tests are uncommitted and preserved locally |

The repository is private at [nsoterop/FitQuest](https://github.com/nsoterop/FitQuest). The active application branch is `codex/reset-backend-connectivity`; historical `main` is not the deployment source. Documentation commits do not mean a newer application was deployed.

## Current user flow

Signed out → email sign-in or account creation → required email confirmation → authenticated profile lookup.

- No saved profile: collect first name, last name, height, age, weight and gender, then save through Fastify.
- Published `49e1ff3`: show the form with restored data and display **User Data Saved** after a committed write.
- Latest local change: an existing profile or confirmed save opens **Hi &lt;firstname&gt;**. There is no profile-edit navigation from that greeting yet.
- Sign-out clears account-specific UI and returns to authentication. Backend status remains in a small footer.

The greeting is not a dashboard. There are no implemented AI plans, training logs, nutrition features or Apple Health integration.

## Verification, with evidence boundaries

- HQ independently passed 27 mobile tests, 12 backend unit tests and one isolated real-PostgreSQL integration test at `49e1ff3`, plus typechecks and online Expo dependency compatibility. Engineering verified the iOS bundle export.
- Engineering subsequently passed **28 mobile tests and typecheck** for the local greeting change and verified Metro's updated iOS bundle returned 200. Those tests mock native/Auth/network surfaces; they are not phone acceptance.
- Engineering verified [Render deployment `dep-db04s9c9v7es739ub95g`](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db04s9c9v7es739ub95g) at the exact application SHA, signed-out/invalid-token rejection and the restricted `fitquest_app` database connection over verified TLS. No reset migration was replayed.
- HQ rechecked `/health` = 200 and signed-out `/profile` = 401 with `Cache-Control: no-store` during this documentation checkpoint.
- The owner confirmed the refreshed app runs. Engineering's later aggregate hosted checks verified one profile linked to the sole confirmed account, without inspecting personal field values. The database is **not empty**; earlier zero-account reset results are historical.
- Physical-phone greeting behavior, reopen/session-refresh acceptance and hosted two-account isolation remain unverified. Local isolation tests do not substitute for those checks.

## Remaining work — paused, not an assignment

- Review/publish the two local greeting code/test changes when the owner resumes; they are not included in this documentation-only checkpoint.
- Verify greeting, sign-out/sign-in and app-reopen behavior on the phone.
- Configure an owner-selected email-delivery solution before public signup or general two-account testing. Custom SMTP was disabled at the last Engineering check; default delivery is limited to authorized Supabase team addresses. The callback `fitquest-dev://auth` is configured and confirmation remains enabled.
- Revisit the previously reported dependency audit findings in the mobile README when scoped; no blanket dependency upgrade is authorized.

The owner alone provisions paid resources/subscriptions. Supabase remains Free; the existing Render API remains paid at its existing plan. The mistakenly created Render database was deleted and must not be recreated. No infrastructure or billing changes are part of this pause.

Local check commands for a future resumed verification:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

The backend command skips the opt-in database integration test unless its isolated local fixture is configured. No tests or migrations were rerun for this documentation-only update.
