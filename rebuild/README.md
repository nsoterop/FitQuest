# FitQuest rebuild — M1a local logging slice

This independent workspace contains an Expo app, a loopback-only Fastify health API, and shared runtime-validated contracts. M1a adds encrypted native storage and synthetic local profile/session logging. The 2026-09-24 correction pass adds versioned drafts and restart-safe result completion. Real authentication, server synchronization, and coaching remain unavailable.

## Requirements

- Node.js 22.13 or later (Node 24 LTS is recommended) and npm 11 for the checked-in lockfile.
- For iOS native builds: macOS, Xcode 26.4 or later, an installed iOS Simulator runtime, and CocoaPods.

This uses Expo SDK 57 / React Native 0.86 / React 19.2.3. The selected package versions are pinned in the manifests and `package-lock.json`. iOS minimum from Expo's SDK table is 16.4. No Apple Health capability or permission is configured.

## Clean install and checks

Run from this `rebuild/` directory:

```sh
npm ci
npm run check
```

`check` runs the contract build, TypeScript checks, ESLint, contract/API/local-repository tests, and production API TypeScript build. Native SQLCipher, restart, and simulator behavior require the walkthrough below.

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

**Status and account** shows pending command count and the disconnected sync state. Developer checks there exercise transaction rollback, reopen recovery, wrong/missing key rejection, owner/migration mismatch detection, and same-operation retry on the simulator. The one-shot failure control makes the next valid local save fail at a chosen transaction phase. The current input remains visible, and **Retry local save** succeeds after the injected failure. The account controls exercise ordinary expiry, switch, sign-out, revocation, and a stale prior-account callback. These are synthetic authorization transitions; they do not prove Sign in with Apple.

The Release build never offers synthetic fixture entry, even if the development opt-in, active fixture state, and encrypted records are already present. Real athlete records remain locked until a later approved authentication slice.

To build and run the Release simulator binary with JavaScript embedded, Metro can be stopped:

```sh
npm run ios --workspace @fitquest-rebuild/mobile
```

The Release command generates an ignored `apps/mobile/ios/` directory and needs no Metro server. Physical-device signing and validation are separate future checks. This app does not fetch the API or any hosted athlete data.

## Boundaries

- `apps/mobile`: iOS-first React Native UI, fixture access boundary, SQLCipher local repository, durable drafts and pending commands.
- `services/api`: Fastify health route only.
- `packages/contracts`: strict Zod health and M1a profile/activity/session/command schemas, independent of either framework.
- No real credentials, real athlete data, AI calls, backend athlete routes, or hosted services are used here.
- Secrets, local databases, native generated files, and private test artifacts are ignored by this subtree's `.gitignore`.

See [M1A_REPORT.md](docs/M1A_REPORT.md) for native verification and limits, [M0_REPORT.md](docs/M0_REPORT.md) for foundation checks, and [DEV_WORKFLOW_REPORT.md](docs/DEV_WORKFLOW_REPORT.md) for the Debug development loop.
