# FitQuest rebuild — M1b disposable local synchronization

This independent workspace contains an Expo app, a Fastify API, and shared runtime-validated contracts. M1a adds encrypted synthetic local logging. M1b adds opt-in disposable PostgreSQL synchronization for the Debug simulator. Real authentication, hosted synchronization, and coaching remain unavailable.

## Requirements

- Node.js 22.13 or later (Node 24 LTS is recommended) and npm 11 for the checked-in lockfile.
- For iOS native builds: macOS, Xcode 26.4 or later, an installed iOS Simulator runtime, and CocoaPods.
- For the M1b local database: PostgreSQL 17 tools (`initdb`, `pg_ctl`) on `PATH`.

This uses Expo SDK 57 / React Native 0.86 / React 19.2.3. The selected package versions are pinned in the manifests and `package-lock.json`. iOS minimum from Expo's SDK table is 16.4. No Apple Health capability or permission is configured.

## Clean install and checks

Run from this `rebuild/` directory:

```sh
npm ci
npm run check
```

`check` runs the contract build, TypeScript checks, ESLint, contract/API/local-repository tests, and production API TypeScript build. PostgreSQL integration and native simulator checks run separately below.

## Local API

```sh
npm run build:api
npm run start --workspace @fitquest-rebuild/api
```

In another terminal:

```sh
curl -fsS http://127.0.0.1:3400/health
```

The expected response is `{"status":"ok","service":"fitquest-api","phase":"scaffold"}`. This is liveness only. For API source watching, run `npm run build:contracts` first, then `npm run dev:api`. The server binds only to `127.0.0.1`; do not expose it to a LAN or public interface. The optional `PORT` environment variable must be an integer from 1 to 65535, for example `PORT=3401 npm run dev:api`. `.env.example` documents this setting; the server does not implicitly load `.env`.

## Disposable M1b PostgreSQL and API

From `rebuild/`, set up the guarded task-owned cluster once, verify its migration ledger, and run the real PostgreSQL suite:

```sh
npm run m1b:db:setup
npm run m1b:db:verify
npm run test:pg
```

The cluster lives under ignored `private-test-artifacts/m1b-pg`, uses a Unix socket with TCP disabled, and contains separate `fitquest_m1b_synthetic` and `fitquest_m1b_synthetic_test` databases. The scripts require a matching task marker and exact database path before migration. `setup` creates random A/B fixture tokens in ignored `private-test-artifacts/m1b-fixture-authority.json` with private file permissions. Use synthetic records only; keep tokens out of logs and tracked files. `verify` also starts the cluster if needed. `m1b:db:start` resumes it; `m1b:db:stop` stops it while retaining records for review.

Start the explicit fixture API in another terminal:

```sh
npm run dev:api:m1b
```

It binds `127.0.0.1:3401`, rejects production mode, validates the local marker and restricted database role, and requires an A/B bearer token for athlete routes. `/health` remains public. The ordinary `dev:api` and `start` commands still expose only health. Do not point the M1b fixture API at a hosted database.

## iOS simulator development loop

From `rebuild/`, start Metro in one terminal:

```sh
EXPO_OFFLINE=1 EXPO_NO_DOTENV=1 npm run dev:mobile
```

Keep that terminal running. The app's start script forces Node to prefer IPv4 and starts Expo in localhost mode; check with `lsof -nP -iTCP:8081 -sTCP:LISTEN` if needed. It should show `127.0.0.1:8081`, not a wildcard or LAN address. A separate terminal can build, install, and open the Debug app on an installed simulator:

```sh
EXPO_OFFLINE=1 CI=1 npm run ios:debug --workspace @fitquest-rebuild/mobile -- --device 'iPhone 17 Pro'
```

If iOS asks whether to open FitQuest, choose **Open**. The Debug command supplies an Expo dev-client URL pointing to `127.0.0.1:8081`. Fast Refresh is enabled for JavaScript and TypeScript edits. After terminating and relaunching, the dev client can reconnect to the recent local project. If Metro is stopped, reload cannot fetch code; restart Metro and choose the recent local FitQuest entry.

The native SQLite configuration includes SQLCipher. After changing native dependencies or `app.json`, regenerate and rebuild the ignored iOS project:

