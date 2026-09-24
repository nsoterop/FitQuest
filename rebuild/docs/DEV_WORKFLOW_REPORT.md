# iOS simulator development workflow verification

Date: 2026-09-23 (America/New_York). Scope: the existing `rebuild/` scaffold only. **Outcome: Debug + localhost Metro + Fast Refresh verified on the iPhone 17 Pro simulator.** This does not verify a physical device, data storage, authentication, or coaching.

## What changed

- Added SDK 57 compatible `expo-dev-client` `57.0.19` to the mobile package and updated the independent lockfile. The dev client provides a registered `exp+fitquest` URL scheme and local Debug launcher. Expo's [local development guide](https://docs.expo.dev/guides/local-app-development/) documents this dependency and the Debug/Metro workflow.
- The mobile `start` script now sets `NODE_OPTIONS=--dns-result-order=ipv4first` before `expo start --localhost`. On this Mac, the unmodified command bound Metro to IPv6 `::1` while Expo advertised `127.0.0.1`; the simulator could not fetch the bundle. The corrected script bound only `127.0.0.1:8081`.
- Added `ios:debug` using `REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1` and `expo run:ios --no-bundler`. Metro runs in a separate watch-enabled terminal; the native command builds/installs and opens the localhost dev-client URL. The existing `ios` Release command now also advertises loopback, while retaining its embedded-bundle behavior.
- Updated [README.md](../README.md) with the repeatable command sequence and recovery steps. Saved the rendered Debug screen as [dev-debug-simulator.png](dev-debug-simulator.png). The temporary Fast Refresh edit in `apps/mobile/App.tsx` was restored; its final text is unchanged.

## Repeatable command sequence from `rebuild/`

1. `npm ci`
2. In terminal A: `EXPO_OFFLINE=1 EXPO_NO_DOTENV=1 npm run dev:mobile`. Leave this running; the script binds Metro to `127.0.0.1:8081` on the checked Mac.
3. In terminal B, with an iPhone simulator available: `EXPO_OFFLINE=1 CI=1 npm run ios:debug --workspace @fitquest-rebuild/mobile -- --device 'iPhone 17 Pro'`. Accept the local iOS “Open in FitQuest?” prompt if shown. The command prints `exp+fitquest://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081` and the Debug app renders the foundation screen.
4. For JavaScript/TypeScript edits, keep Metro running; Fast Refresh updates the app without rebuilding native code. If Metro stops, restart terminal A, then choose the recent `http://localhost:8081` FitQuest entry in the development launcher or reload.
5. The independent Release smoke path is `EXPO_OFFLINE=1 CI=1 npm run ios --workspace @fitquest-rebuild/mobile -- --device 'iPhone 17 Pro'`; it embeds JavaScript and rendered while Metro was stopped.

`CI=1` was used only for non-interactive native build commands. The Metro terminal ran without `CI`, so file watching and Fast Refresh stayed enabled. No tunnel, LAN server bind, device transport, or Apple account setup was used.

## Verification evidence

