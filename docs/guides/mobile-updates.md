# Publish compatible iPhone updates

FitQuest's `preview` EAS profile targets the existing project's `preview` update channel. Finished build 5 adds Expo Updates; builds 3 and 4 cannot receive OTA updates. Install build 5 once using [phone instructions](phone-preview.md). Its initial baseline update is published and eligible for the verified native runtime. Older installed builds continue using their embedded bundle. [Delivery verification](../archive/verification/2026-10-11/mobile-updates/README.md).

The current [October 26 workout-logging UI correction OTA](../archive/releases/2026-10-26.md#subsequent-workout-ui-correction) is published from `8412c86` on `preview`, group `a28ef5f7-afac-40c3-bddf-69b212f4380f`. It matches build 5's existing runtime; served manifest/assets passed verification. No new native build was made. Phone launch remains acceptance.

## What can be updated

JavaScript, screen styling and bundled assets can be published to an installed build with a matching native runtime. Backend changes use the existing backend release process. New native packages, permissions, entitlements, Expo/React Native upgrades or another native runtime change require a compatible replacement build. The fingerprint policy computes compatibility from native inputs; do not override it just to force an update onto an incompatible app. [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).

The app checks for updates on launch with a zero wait for downloading: it starts the cached/embedded bundle, downloads a compatible update in the background and uses it on a later cold launch. Finish the current session, close and reopen normally after publication. An update must not force a reload while a workout or recoverable write is open. Cached or embedded code remains available without the update service; hosted Auth/data still needs internet. [Expo update downloads](https://docs.expo.dev/eas-update/download-updates/).

## Release a reviewed update

1. Under the owner's applicable release assignment, inspect the working tree and exact source/CI. Run [development checks](development.md), verify compatible backend contracts and privately confirm the approved API/Auth client settings. Keep local environments, private artifacts and records outside the upload.
2. Inspect the `preview` channel/branch mapping and the target installed build/runtime before publication. Preserve existing channel mappings; do not route this personal preview through a different existing channel.
3. From `mobile/`, use the reviewed CLI and the existing hosted preview environment:

   ```sh
   npx eas-cli@24.9.0 update --platform ios --channel preview --environment preview --message "Describe the tested change" --non-interactive --json
   ```

4. Capture the update ID, source revision and runtime. Verify the manifest and assets using the installed build's exact runtime/channel. Use the manifest's protocol-required asset request headers when verifying downloads; keep those generated authorization headers in private files. A successful upload alone does not establish eligibility or that a phone downloaded it. Verify a cold launch on the registered phone and report source, native build and OTA revision separately.

Publication is deliberate; a Git push does not automatically run EAS Update. Keep the existing public client environment, app/keychain identity, signing and account/data isolation. Do not upgrade billing or create a fresh paid allowance. If publication is uncertain, inspect existing update groups before retrying. Keep server/native compatibility and existing receipts/drafts during rollback; use Expo's supported compatible-update rollback/republication procedure without deleting real records. [Expo update setup](https://docs.expo.dev/eas-update/getting-started/).

Session expiry and passkey-based Face ID are described in the [implementation plan](../reference/session-expiry-and-face-id.md), not implemented by enabling updates.
