# M0 verification report — local foundation

Date: 2026-09-23 (America/New_York). Scope: `rebuild/` only. M0's local foundation acceptance checks passed. This report does not claim authentication, persistence, coaching, a physical-device build, deployment, or release readiness.

## Delivered

- Independent npm workspace and lockfile under `rebuild/`; no prototype package, migration, deployment, or root configuration was changed.
- Minimal Expo/React Native TypeScript app with a truthful “Local foundation” screen. It contains no athlete facts, fake metrics, login flow, HealthKit permission, or API data request.
- Loopback-only Fastify API with `GET /health`. The response is parsed by a strict Zod schema in the framework-independent contracts package and says `phase: scaffold`.
- Separate API and contract tests, typecheck, lint, production API build, safe environment examples, local setup instructions, and subtree ignore rules.
- Screenshot of the installed iPhone 17 Pro Release simulator app: [m0-simulator.png](m0-simulator.png). The screenshot shows UI rendering only.

## Toolchain and version rationale

| Tool | Observed locally | Basis |
| --- | --- | --- |
| Node.js | `v24.12.0` | Meets Expo SDK 57 minimum `22.13.x` and Fastify v5 minimum Node 20. |
| npm | `11.6.2` | Generates and clean-installs the independent npm lockfile. |
| Xcode | `26.4.1` (`17E202`) | Meets Expo SDK 57's Xcode 26.4+ requirement. |
| CocoaPods | `1.16.2` | Installed locally; `pod install` completed during Expo prebuild. |
| Simulator | iOS 26.4, iPhone 17 Pro | Available and used for Debug and Release builds. |

