# FitQuest API

Fastify 5 / TypeScript, Node.js 24. Profile application logic stays here; Supabase provides Auth and PostgreSQL on a verified **Free** project. No paid provisioning is authorized.

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend ci
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
```

Copy `.env.example` to an ignored `.env.local` and configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `DATABASE_URL`. The latter must use **fitquest_app**, not postgres or an admin connection, via the project's TLS session pooler (`sslmode=verify-full`). Never commit credentials. `createPool` uses the public Supabase CA in `certs/supabase-prod-ca-2021.crt` for `verify-full`, retaining hostname and chain validation. The Docker image includes that certificate. Source: the project's Database Settings → Download certificate, linking [Supabase production CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). SHA-256: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`; expires April 26, 2031. Start after building:

```sh
cd /Users/nicksoteropoulos/Code/FitQuest/backend
node --env-file=.env.local dist/server.js
```

## API

`GET /health` is public and returns exactly `{"service":"fitquest-api","status":"ok"}`. The service uses `PORT` (default 10000) and listens on `0.0.0.0`.

`GET /profile` and `POST /profile-intake` require a Bearer Supabase access token. Auth's `getUser(token)` verifies the exact token against this project's server. Anonymous/unconfirmed users and expired/mismatched identities are rejected; verified `sub` supplies ownership, never editable metadata or request ownership fields. Checking `auth.sessions` also rejects signed-out sessions whose access JWT has not expired yet. Auth or database outages fail closed. Both routes use `Cache-Control: no-store`; tokens, personal fields and parser errors are not logged or echoed.

`GET /profile` returns `{ "profile": null }` for a new account, otherwise the six fields below plus ISO `ageCapturedAt` and `updatedAt`. `POST /profile-intake` accepts these exact fields:

```json
{"firstName":"Alex","lastName":"Example","height":{"value":68,"unit":"in"},"age":29,"weight":{"value":155.5,"unit":"lb"},"gender":"Prefer not to say"}
```

Names/gender: 1–100 characters with non-whitespace text. Age: integer 1–130. Height: integer 1–120 inches. Weight: number greater than 0, up to 1500 lb. Extra properties, missing values, wrong units/types are rejected without coercion; body limit 4 KiB. Each owned UPSERT runs in a transaction and updates age-capture/update timestamps. Exactly `{"message":"User Data Saved"}` is returned only after successful COMMIT. Storage failures return 503.

## Migration and access boundary

The existing Free FitQuest project `wqvxddvihlobnalxpzow` was fully reset at the owner's request. Its application migration ledger and local migration directory now contain one fresh baseline: `20261002233706_reset_accounts_and_profiles.sql`.

The one-time destructive baseline removes all current profiles, Auth users/identities/sessions/refresh tokens/flow/audit data, drops obsolete storage policies, and recreates the private profile schema. All 17 pre-reset public tables and four workout RPCs were removed before this baseline; the old empty progress-media bucket was deleted through the Storage API. No old account data was exported. Supabase's managed structures and internal service-version records remain operational; the previous application migration ledger was replaced. The existing restricted backend role is validated and reused without changing its password. **Do not rerun this destructive reset against populated accounts.** Future changes need new migrations.

The migration creates only the private `fitquest` schema, a restricted `fitquest_app` login role, and one profile row per `auth.users.id`. RLS is enabled/forced with ownership in both USING and WITH CHECK. Fastify sets transaction-local ownership after verification; explicit owner predicates also scope reads/writes. `anon`, `authenticated`, `service_role` and PUBLIC receive no schema/table access. Do not expose `fitquest` through the Data API, create public views/RPC wrappers, or connect Fastify as a bypass-RLS role. The app role cannot access Auth tables. A private session-verdict function uses a fixed empty search path and definer privileges solely to read Auth-managed session state, including when its RLS is enabled. It checks the transaction account context; EXECUTE is revoked from PUBLIC and Data API roles and granted only to fitquest_app. No public RPC wrapper is created. A generated role password is a backend secret provisioned separately; it is not part of the migration.

Local database test (requires the existing isolated loopback test PostgreSQL cluster):

```sh
FITQUEST_TEST_DATABASE_URL=postgresql://fitquest_test@127.0.0.1:55432/postgres npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
```

This opt-in test rejects hosted URLs and creates/removes a disposable local database. It exercises the actual migration, restricted-role save/read/reopen, repeated updates, timestamps, two synthetic owners, broad-query RLS, ownership reassignment rejection, Data API role grants, signed-out/expired sessions, and a deferred COMMIT failure with rollback. Its synthetic Auth schema does not verify hosted Supabase auth or PostgREST.

## Deployment / status

Existing Render Docker service: `fitquest-api` (`srv-d828o7pj2pic739le3ug`), root `backend`, Dockerfile `./Dockerfile`, context `.`, health `/health`. Keep its existing compute plan, Blueprint association and **After CI Checks Pass** policy. HQ publishes reviewed checkpoints on `codex/reset-backend-connectivity`; Engineering verifies that SHA and deploys the existing service. Routine deployment is authorized; new services/costs are not. Docker builds Node 24.21.0 and runs as non-root.

At review time, the live [health endpoint](https://fitquest-api-dpk5.onrender.com/health) still runs acknowledgment-only checkpoint `2317297`; deployment of this account/profile checkpoint is pending. HQ reran backend typecheck, 12 unit tests and the opt-in PostgreSQL integration test in a new isolated local cluster; all passed. The database test verifies a fresh baseline, full synthetic account/token reset, rollback on unexpected schema objects, rebuilt profile persistence/RLS and preservation of managed structures. Engineering previously verified hosted restricted-role TLS and recreated profile grants. Deployment does not execute or replay the historical reset migration.

Hosted reset checks show **zero users, identities, sessions, refresh tokens, MFA claims, flows, audit entries, profiles, public tables, storage objects/buckets/policies, edge functions and app realtime publications**. The dashboard shows **Total: 0 users**. The new profile table has RLS enabled/forced; security advisors currently return no findings. Earlier anonymous Data API profile requests were rejected with 406/PGRST106; the schema remains private.

Email/password signup and confirmation remain enabled; other native auth providers are disabled. Custom SMTP is disabled, and the owner must choose/configure email delivery before public confirmation and the two-account walkthrough. The Auth redirect allowlist is empty (`fitquest-dev://auth` still needs adding). Render environment/publication/deployment, hosted real-session persistence/isolation, native session storage and physical-phone acceptance remain pending. The canceled Render Postgres instance must not be recreated.
