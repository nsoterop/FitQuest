# Standalone iPhone preview

[Install FitQuest preview build 3](https://expo.dev/accounts/nsoterop/projects/fitquest/builds/971aab97-99da-4f28-8c24-8e19851b2b39) on the already-registered iPhone. This finished internal/ad-hoc iOS **Release** build, version 0.1.0/build 3, bundles source `1733958313ed1ec825f09df7b58080f54841021d`. It includes the transparent header, Lucide controls and Nutrition caching fix and connects to the existing hosted API/Auth services. It needs no Mac, Metro or shared Wi-Fi; hosted sign-in, saved records and synchronization still need internet.

## Install and test

Install **over the existing FitQuest app**, without uninstalling it. Open its home-screen icon normally; sign into the same account if needed. The owner reports having deleted/reinstalled this preview and seeing prior data without another sign-in. That observation is recorded as reported use, not a recommendation to uninstall or proof of every saved record and startup condition.

For personal acceptance:

1. Turn off the Mac or use cellular/a different Wi-Fi network, fully close FitQuest and cold-launch it. Confirm it opens without requesting a development server.
2. Check the expected saved plan, journals, food diary and weight records. Check the header and switching Nutrition tabs. A first Nutrition visit/app restart can still load; repeat tab visits reuse in-memory state and refresh older data in the background.
3. Exercise the usual account/navigation, keyboard and layout flows. Record reproducible issues using sanitized steps, without publishing real health data, tokens or private screenshots. Do not regenerate a plan or reset records just to test installation.

The report establishes installation and visible restored data on that phone. Full Mac-off cold launch, comprehensive saved-data/layout acceptance, VoiceOver and a real Sunday dispatch remain separate checks.

## Saved sign-in and updates

The app uses the existing bundle ID `com.nsoterop.fitquest.dev`, scheme `fitquest-dev` and secure-session storage. Same-device iOS Keychain entries can survive uninstall/reinstall, so a valid prior session can be restored and verified without typing a password. FitQuest's session entries use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, which does not migrate them to another device through backup restoration. Another phone needs its own valid sign-in; installing this build does not include the owner's login or records. Use **Sign out inside FitQuest** to end the local session rather than deleting the app. [SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/).

**Git pushes do not update this embedded preview.** No OTA/EAS Update channel is configured. Later docs-only commits leave its JavaScript and native assets unchanged; a future app update needs an assigned build/install path. Keep the separate `development` profile for coding through owner-managed Metro; the Release preview does not connect to it.

## Configuration and evidence

`mobile/eas.json` gives preview its own `developmentClient: false`, internal distribution, iOS Release/device target, medium worker, Node 24.21.0 and existing remote credentials. The existing EAS project, app/keychain identity, signing and registered devices were preserved. The native icon remains opaque; the in-app mark is transparent.

The existing project's `preview` environment holds the three approved public client settings: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, configured as Sensitive. Values were privately compared with the existing approved configuration and verified in the compiled artifact. These are client values; backend OpenAI keys, Supabase secret/service-role keys, database connections and signing credentials must never be put in the app or Git. No values are documented here.

[Exact-source CI](https://github.com/nsoterop/FitQuest/actions/runs/38087183717) passed before the one authorized build. EAS reports **FINISHED**; the IPA contains Release Hermes JavaScript and current assets, with actual entitlements/profile matching the prior installed-app identity and existing devices. Included allowance covered it with no added billed cost. [Release evidence](../archive/releases/2026-10-10.md#main-integration-and-standalone-personal-preview) records detailed checks. The device-signed IPA cannot run on a simulator; packaging and mocks are not a physical-phone cold launch. No TestFlight/App Store or OTA delivery was configured, and future builds require a new owner assignment.

See [Expo preview profiles](https://docs.expo.dev/build/eas-json/#preview-builds), [internal distribution](https://docs.expo.dev/build/internal-distribution/) and [environment variables](https://docs.expo.dev/eas/environment-variables/).
