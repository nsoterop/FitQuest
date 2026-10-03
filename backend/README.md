# FitQuest API

Fastify 5 / TypeScript, Node.js 24. Profile application logic stays here; Supabase provides Auth and PostgreSQL on a verified **Free** project. No paid provisioning is authorized.

**The owner authorized the onboarding fix, multi-turn verification and scoped activation on existing services.** Engineering is holding deployment for HQ’s reviewed Git checkpoint. Existing hosted services are unchanged; other paused work remains outside scope. Local checks use synthetic data; never replay the destructive baseline on hosted data.

**HQ acceptance — October 3:** review passed with no blocking findings. HQ independently reran all 41 backend tests, including the isolated real-PostgreSQL suite, and typecheck; reviewed the 12-call synthetic live evidence and context-limit regression; and verified the scoped diff. This source checkpoint is accepted for publication and Engineering's already-authorized activation below. Hosted and physical-phone success are not established by these checks.

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

### Prepared local onboarding slice

Forward migration: `20261003030745_conversational_onboarding.sql`, applied **only to synthetic local databases**, not Supabase. It adds owner-scoped conversations, immutable context revisions, turns, operation digests/results, operational attempts and request counters with forced RLS and no Data API grants. A permanent global allowance ledger has no direct app grants. Narrow private definer functions reserve/settle costs and lock only the verified Auth session during short content transactions. Onboarding never writes the profile.

| Authenticated route | Contract |
| --- | --- |
| `POST /onboarding` | `{disclosureVersion:"onboarding-adults-v1"}` creates or resumes the account's one conversation |
| `GET /onboarding/:id` | Resume transcript, context, revision and pending/failed turn state |
| `POST /onboarding/:id/commands` | Strict `message`, `retry`, `skip`, `edit` or `confirm`; UUID `operationId` and `expectedRevision` required |
| `DELETE /onboarding/:id` | Delete transcript/context/summary; preserve profile/account and operational liabilities |

Existing Auth/session verification and restricted pool are reused. Identical operation/payload returns its stable operation result plus the latest snapshot even with a stale caller revision; changed payload conflicts. Confirmation references and copies exactly the reviewed context without AI, retaining reports/inferences/unknowns and their provenance. Quotes/references are checked against actual source text, not semantic truth. When a model labels a paraphrase as `user_report`, the server stores its verified original quote instead of that paraphrase; forged/missing sources and quotes still fail, and declared inferences remain inferences. Model proposals cannot confirm themselves, delete goals/restrictions, write profiles or invoke tools. Private responses use `no-store`; prompts, replies, personal fields and provider exceptions are never logged.

One call/claimed turn, no automatic retry, 30-second timeout / 35-second durable lease. Connections/locks are released during model work. Resume marks crashed/expired leases retryable. Late/stale/deleted/profile-changed/signed-out results cannot commit content. Each explicit retry has a separate reservation. Measured usage settles separately from content; uncertain charges retain reservations after deletion/month boundaries. This is conservative application accounting, not invoice reconciliation; crashed uncertain charges need later authorized reconciliation. The lifetime ledger is never pruned or initialized by a request. Its database cap cannot exceed $7; the evaluation sublimit cannot exceed $0.25, and both settled costs and outstanding reservations count. Conversation deletion never deletes accounting. Application dispatch is locked by default in the ledger until reviewed activation.

Request bounds: 4,000 characters/message; 80 items / 32,000-byte context; 24,000-byte complete UTF-8 provider request including instructions/schema (conservative token upper bound); 2,000 output tokens; 100 turns and 240 revision/operation slots. Model requests store original texts once in `sources`, with `valueFromSource`, evidence spans and recent user source references removing duplication. No old goal, restriction, correction, skip or uncertainty is silently truncated. A change exceeding request/storage bounds rolls back; the mobile draft stays editable, and saved review/confirmation remains available. Unknown network outcomes still retain the pending idempotent operation. One active turn/account, 60 generation attempts/account/day, 600 accepted storage requests/account/hour; a bounded 120/minute peer limiter also covers malformed/unauthenticated traffic. Confirmation permits recorded limitations; completion is not a topic/turn checklist.

