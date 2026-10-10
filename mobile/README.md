# FitQuest mobile

React Native 0.86 / React 19 / Expo SDK 57, with TypeScript and an iOS-first interface. The app includes account/profile flows, five-question intake, plan review, Today/Week, workout journals, Nutrition, meal/recipe library, a separate Progress destination for dated weight, and recurring planning permission in Account. Matching JavaScript is served by the owner's Metro against the October 10 backend release; see [release verification](../docs/archive/releases/2026-10-10.md). [Product overview](../README.md).

## Setup and checks

Use Node 24.21.0. From the repository root:

```sh
npm ci --ignore-scripts
npm ci --prefix backend --ignore-scripts
npm ci --prefix mobile --ignore-scripts
cp -n mobile/.env.example mobile/.env.local
npm run check --prefix mobile
```

The checks compile TypeScript, check Expo dependency compatibility and run mocked component/storage tests. They do not require sign-in, a provider key or a running backend. Full repository verification is in [development checks](../docs/guides/development.md).

In the ignored environment file, set your own `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. All `EXPO_PUBLIC_*` values are bundled into the client. Never place database, service-role or OpenAI credentials there. Match the API and Auth project; use the API computer's reachable LAN address for physical-device testing, not the phone's `localhost`.

When you choose to start Metro:

```sh
npm run start --prefix mobile
```

This starts the configured development-client flow (`fitquest-dev` scheme). A compatible installed development client is a prerequisite; it must contain the project's native modules, including SecureStore. JavaScript reload cannot add native dependencies. This cleanup does not create a new native build or establish compatibility of an old installed binary. The historical simulator previews used an installed Expo Go 57 runtime with isolated synthetic data; they are not evidence that every installed FitQuest binary works today.

Keep the computer and device on the intended network and use the current address printed by Metro. Environment or Metro configuration changes require the server owner to restart it. Temporary test servers must be stopped; agents must leave owner-started servers untouched. The cleanup moved shared imports, so an already running owner Metro may need its owner's restart before phone testing.

## Accounts and shared code

Configure `fitquest-dev://auth` as an allowed redirect in your authorized development Auth project; keep email confirmation enabled. Supabase's default email sender is restricted to pre-authorized team addresses and is not a general signup service. Public signup requires suitable email delivery; do not bypass confirmation or grant testers privileged membership. [Official SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

Sessions and recoverable account-scoped drafts use Expo SecureStore; component tests mock the native surface. The API verifies live identity before private operations. Sign-out/account changes clear private UI, and delayed responses must not populate another account. Provider/backups and permanent accounting have separate retention from resettable training content.

Mobile imports only the platform-neutral modules in [backend/src/shared](../backend/src/shared/README.md). Metro watches that directory; backend implementation and test fixtures stay outside the mobile module graph. Keep these contracts free of Node/native dependencies.

## Evidence and limitations

Batch 2 recorded 128 passing mobile tests and a finite offline iOS export of 682 modules. Those checks establish JavaScript compatibility, not physical-device acceptance or a native build. [Synthetic screen provenance](../docs/reference/screenshots.md) and [known limitations](../docs/reference/architecture.md#known-limitations) cover keyboard/accessibility and scheduler evidence.

The two unresolved upstream tooling advisories and CI exception expiry are documented in [security guidance](../SECURITY.md). Existing [Expo MIT attribution](LICENSE) remains unchanged; FitQuest's project license is at [the repository root](../LICENSE).

[Historical mobile releases](https://github.com/nsoterop/FitQuest/blob/a297e2d/docs/history/mobile-release-notes-2026-10-10.md) retain earlier checkpoints without making them current instructions.