| Command or action | Observed result |
| --- | --- |
| Read the handoff, current project context, M0 review/report, source, and generated native state before edits | Existing `ios/` was the ignored M0 generated project with no unexpected native source; no prototype or HQ-owned files were edited. |
| `npx expo install expo-dev-client --npm` from `apps/mobile/` | Exited 0; installed the SDK 57 compatible module. Pin normalized to `57.0.19`; `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --offline` exited 0. |
| `EXPO_OFFLINE=1 npx expo prebuild --platform ios --no-install` from `apps/mobile/` | Exited 0. Expo reported `Clearing ios`, then regenerated the inspected, ignored native project in place; no user-authored native change was present. Subsequent CocoaPods install completed with 94 pods. |
| `EXPO_OFFLINE=1 CI=1 npx expo run:ios --device 'iPhone 17 Pro' --no-bundler` from `apps/mobile/` | Exited 0; Debug build 0 errors, 2 warnings (duplicate `-lc++`, Expo Dev Launcher build-phase dependency warning). The automatic URL was initially LAN-addressed but no Metro server was running. This compile alone was **not** counted as a working Debug loop. |
| Initial `EXPO_OFFLINE=1 EXPO_NO_DOTENV=1 npm run dev:mobile`, then `lsof -nP -iTCP:8081 -sTCP:LISTEN` | Metro started but `lsof` showed `[::1]:8081`; `curl http://127.0.0.1:8081/status` failed. The simulator's Debug error screen requested `127.0.0.1:8081`. This diagnosed the bind mismatch. |
| Corrected `EXPO_OFFLINE=1 EXPO_NO_DOTENV=1 npm run dev:mobile`, then `lsof -nP -iTCP:8081 -sTCP:LISTEN` and `curl -fsS --max-time 5 http://127.0.0.1:8081/status` | Metro ran in watch mode; `lsof` showed `TCP 127.0.0.1:8081 (LISTEN)` only; curl exited 0 with `packager-status:running`. |
| `xcrun simctl openurl booted 'exp+fitquest://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'`, then iOS **Open** prompt | Exited 0; the dev menu reported `Connected to: http://localhost:8081` and `Fast refresh` enabled. Dismissing it showed the actual foundation screen on iPhone 17 Pro / iOS 26.4. |
| Temporarily changed `Local foundation` to `Local foundation · Refresh check` in `App.tsx` | Without another native build or manual reload, simulator accessibility text and screenshot showed the new text. Restoring the original line immediately restored `Local foundation`. No temporary wording remains in the source. |
| `xcrun simctl terminate booted com.fitquest.rebuild`, then `xcrun simctl launch booted com.fitquest.rebuild` with Metro running | Both exited 0; app relaunched and rendered the foundation screen. |
| Stopped Metro with Ctrl-C, reloaded Debug, then terminated/relaunched app | Port 8081 had no listener. Reload could not fetch code and briefly showed a blank view. Relaunch showed the Expo development launcher searching for servers, with the recent `http://localhost:8081` entry unavailable. The Debug app did not silently show a working offline screen. |
| Restarted the corrected Metro command and selected the recent FitQuest localhost entry | Loopback status was running again; the simulator returned to the foundation screen. |
| `EXPO_OFFLINE=1 CI=1 npm run ios:debug --workspace @fitquest-rebuild/mobile -- --device 'iPhone 17 Pro'` with Metro running | Exited 0; Debug build 0 errors, 2 warnings. Printed the `127.0.0.1:8081` dev-client URL and rendered the screen automatically after installation. This verifies the documented npm command rather than only a manual deep link. |
| `EXPO_OFFLINE=1 CI=1 npm run ios --workspace @fitquest-rebuild/mobile -- --device 'iPhone 17 Pro'` with Metro stopped | Exited 0; Release build 0 errors, 4 warnings (duplicate `-lc++`, eager bundle re-bundle, Expo Dev Launcher build-phase dependency warning). Installed screen rendered from its embedded bundle, without the Debug tools button. The printed launch URL was loopback-only. |
| `npm ci --cache /private/tmp/fitquest-dev-npm-cache --no-audit --no-fund` | Exited 0 after the dependency and script changes; installed 646 packages. Transitive `uuid@7.0.3` deprecation warning remains. |
| `npm run check` | Exited 0 after clean install: mobile/API/contracts typechecks, ESLint, 4 tests in 2 files, contract build, API production TypeScript build. |
| `npx expo install --check` from `apps/mobile/` | Exited 0: `Dependencies are up to date`. |
| `git check-ignore -v` for `ios/`, `.expo/`, and `node_modules/` | All matched `rebuild/.gitignore`; generated native/build state remains outside the untracked source list. |

The simulator screen and Fast Refresh observations were made through the Simulator UI, not inferred from a bundle response or Xcode's compile result. The saved Debug screenshot shows the developer-tools button and restored foundation text. The native build warnings did not prevent compilation or screen rendering. Installing the dev client also made npm report 10 moderate advisories; no advisory-by-advisory review or automatic fix was performed during this bounded workflow task.

## Limitations and handoff

- Debug mode requires the localhost Metro process. The initial iOS deep-link confirmation is an OS prompt; if declined, the dev client must be opened again. After Metro interruption, relaunching into the development launcher and selecting the recent localhost entry is the observed recovery path.
- The dev-client package may discover local development servers, but the Metro listener verified for this task was `127.0.0.1:8081` only. No API process was started; its existing server configuration remains loopback-only.
- Physical-device transport, signing, iOS account state, Android runtime, and app feature behavior remain unverified. This task did not implement M1, athlete records, auth, database, AI, or HealthKit.
- HQ owns shared status documents. Next gate: HQ reviews this workflow evidence alongside the separate Architecture/Design prerequisites before any bounded M1 implementation assignment.