The npm registry's current `expo` version query returned `57.0.24` at setup, so this uses Expo SDK 57, React Native `0.86.3`, and React `19.2.3`. Expo's [SDK 57 compatibility table](https://docs.expo.dev/versions/v57.0.0/) pairs SDK 57 with React Native 0.86, React 19.2.3, iOS 16.4+, and Xcode 26.4+. The React Native peer range accepts React 19.2.3. `npx expo install --check` confirmed the installed Expo dependencies, including safe-area-context 5.7.0. Expo's [monorepo guide](https://docs.expo.dev/guides/monorepos/) documents npm workspaces and automatic Metro support; no prototype-level Metro configuration was reused. Fastify `5.12.5` follows its [v5 Node 20+ requirement](https://fastify.dev/docs/v5.6.x/Guides/Migration-Guide-V5/). TypeScript `5.9.3` stays within `typescript-eslint`'s `<6.1.0` peer range; ESLint was updated to supported `10.11.0` before final verification.

## Commands and results

Commands below ran from `rebuild/` unless another directory is stated. Package fetches and simulator access used the local approval path because the normal sandbox could not access npm, bind loopback sockets, or connect to CoreSimulatorService. No global tool was installed and no hosted service was changed.

| Command | Result |
| --- | --- |
| `node --version`, `npm --version`, `xcodebuild -version`, `pod --version` | Exited 0; versions above. |
| `npm view expo version --json --fetch-timeout=10000 --fetch-retries=0` | Initial sandbox attempt exited 1 with `ENOTFOUND`; approved retry exited 0 and returned `57.0.24`. |
| `npm install --cache /private/tmp/fitquest-m0-npm-cache --no-audit --no-fund` | Exited 0; created independent `package-lock.json`. Reran after the ESLint update and exited 0. |
| `npm ci --offline --cache /private/tmp/fitquest-m0-npm-cache --no-audit --no-fund` | Exited 0 after the final lockfile update; installed 639 packages from cache in 8 seconds. One transitive `uuid@7.0.3` deprecation warning remained. |
| `npm run check` | Exited 0 after clean install: contract, API, and mobile typechecks; ESLint; 4 tests across 2 test files; contract and API production TypeScript builds. No suppressed errors. |
| `npx expo install --check` from `apps/mobile/` | Exited 0: `Dependencies are up to date`. |
| `npm run start --workspace @fitquest-rebuild/api` | Normal sandbox exited 1 with `listen EPERM 127.0.0.1:3400`; approved loopback run started successfully. |
| `curl -fsS --max-time 5 http://127.0.0.1:3400/health` | Approved loopback request exited 0 and returned `{"status":"ok","service":"fitquest-api","phase":"scaffold"}`. The API process was stopped afterward. |
| `EXPO_OFFLINE=1 CI=1 npm run start --workspace @fitquest-rebuild/mobile -- --port 8088` | Approved loopback run reached `Waiting on http://localhost:8088`; local `/status` returned `packager-status:running`. The iOS manifest pointed to `apps/mobile/index.ts.bundle`, which served a 3,823,628-byte bundle containing the foundation-screen text. Metro was stopped afterward. |
| `xcrun simctl list devices available` | Normal sandbox failed to connect to CoreSimulatorService; approved retry exited 0 and listed iOS 26.4 devices. |
| `EXPO_OFFLINE=1 CI=1 npx expo run:ios --device 'iPhone 17 Pro' --no-bundler` from `apps/mobile/` | Exited 0. Prebuild and CocoaPods install completed (87 pods); Debug build succeeded with 0 errors and 1 duplicate `-lc++` warning. The Debug app displayed “No script URL provided” because it was launched without a bundler URL. This Debug screen is not counted as app-screen verification. |
| `EXPO_OFFLINE=1 CI=1 npx expo run:ios --configuration Release --device 'iPhone 17 Pro' --no-bundler` from `apps/mobile/` | Exited 0. Embedded iOS JavaScript bundle; Release build succeeded with 0 errors and 3 warnings (duplicate `-lc++` messages and an eager-bundle option mismatch/rebundle notice). Installed and rendered the expected screen on the iPhone 17 Pro simulator. |
| `EXPO_OFFLINE=1 CI=1 npm run ios --workspace @fitquest-rebuild/mobile -- --device 'iPhone 17 Pro'` | Exited 0 after the script was set to the same Release/no-bundler path; 0 build errors, 3 warnings. This verifies the documented npm command. |
| `git check-ignore -v` on native `ios/`, `.expo/`, `node_modules/`, and package `dist/` paths | All were ignored by `rebuild/.gitignore`. The untracked implementation files reported by Git were confined to `rebuild/`. |

The initial attempt to pass both `--localhost` and `--offline` directly to `expo start` exited 1 because Expo treats them as mutually exclusive host modes. The successful command used `EXPO_OFFLINE=1` with the script's `--localhost`. The first direct `/index.bundle` request also used the wrong monorepo path; the iOS manifest supplied the correct bundle URL. These were setup diagnostics, not passing evidence.

## Boundaries and remaining checks

- The screen and health endpoint are scaffold-only. No API integration from mobile, auth, SQLite, PostgreSQL, AI provider, account data, or fitness workflow is implemented or tested in M0.
- Physical iPhone installation, signing, accessibility inspection, and Android runtime were not run. Simulator success does not imply those checks pass.
- The Debug binary's script-URL workflow is not finalized. The documented Release simulator command embeds JavaScript and rendered successfully without Metro. A later development workflow should resolve a loopback-only Debug launch before relying on hot reload or on-device debugging.
- The Release command printed an Expo deep link containing a machine LAN address after installation; no Metro server was running for that command, and the Release screen loaded its embedded bundle. No server was configured to bind to a LAN or public interface.
- No migration, hosted call, credential change, Apple account change, deployment, commit, or worktree was made. The generated native project and build products remain ignored local artifacts.

## Next gate

HQ reviews this M0 evidence. Before assigning M1, Architecture should settle the minimum profile/session/result API contracts, SQLite transaction and outbox strategy, identity/session verification, owner isolation, and conflict behavior; Design should provide the M1 logging flow. Engineering should then receive a bounded M1 handoff. Shared `docs/HANDOFF.md` remains HQ-owned and was not edited by this task.