The owner selected OpenAI GPT-6 Luna. The Responses adapter uses strict structured output, `store:false`, standard service tier and low reasoning effort, with no tools, hosted conversation, fallback or SDK retries. All schema fields are required, every object rejects extra properties, and nullable fields use `anyOf`. Refusals/incomplete/invalid output remain recoverable failures. The prompt supports mixed, abstract and sport goals, corrections and irregular schedules. This first slice omits profile values from model input while identifying the six already-collected fields; it makes no physiology inference from gender. Known names, recognizable emails/tokens and UUIDs are filtered from the outbound copy of free text; original reports remain private and evidence is still checked against them. Filtering is not a guarantee that arbitrary volunteered text contains no identifying information.

Configuration requires the approved model, key, total cap and explicit rate/approval fields. A monthly cap is no longer accepted, and configured rates below the verified standard rates fail closed. Reservations account conservatively at the largest input/cache rate and the bounded maximum output. Metered cost is conservative accounting, not an invoice or a verified credit balance. Current standard rates used: input $0.10, cached input $0.01, cache writes $0.125, output $0.50 per million tokens. Sources checked October 3: [Luna and rates](https://developers.openai.com/api/docs/models/gpt-6-luna), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [provider retention](https://developers.openai.com/api/docs/guides/your-data).

The approved policy is history retained until user deletion, separate provider/backup retention, and an initial AI experience for ages 18+. Generation checks the saved profile age; account/profile access is unchanged. Both the mobile disclosure and accepted disclosure version now reflect that policy. Confirmation remains distinct from independent verification, medical clearance and plan generation.

Local verification: backend typecheck and **41 tests**, including 18 onboarding PostgreSQL subtests, pass. Coverage includes RLS/grants, two-user isolation, exact review confirmation, corrections/skips, retries/lost responses, timeout/lease recovery, pool release, refusal/invalid output, stale/deleted/profile-changed/signed-out races, private logging, lifetime and evaluation caps, true concurrent reservations, repeated evaluation accounting and disabled/missing configuration. Mobile typecheck and 36 tests pass. Added real PostgreSQL regressions exercise two 3,200-character HTTP messages, accumulated assistant/context state, strict original evidence, actual bound rejection/shorter-draft recovery, corrections/skips and exact confirmation. Initial single-response and complete multi-turn live checks are recorded below; broader dialogue, phone and hosted behavior remain unverified.

### Local real-AI evaluation

The owner securely configured `OPENAI_API_KEY` in the ignored server file `backend/.env.local` on October 3. Its value was never printed. `ONBOARDING_AI_ENABLED=false` remains unchanged; only the isolated evaluator made calls. Keep credentials out of chat, mobile configuration and Git.

A persistent synthetic PostgreSQL fixture is prepared and stopped under ignored `backend/.ai-evaluation/data`, loopback port **55433**, database **fitquest_ai_evaluation**. It contains synthetic Auth stubs, synthetic profile definitions/rows and the forward onboarding migration. The destructive reset was never replayed in this persistent fixture. It is separate from disposable tests on port 55432; ordinary tests never connect to it. **Never reinitialize/delete this fixture or reset its ledger when rerunning evaluations.** Current ledger: **$0.004677 conservatively accounted**, **$0 reserved**, 12 settled attempts, $7 lifetime cap, $0.25 evaluation sublimit, app activation locked. Local trust authentication is confined to loopback and this synthetic fixture; it is not hosted credential configuration.

The initial smoke, suite and multi-turn conversation have completed; these commands are retained for explicitly needed follow-up checks, not an instruction to repeat spending. Start the prepared fixture if stopped, review the smoke result, and stop on failure:

```sh
pg_ctl -D /Users/nicksoteropoulos/Code/FitQuest/backend/.ai-evaluation/data -l /Users/nicksoteropoulos/Code/FitQuest/backend/.ai-evaluation/server.log -o '-h 127.0.0.1 -p 55433 -k /tmp' start
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run eval:smoke
# After assessing the smoke result:
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run eval:suite
# Full production assembly path; refuses to replay an existing conversation:
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run eval:conversation
```

The runner uses only invented fixtures: mixed tennis/pull-up, abstract longevity/coordination, endurance/body composition, irregular availability, corrections/conflicts, skips, restrictions and embedded malicious instructions. It reserves durably before network I/O and stops on any failed, invalid or unmetered response. Failed/uncertain calls keep reservations. Repeated runs count against the same allowance. Synthetic outputs, usage, conservative cost and latency are saved in ignored `.ai-evaluation/results.jsonl` for qualitative review; schema validity alone is not quality. Ordinary tests inject providers and cannot spend API credit.

Live results, October 3: the initial **8/8 single-response cases** passed schema/evidence validation and qualitative review for mixed and abstract goals, priorities, irregular availability, skips, restrictions and malicious instructions. These were independent cases, not a whole conversation; their raw synthetic records remain in ignored `.ai-evaluation/results.jsonl`.

The later full HTTP/service/store evaluation used **two 3,200-character answers**, actual prior assistant replies and persisted context, a schedule skip, an availability correction, and an explicit request to finish reviewing. Requests measured **7,049 → 15,449 → 20,568 bytes**, below the unchanged 24,000-byte limit. Replies retained tennis first, the separate pull-up/coordination goals and uncertain knee restriction; they did not reask collected profile fields or the skipped schedule, and stopped asking questions at review. The editable understanding retained original reports, organized source-backed items and the confirmed manual correction. The last initial result used valid quotes but mislabeled paraphrases as reports and was rejected. After deterministic original-quote handling passed unit/integration tests and offline validation of that saved output, one explicit retry completed successfully. The rejected call remains charged. **Reviewed revision 9 was confirmed as revision 10 and reopened exactly, without a confirmation model call.** These results do not establish all future conversation quality or phone/hosted acceptance.

Multi-turn evidence is in ignored `.ai-evaluation/conversation-results.jsonl`; it includes each actual request projection, proposal, usage, stored snapshot, rejection and retry. The evaluator refuses to replay a nonempty conversation; `--resume-conversation` is an explicit inspected-failure operation, never an automatic retry. The multi-turn calls took **3.608–10.701 seconds** and used **12,425 input / 3,053 output tokens**, with 12,413 cache-write tokens reported within input. All **12** live calls together used **17,792 input / 4,894 output tokens** and consumed **$0.004677 in conservative accounting**; outstanding reservations are **$0**. Remaining accounting allowances: **$6.995323 overall / $0.245323 initial evaluation**. This is not invoice reconciliation or a verified credit balance. Both local fixtures were stopped with the persistent ledger preserved.

### Activation after HQ checkpoint

1. HQ reviews and publishes the exact SHA on `codex/reset-backend-connectivity`; Engineering does not commit/push or deploy beforehand.
2. Read current Supabase migration and Render deployment state. Apply only the reviewed forward onboarding migration if absent, preserving existing profiles/accounts, private grants and forced RLS; never run the reset.
3. Freeze the source evaluation ledger against further dispatch, then read final settled/reserved totals. Transfer both lifetime and evaluation liabilities exactly once into the destination ledger before enabling its `app_enabled` flag. Keep the source frozen and preserve its evidence; never open two independent $7 allowances. Current totals above must be rechecked at transfer.
4. Securely configure the existing Render service (`srv-d828o7pj2pic739le3ug`, `fitquest-api`), deploy the reviewed SHA, and enable the reviewed budget/configuration. Preserve service plan, TLS, email confirmation and deploy policy; no keys in output or mobile configuration.
5. Verify live health and onboarding auth protections, then the current Metro LAN URL and iOS JS bundle using the installed SecureStore-capable development app. Authenticated smoke requires a legitimately confirmed synthetic identity; otherwise document that limit and leave personal acceptance to the owner’s phone session. Do not alter personal records or weaken confirmation.

The existing Free FitQuest project `wqvxddvihlobnalxpzow` was fully reset at the owner's request. Its application migration ledger and local migration directory now contain one fresh baseline: `20261002233706_reset_accounts_and_profiles.sql`.

The one-time destructive baseline removes all current profiles, Auth users/identities/sessions/refresh tokens/flow/audit data, drops obsolete storage policies, and recreates the private profile schema. All 17 pre-reset public tables and four workout RPCs were removed before this baseline; the old empty progress-media bucket was deleted through the Storage API. No old account data was exported. Supabase's managed structures and internal service-version records remain operational; the previous application migration ledger was replaced. The existing restricted backend role is validated and reused without changing its password. **Do not rerun this destructive reset against populated accounts.** Future changes need new migrations.

The migration creates only the private `fitquest` schema, a restricted `fitquest_app` login role, and one profile row per `auth.users.id`. RLS is enabled/forced with ownership in both USING and WITH CHECK. Fastify sets transaction-local ownership after verification; explicit owner predicates also scope reads/writes. `anon`, `authenticated`, `service_role` and PUBLIC receive no schema/table access. Do not expose `fitquest` through the Data API, create public views/RPC wrappers, or connect Fastify as a bypass-RLS role. The app role cannot access Auth tables. A private session-verdict function uses a fixed empty search path and definer privileges solely to read Auth-managed session state, including when its RLS is enabled. It checks the transaction account context; EXECUTE is revoked from PUBLIC and Data API roles and granted only to fitquest_app. No public RPC wrapper is created. A generated role password is a backend secret provisioned separately; it is not part of the migration.

Local database test (requires a deliberately isolated disposable loopback PostgreSQL cluster, not an ordinary development database; do not assume a previous test cluster is still running):

```sh
FITQUEST_TEST_DATABASE_URL=postgresql://fitquest_test@127.0.0.1:55432/postgres npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
```

This opt-in test rejects hosted URLs and creates/removes a disposable local database. It exercises the actual migration, restricted-role save/read/reopen, repeated updates, timestamps, two synthetic owners, broad-query RLS, ownership reassignment rejection, Data API role grants, signed-out/expired sessions, and a deferred COMMIT failure with rollback. Its synthetic Auth schema does not verify hosted Supabase auth or PostgREST.

## Deployment / status

Existing Render Docker service: `fitquest-api` (`srv-d828o7pj2pic739le3ug`), root `backend`, Dockerfile `./Dockerfile`, context `.`, health `/health`. Keep its existing compute plan, Blueprint association and **After CI Checks Pass** policy. HQ publishes the reviewed onboarding checkpoint on `codex/reset-backend-connectivity`; Engineering verifies and deploys that exact SHA under the owner’s scoped October 3 authorization. Other paused work stays paused. Docker builds Node 24.21.0 and runs as non-root.

Engineering verified [deployment](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db04s9c9v7es739ub95g) **Live** at `49e1ff3aed30a009172df44049bfae9ea405f897`. External checks confirmed `/health` 200, signed-out GET `/profile` and POST `/profile-intake` 401, and invalid-token GET `/profile` 401; private responses use `Cache-Control: no-store`. A read-only query inside the Render container confirmed strict TLS connectivity as `fitquest_app`. The owner approved configuring the existing service and rotating that restricted role's password; local/Render configuration was updated without changing permissions. No migration or reset was replayed. During this pause checkpoint HQ independently rechecked health 200 and signed-out profile 401/no-store. No new deployment or configuration change was performed.

HQ reran backend typecheck, 12 unit tests and the real PostgreSQL integration test in a new isolated local cluster; all passed. Those tests verify local persistence, isolation and rollback. Hosted aggregate checks now confirm one persisted profile, linked to the sole confirmed Auth account. The authenticated write and account foreign key are verified; phone reload and hosted two-account isolation remain pending. Only aggregate counts and account-link checks are inspected, never personal profile fields.

Immediately after the owner-requested reset, Engineering verified zero accounts/profiles and removal of the legacy app components. That is a historical snapshot: the later account and saved profile now exist. RLS was enabled/forced and security advisors returned no findings at that earlier check; advisors were not rerun for this documentation update. Earlier anonymous Data API profile requests were rejected with 406/PGRST106; the schema is private. Do not repeat the reset or delete the current account/profile.

At the last Engineering check, email/password signup and confirmation remained enabled; other native auth providers were disabled. The exact callback `fitquest-dev://auth` is allowlisted. Custom SMTP is disabled: default delivery supports team addresses, while public signup and the two-account walkthrough need the owner's email-delivery configuration. The owner confirmed the refreshed app runs on the iPhone, and Engineering verified the linked saved profile. Phone reopen/session-refresh and hosted two-account isolation still need verification. The newer uncommitted mobile greeting does not change this API or schema. The canceled Render Postgres instance must not be recreated.

At the earlier documentation-only pause checkpoint, pending source changes were mobile-only and no checks were rerun for that reconciliation. The subsequently authorized local onboarding changes and tests are described above. Preserve existing credentials privately; hosted state remains unchanged.
