# FitQuest mobile

React Native / TypeScript on Expo SDK 57. Email sign-in/sign-up is the entry screen; authenticated users see their profile form. Backend health status remains in a small footer. Supabase supplies accounts and private profile storage through Fastify.

## iPhone development

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile ci
cp -n /Users/nicksoteropoulos/Code/FitQuest/mobile/.env.example /Users/nicksoteropoulos/Code/FitQuest/mobile/.env.local
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile start
```

Keep the Mac/iPhone on the same Wi-Fi. Open FitQuest's development build and scan Metro's QR. If “Searching for development servers” persists, choose **Enter URL manually** and use the Mac's current LAN URL (previously `http://192.168.87.227:8081`). Keep local-network access enabled. Stop Metro with Control-C.

The existing [installed development build](https://expo.dev/accounts/nsoterop/projects/fitquest/builds/761d3147-f99b-46ef-8c03-da8e82b0bc89) predates SecureStore. **A refreshed development build is required** before testing these account changes:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run build:ios -- --no-wait
```

Use existing included EAS credits only; no upgrade or extra paid resources. The owner handles Apple login/2FA. EAS project `@nsoterop/fitquest`, development bundle `com.nsoterop.fitquest.dev`, scheme `fitquest-dev` and the LAN workflow stay the same. No new build has been queued yet.

## Configuration and account behavior

In ignored `.env.local`, set `EXPO_PUBLIC_API_URL=https://fitquest-api-dpk5.onrender.com`, plus the intended Free project's `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. These are public client values; never put secret/service-role/database credentials there. Restart Metro after changes.

Email/password account creation requires confirmation; sign-in creates a session and sign-out clears the displayed account/profile immediately. Sessions persist in iOS Keychain through Expo SecureStore, chunked with an atomic index to support larger/Unicode tokens. No tokens or profiles are stored in plaintext. Foreground AppState controls refresh. Failed remote sign-out hides the profile and offers retry before switching accounts.

Signup requests `fitquest-dev://auth`; the project's redirect allowlist must contain that exact URL. Confirmation remains enabled. Supabase's default SMTP delivers only to authorized organization team addresses and is not ready for public signup. New Free projects cannot customize those default templates. Inspect actual settings; do not disable confirmation or make testers privileged project members. Any custom email provider/domain setup needs the owner's choice/access; agents cannot provision paid subscriptions. [Supabase SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), [Free template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

## Profile and connection

The screen checks public `/health` at mount and on Retry, with a 75-second timeout and cleanup cancellation. Only the expected HTTP 200 health contract shows **Backend: Connected**. There is no polling.

After sign-in, Fastify's `/profile` restores first/last names, height as feet/inches, age, weight in lb and gender. Save sends the existing six-field payload to `/profile-intake` with the latest account-matched token. Local validation/units are preserved. Fields and duplicate submission are locked during a write; failures retain entries. Only the exact committed-write acknowledgment shows **User Data Saved**. Delayed reads and retries cannot overwrite edits. Logout unmounts profile state and cancels work; late responses cannot populate the next account.

## Verification / remaining work

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

TypeScript, online Expo dependency compatibility, 27 mobile tests and an iOS Hermes bundle export pass. Tests include actual React screens with mocked native/Auth/network surfaces: sign-in/sign-up and confirmation, verified session restoration, edits surviving delayed loading/failed saves, logout removing old values, and old account responses not populating a new account. Secure storage tests exercise reopen, serialized refresh/logout, large Unicode sessions and failed writes. Native iOS Keychain and real hosted signup/refresh/persistence have not been verified yet. No physical-phone acceptance is claimed for this change.

Existing Free project `wqvxddvihlobnalxpzow` now has a fresh application baseline. The owner requested removal of all legacy tables/RPCs, accounts/identities/sessions/tokens, and storage bucket/policies. The only app table, `fitquest.profiles`, was recreated empty with forced RLS; the dashboard confirms zero Auth users. Old accounts cannot be reused; fresh signup will be required.

Public signup confirmation is still blocked by custom SMTP being disabled; the owner's email-delivery choice/configuration is pending. The Auth redirect allowlist is empty; `fitquest-dev://auth` needs adding. Render environment and reviewed publication/deployment are pending. Existing live checkpoint `2317297` acknowledges intake without persistence. Next: finish email/redirect setup and hosted real-session verification, deploy the reviewed backend, install the refreshed development build, then perform the two-account synthetic phone walkthrough.

The inherited Expo toolchain audit reports 4 high/8 moderate findings through node-forge/uuid. npm's suggested fix downgrades Expo to SDK 44; that is not a suitable scoped change.
