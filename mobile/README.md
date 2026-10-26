# FitQuest mobile

React Native 0.86 / React 19 / Expo SDK 57, with TypeScript and an iOS-first interface. Account/profile setup, five-question intake, plan review, Today/Week, workout journals, Nutrition/food library and Progress use the existing hosted API/Auth services. See the [current project overview](../README.md) and [architecture](../docs/reference/architecture.md).

## Personal phone testing

Use [standalone iPhone preview build 5](../docs/guides/phone-preview.md), source `1a3b254`. It includes the delivered training/branding/Nutrition corrections and Expo Updates. It runs without Mac/Metro; hosted features need internet. Install once over the existing app without uninstalling it. The `preview` channel delivers matching JavaScript/assets after a deliberate [OTA publication](../docs/guides/mobile-updates.md); native changes need a replacement build. Git pushes and Metro reloads do not themselves update this installed preview.

The [October 26 logging OTA](../docs/archive/releases/2026-10-26.md), source `2b4f83b`, is published to the same preview channel/runtime and verified against its served manifest/assets. On build 5, finish current work and cold-launch online, then close/reopen again to apply it. This adds autosave, per-set confirmation, exercise information/notes and Finish; no reinstall is needed. Physical-phone launch remains acceptance.

The owner reports installing the earlier build 3 preview and seeing prior saved data without another sign-in. This is consistent with an existing same-device Keychain session. Full Mac-off cold launch, saved-data/layout acceptance, VoiceOver and Sunday dispatch remain separate checks. See [delivery evidence](../docs/archive/releases/2026-10-11.md#update-enabled-preview-and-authentication-plan).

## Development setup and checks

Use Node 24.21.0. From the repository root:

```sh
npm ci --ignore-scripts
npm ci --prefix backend --ignore-scripts
npm ci --prefix mobile --ignore-scripts
cp -n mobile/.env.example mobile/.env.local
npm run check --prefix mobile
```

This mobile-only setup installs its three required dependency sets; the full repository also installs `database/`. Mobile checks run TypeScript, Expo dependency compatibility and mocked component/storage tests without sign-in, a provider key or a running backend. See [all development checks](../docs/guides/development.md). The October 10 preview checkpoint passed 160 mobile tests; dated counts are evidence, not a permanent suite size.

Set the three public client settings privately in the ignored environment file: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Match the intended API/Auth project. All `EXPO_PUBLIC_*` values are bundled into the client; never place database, secret/service-role or OpenAI keys there. For hosted-API development, use its approved HTTPS endpoint. Only when intentionally testing a local API should a physical phone use that computer's reachable LAN address; the phone's `localhost` points to the phone.

The owner chooses when to start Metro:

```sh
npm run start --prefix mobile
```

This serves JavaScript to a compatible **development client** with the `fitquest-dev` scheme. The separate `development` EAS profile is retained; the standalone Release preview does not connect to Metro. Native-module or native-icon changes require an authorized replacement build; a JavaScript reload cannot add them. Historical simulator checks used Expo Go 57 and isolated fixtures, not the device-signed preview IPA.

Use Metro's current printed address and the intended development network. Environment/Metro configuration changes may require the server owner to restart their process. Agents must leave owner-started servers untouched and stop their own temporary test processes. The shared-import configuration is already present; repository reorganization alone does not require another restart now.

## Accounts and shared code

Keep `fitquest-dev://auth` allowed in the intended Auth project and email confirmation enabled. Supabase's default email sender is restricted; public signup requires suitable email delivery. Do not bypass confirmation or grant testers privileged membership. [Official SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

Sessions and recoverable account-scoped drafts use Expo SecureStore. The app verifies a restored session with Auth before showing private data; the API independently verifies identity for private operations. Sign-out/account changes hide private UI and reject delayed former-account responses. Session entries use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: iOS Keychain can survive same-device uninstall/reinstall, but these entries do not migrate to a different device through backup restoration. Sign out inside the app to end its session; deleting it is not a reliable logout. [SecureStore persistence and device-only behavior](https://docs.expo.dev/versions/latest/sdk/securestore/).

Mobile imports only the nine platform-neutral TypeScript modules in [backend/src/shared](../backend/src/shared/README.md). Metro watches that directory; backend implementation and test fixtures remain outside the production mobile graph. Keep shared contracts free of Node/native dependencies.

## Evidence and limits

[Screen provenance](../docs/reference/screenshots.md), [mobile branding](../docs/reference/icons.md) and [known limitations](../docs/reference/architecture.md#known-limitations) distinguish mocks, synthetic native rendering, artifact inspection and owner-reported use. Two unresolved upstream tooling advisories retain time-limited CI exceptions in [security guidance](../SECURITY.md).

The existing [Expo MIT attribution](LICENSE), root [project license](../LICENSE) and dependency notices remain unchanged. Earlier [mobile release notes in Git](https://github.com/nsoterop/FitQuest/blob/a297e2d/docs/history/mobile-release-notes-2026-10-10.md) are historical evidence, not current commands or release authority.