```sh
cd apps/mobile
EXPO_OFFLINE=1 npx expo prebuild --platform ios --clean --no-install
cd ../..
EXPO_OFFLINE=1 CI=1 npm run ios:debug --workspace @fitquest-rebuild/mobile -- --device 'iPhone 17 Pro'
```

The generated `ios/` directory is disposable build output. Do not remove synthetic databases or Keychain entries to resolve an access error. Existing encrypted records are intentionally retained when a key, owner, or migration check fails.

## Synthetic local walkthrough

Debug startup shows locked athlete records until **Enable synthetic local test** is selected. This opt-in is only available in a development build. Select **Open synthetic A** or **B**; each uses a separate encrypted database and SecureStore key. Use synthetic values only. Save a minimal profile, then start an unplanned session. Add a strength or timed activity, enter facts, and tap **Save set** or **Save time**. Editing an entry keeps its stable ID and creates a new local revision. Text still being typed is stored as a separate raw draft after a short delay; the input status distinguishes unsaved, draft saved, and valid locally saved states.

Profile fields and the add-activity form also save raw drafts for the current synthetic identity. Wait for **Draft saved on this device** before terminating if you want the latest edit to recover. A result save first persists a stable intent, then commits the fact, immutable revision, pending command, and draft finalization in one transaction. Profile and add-activity saves also finalize their drafts in the fact transaction. After an interrupted or uncertain result save, reopen the activity and use the same entry; the retry keeps its result and operation IDs. Completed and ended-early sessions allow corrections to existing entries without reopening the session. The local draft migration runs forward when an existing encrypted M1a store opens; it does not reset records, commands, or keys.

**Status and account** shows local save and API sync states separately. In Debug, enter only the generated token for the active A/B fixture in **Local API fixture token** and select **Save**. The sender verifies account identity, then drains the durable outbox in dependency order. It distinguishes pending, sending, unknown outcome, blocked review, unavailable API, and confirmed receipts. If a revision conflicts, **Review blocked** shows the last confirmed base, latest local record, and current server record; explicitly apply the reviewed local record as a new operation or adopt the reviewed server record. Drafts and immutable history remain on the device. Pause, resume, retry, and one-shot acknowledgement failure are developer controls. Switching accounts stops the previous sender; tokens are separate SecureStore entries.

Developer checks also exercise transaction rollback, reopen recovery, wrong/missing key rejection, owner/migration mismatch detection, and same-operation retry on the simulator. The one-shot local save failure control makes the next valid save fail at a chosen transaction phase. The account controls exercise ordinary expiry, switch, sign-out, revocation, and a stale prior-account callback. These are synthetic authorization transitions; they do not prove Sign in with Apple.

The Release build never offers synthetic fixture entry, even if the development opt-in, active fixture state, and encrypted records are already present. Real athlete records remain locked until a later approved authentication slice.

To build and run the Release simulator binary with JavaScript embedded, Metro can be stopped:

```sh
npm run ios --workspace @fitquest-rebuild/mobile
```

The Release command generates an ignored `apps/mobile/ios/` directory and needs no Metro server. Physical-device signing and validation are separate future checks. The Release app contains no synthetic entry or local API sender, even if Debug fixture records and tokens are present.

## Boundaries

- `apps/mobile`: iOS-first React Native UI, fixture access boundary, SQLCipher local repository, durable drafts, outbox, explicit conflict review, and Debug-only loopback sender.
- `services/api`: health-only default server; explicit M1b local fixture API with PostgreSQL transactions, ownership checks, idempotent operation outcomes, immutable revisions, and RLS.
- `packages/contracts`: strict Zod health, profile/activity/session/command, and M1b receipt/snapshot schemas, independent of either framework.
- No real credentials, real athlete data, AI calls, or hosted services are used here.
- Secrets, local databases, native generated files, and private test artifacts are ignored by this subtree's `.gitignore`.

See [M1B_REPORT.md](docs/M1B_REPORT.md) for synchronization verification and limits, [M1A_REPORT.md](docs/M1A_REPORT.md) for earlier native verification, [M0_REPORT.md](docs/M0_REPORT.md) for foundation checks, and [DEV_WORKFLOW_REPORT.md](docs/DEV_WORKFLOW_REPORT.md) for the Debug development loop.
