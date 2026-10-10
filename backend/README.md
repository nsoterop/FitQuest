# FitQuest API

Fastify 5 / TypeScript on Node 24. The API owns profile, intake, planning, journal, food/library, weight and scheduling operations. Supabase supplies Auth and PostgreSQL; application tables stay in the private `fitquest` schema. See [architecture](../docs/reference/architecture.md) and [current project status](../README.md).

## Verify without hosted access

From the repository root, install all four locked dependency sets (root, backend, database and mobile) and run the commands in [development checks](../docs/guides/development.md). `npm run check:database` creates, tests and removes a disposable loopback PostgreSQL cluster. It runs the current backend persistence and guarded-installer suites; dated counts and exact CI are in [release evidence](../docs/archive/releases/2026-10-10.md). No production credentials or paid provider calls are needed. Current backend/database source matches the existing Live `1859ef8` release; this documentation task requires no redeploy or migration.

`npm run build --prefix backend` compiles the server import graph to `backend/dist`. `build:test` produces `backend/dist-test` separately. Tests, synthetic fixtures and evaluation entry points are excluded from production output. The Docker build context remains `backend/`; runtime includes the catalog and public database CA.

## Configure a development instance

Use a separately authorized development Supabase project, with email confirmation enabled. This is not a request to provision one or to change the existing hosted service. A fresh database must follow [the guarded installer](../database/setup/README.md); never replay the historical reset migration or run a generic migration-directory push.

From the repository root:

```sh
cp -n backend/.env.example backend/.env.local
npm run build --prefix backend
```

Fill the ignored file privately:

| Variable | Meaning |
| --- | --- |
| `SUPABASE_URL` | Your project's HTTPS Auth endpoint. |
| `SUPABASE_PUBLISHABLE_KEY` | Its publishable key; never a secret/service-role key. |
| `DATABASE_URL` | Restricted `fitquest_app` connection, using your project's verified TLS session-pooler settings. Never the setup administrator connection. |
| `ONBOARDING_AI_ENABLED` | Leave `false` for ordinary setup and deterministic logging. AI activation requires separately authorized permissions, provider configuration and existing ledger reconciliation. |
| `PORT` | Optional; defaults to `10000`. |

The server does not load `.env.local` through `npm start`. When explicitly starting your development instance, use:

```sh
cd backend
node --env-file=.env.local dist/server.js
```

Stop your process when testing ends. Do not set `NODE_ENV=production` for casual testing: production startup enables the internal scheduler. The server listens on `0.0.0.0`; use only the intended trusted development network. `GET /health` returns `{"service":"fitquest-api","status":"ok"}`. This verifies liveness, not authenticated workflows or provider readiness.

Production rejects non-`verify-full` database connections. `createPool` uses the committed public Supabase CA for certificate and hostname validation. Obtain endpoint/user settings from your project's Connect panel; see [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres). Do not weaken TLS to resolve connection errors.

## API and persistence boundaries

The route definitions in [app.ts](src/app.ts) are the source of truth. Interactive private routes require the verified live Supabase session, reject unconfirmed/anonymous or signed-out accounts, and use `no-store`. Account ownership comes from verified identity, not client fields. Restricted database operations use owner-scoped transactions and forced row-level security.

A complete new plan is saved in one accounted generation. Only its overview is returned before acceptance. Acceptance and reopen reveal saved details without a provider request. Explicit revisions preserve prior usable work on failure. Journal/weight/food/library saves are independent of training-content retention. Food AI interpretation requires an explicit request and reviewed candidate before saving.

The production scheduler scans at startup and roughly every minute for enabled Sunday 9 PM schedules in the saved timezone. Acceptance plus the explicit recurring profile/intake and workout/weight sharing agreement enrolls eligible document histories automatically. Legacy explicit enrollment/pauses remain compatible; consent withdrawal stops consent-managed future dispatch. Both permissions and a usable accepted baseline are required. Existing weeks win over duplicate requests; failed/uncertain dispatches need explicit retry. [Scheduler mechanics and limits](../docs/reference/architecture.md#weekly-scheduling).

Do not run the separately authorized `eval:*` or coaching-evaluation scripts as setup checks: they can spend money and require separate authorization. The removal of retired comparison harnesses is recorded in [development checks](../docs/guides/development.md).

[Historical API releases](https://github.com/nsoterop/FitQuest/blob/a297e2d/docs/history/backend-release-notes-2026-10-10.md) are dated evidence, not current setup or authority to deploy.
