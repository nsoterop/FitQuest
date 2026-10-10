# Standalone iPhone preview

Use this internal preview for the owner's one-to-two-week personal testing period. It includes the current JavaScript and assets and connects to the existing hosted API/Auth services. No running Mac, Metro, LAN connection, TestFlight or App Store submission is needed. Internet is still required for sign-in, saved records, synchronization and other hosted features; this is not an offline-first release.

## Install and test

Open the verified installation link in the release handoff on the already-registered iPhone and install **over the existing FitQuest app**. Do not uninstall it: keep its saved session and encrypted local drafts. Open FitQuest normally from its home-screen icon. If the existing session needs verification or renewal, sign in with the same account.

For phone acceptance, turn off the Mac or use cellular/a different Wi-Fi network, fully close FitQuest, and cold-launch it. It should open the app instead of asking for a development server. Verify your saved plan, journals and food diary; check the transparent header logo and switching Nutrition tabs. Do not regenerate a plan or reset records just to test installation. Report any startup, sign-in, saved-data or layout issue before feature development resumes.

## Release configuration

`mobile/eas.json` keeps the original `development` profile for coding. The separate `preview` profile does not inherit it: `developmentClient: false`, internal/ad-hoc distribution, iOS `Release`, device target, medium worker, Node 24.21.0 and the existing remote credentials. The app identifier remains `com.nsoterop.fitquest.dev`, scheme remains `fitquest-dev`, and the existing EAS project is reused. Build number 3 follows the highest build number 2 for this exact identifier; older production builds belong to a different identifier and are not installation predecessors. The opaque home-screen icon and transparent in-app mark are preserved.

The existing EAS project's `preview` environment holds exactly the three approved public client settings: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Their values match the existing local/hosted configuration and are masked as Sensitive in EAS logs. The publishable key is intended for the client; never put an OpenAI key, Supabase secret/service-role key, database URL or signing credential in the app or Git. An environment label alone does not establish correct configuration: inspect the resolved values privately and verify the compiled artifact contains the intended hosted endpoints and public key.

For this authorized build, after exact-source checks/CI and allowance verification, from `mobile` use the pinned EAS CLI with `build --platform ios --profile preview --non-interactive --freeze-credentials`. Do not refresh ad-hoc provisioning, register devices, replace signing or submit to an app store. Inspect successful build metadata, embedded release JavaScript/assets, actual entitlements and provisioning against the prior development IPA. Follow the build to completion and publish its verified install link in the release handoff. Future builds require a new assignment.

The existing secure-session adapter, Supabase project and SecureStore options are unchanged. Matching bundle/keychain identity preserves installation/session compatibility; physical-phone session restoration still requires owner acceptance. No OTA/EAS Update channel or distribution platform was added. The device-signed IPA cannot run on an iOS simulator, so packaging/configuration/mocked checks must not be reported as a physical-phone cold launch.

See [Expo preview profiles](https://docs.expo.dev/build/eas-json/#preview-builds), [internal distribution](https://docs.expo.dev/build/internal-distribution/), [environment variables](https://docs.expo.dev/eas/environment-variables/) and [release evidence](../archive/releases/2026-10-10.md).
