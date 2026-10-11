# Standalone iPhone preview

[Install FitQuest preview build 5](https://expo.dev/accounts/nsoterop/projects/fitquest/builds/5c579f01-e433-4c2a-bb83-bac14b7104d9) on the already-registered iPhone. This finished internal/ad-hoc iOS **Release** build, version 0.1.0/build 5, bundles source `1a3b2548432008fcaf4f838fec0392b906347f6a`. It includes the transparent header, Lucide controls, Nutrition caching fix and green saved-workout **Completed** indicators and connects to the existing hosted API/Auth services. It needs no Mac, Metro or shared Wi-Fi; hosted sign-in, saved records and synchronization still need internet.

## Install and test

Install **over the existing FitQuest app**, without uninstalling it. Open its home-screen icon normally; sign into the same account if needed. The owner reports having deleted/reinstalled the prior build 3 preview and seeing prior data without another sign-in. That observation is recorded as reported use, not a recommendation to uninstall or proof of every saved record and startup condition.

For personal acceptance:

1. Turn off the Mac or use cellular/a different Wi-Fi network, fully close FitQuest and cold-launch it. Confirm it opens without requesting a development server.
2. Check the expected saved plan, journals, food diary and weight records. Check the header, switching Nutrition tabs and completion indicators for already-finished saved logs. A first Nutrition visit/app restart can still load; repeat tab visits reuse in-memory state and refresh older data in the background.
3. Exercise the usual account/navigation, keyboard and layout flows. Record reproducible issues using sanitized steps, without publishing real health data, tokens or private screenshots. Do not regenerate a plan or reset records just to test installation.

The prior report establishes build 3 installation and visible restored data on that phone; build 5 acceptance remains for the owner. Full Mac-off cold launch, comprehensive saved-data/layout acceptance, VoiceOver and a real Sunday dispatch remain separate checks.

## Saved sign-in and updates

The app uses the existing bundle ID `com.nsoterop.fitquest.dev`, scheme `fitquest-dev` and secure-session storage. Same-device iOS Keychain entries can survive uninstall/reinstall, so a valid prior session can be restored and verified without typing a password. FitQuest's session entries use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, which does not migrate them to another device through backup restoration. Another phone needs its own valid sign-in; installing this build does not include the owner's login or records. Use **Sign out inside FitQuest** to end the local session rather than deleting the app. [SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/).

**Install build 5 once to enable compatible over-the-air updates.** Its preview channel and fingerprint runtime are configured, and a baseline OTA is published. After a future compatible update is deliberately published, finish your work and cold-launch the app; a download can apply on the following launch. JavaScript/styling/assets can update without another installation. Native module/permission/SDK changes still require a new build. Git pushes alone do not publish an OTA. See [mobile updates](mobile-updates.md). Keep the separate `development` profile for coding through owner-managed Metro; the Release preview does not connect to it.

## Configuration and evidence

`mobile/eas.json` gives preview its own `developmentClient: false`, internal distribution, iOS Release/device target, medium worker, Node 24.21.0 and existing remote credentials. The existing EAS project, app/keychain identity, signing and registered devices were preserved. The native icon remains opaque; the in-app mark is transparent.

The existing project's `preview` environment holds the three approved public client settings: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, configured as Sensitive. Values were privately compared with the existing approved configuration and verified in the compiled artifact. These are client values; backend OpenAI keys, Supabase secret/service-role keys, database connections and signing credentials must never be put in the app or Git. No values are documented here.

[Exact-source CI](https://github.com/nsoterop/FitQuest/actions/runs/38182480693) passed before the one authorized build. EAS reports **FINISHED**; the IPA contains Release Hermes JavaScript and current assets, with actual entitlements/profile matching the prior installed-app identity and existing devices. Included allowance covered it with no added billed cost. [Release evidence](../archive/releases/2026-10-11.md#update-enabled-preview-and-authentication-plan) records detailed checks. The device-signed IPA cannot run on a simulator; packaging and mocks are not a physical-phone cold launch. Compatible preview OTA delivery is configured; TestFlight/App Store delivery remains unconfigured, and future builds require a new owner assignment.

See [Expo preview profiles](https://docs.expo.dev/build/eas-json/#preview-builds), [internal distribution](https://docs.expo.dev/build/internal-distribution/) and [environment variables](https://docs.expo.dev/eas/environment-variables/).

Seven-day session expiry and Face ID/passkey sign-in are [planned](../reference/session-expiry-and-face-id.md), not implemented in this build.
