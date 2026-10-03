# FitQuest mobile

React Native / TypeScript on Expo SDK 57. **Work paused by the owner on October 2, 2026 (America/New_York).** Commands below are reference for resuming, not instructions to restart work automatically.

## Implemented flow and publication state

Email/password sign-in or sign-up is the entry screen. Required email confirmation precedes access to private profile data. Sign-out clears that account's UI.

- Published application `49e1ff3aed30a009172df44049bfae9ea405f897`: authenticated accounts see the profile form, with saved values restored when present; a committed save displays **User Data Saved**.
- **Newer, uncommitted local change:** a saved profile opens **Hi &lt;firstname&gt;**; a new account fills the form and reaches the greeting only after the API confirms a committed save. Loading hides the form; failed reads offer retry, not a misleading empty form. Failed saves retain entries. There is no edit-profile navigation from the greeting yet.
- The local greeting changes are in `src/ProfileIntakeForm.tsx` and `src/accountFlow.test.mjs`. Preserve them; they are not part of the published application checkpoint.
- Existing brand, sign-out and small backend-status footer remain. This is not a dashboard.

Profile fields: first name, last name, height (feet/inches, sent as total inches), age, weight (lb) and gender. Fastify owns validation, account authorization and persistence. The API still returns exactly `{"message":"User Data Saved"}`; the greeting UI consumes that response instead of displaying it as a success message.

## iPhone development setup

The [refreshed development build](https://expo.dev/accounts/nsoterop/projects/fitquest/builds/67f13060-1006-4b6f-a2f5-f59eed28d594) succeeded at `49e1ff3` and contains Expo SecureStore. The owner confirmed the app runs after installation. No replacement native build is required for the subsequent greeting-only change; a development build loads current JavaScript from Metro.

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile ci
cp -n /Users/nicksoteropoulos/Code/FitQuest/mobile/.env.example /Users/nicksoteropoulos/Code/FitQuest/mobile/.env.local
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile start
```

Keep Mac and iPhone on the same network. Open FitQuest's development build and scan Metro's QR. If discovery fails, use **Enter URL manually** with the Mac's current LAN URL. The last Engineering-verified address was `http://172.20.10.2:8081` on October 2; it is not a permanent address. The locally generated QR at `.expo/current-metro-qr.png` can also become stale. Recheck connectivity on resuming. This pause did not stop or restart Metro.

Resolved setup issues:

- A stale Metro cache caused a Supabase dependency-resolution 500. Engineering restarted with `npm run start -- --clear` and verified manifest/bundle 200 responses.
- The previous native build lacked `ExpoSecureStore`. Installing build `67f13060` resolved the launch error; JavaScript reload alone cannot add native modules.

Future native builds, only when assigned:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run build:ios -- --no-wait
```

Use only verified included EAS credits, never paid upgrades/overages. The completed build used existing signing with `--non-interactive --freeze-credentials`. The owner handles any future Apple login/2FA. EAS project: `@nsoterop/fitquest`; bundle ID: `com.nsoterop.fitquest.dev`; scheme: `fitquest-dev`. A Mac-hosted development build is not a TestFlight or App Store release.

## Configuration and account boundary

Ignored `.env.local` contains `EXPO_PUBLIC_API_URL=https://fitquest-api-dpk5.onrender.com`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. These client values are public; never put secret/service-role/database credentials there. Restart Metro after environment changes.

Sessions use iOS Keychain through Expo SecureStore with chunked, serialized writes. No profile cache or session tokens are intentionally persisted in plaintext. Session restoration verifies identity before showing private content; foreground AppState controls refresh. Logout cancels profile work and removes the visible account; delayed responses cannot populate the next account. Failed sign-out hides the profile and offers retry.

The callback `fitquest-dev://auth` is configured. Email confirmation remains enabled. At the last Engineering check, custom SMTP was disabled; default email delivery was limited to authorized organization-team addresses. General public signup needs an owner-selected email-delivery setup. Do not bypass confirmation, make testers privileged project members, or provision paid services. [Supabase email restrictions](https://supabase.com/docs/guides/auth/auth-smtp).

The public health check runs on mount and Retry, not continuously. Only the expected HTTP 200 contract displays **Backend: Connected**. Authenticated profile reads/writes use the current account's token and preserve the API's account boundary.

## Verification at pause

- At published `49e1ff3`: HQ passed mobile typecheck, **27 tests** and online Expo compatibility; Engineering verified iOS Hermes export.
- For the uncommitted greeting: Engineering passed typecheck and **28 tests**, including existing-profile/confirmed-save greetings, pending/failed saves, failed-read retry, refresh and account-switch clearing. Engineering also verified the updated Metro iOS bundle returned 200.
- The component tests mock native/Auth/network surfaces. Secure-storage tests cover serialized writes, reopen, large Unicode tokens and failed writes; they are not native Keychain acceptance.
- Owner confirmed phone launch. Engineering's hosted aggregate checks confirmed one persisted profile linked to the confirmed account. The earlier zero-user reset snapshot is historical, not current.
- Physical-phone greeting, sign-out/sign-in restoration, reopen/session refresh and hosted two-account isolation remain unverified. No tests were rerun for this documentation-only pause update.

Future local checks:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

When the owner resumes, the pending phone walkthrough is to reconnect the installed build to Metro, confirm the saved account opens its greeting, check sign-out/sign-in and app reopen, and verify a new profile reaches its greeting only after a confirmed save. A second-account check needs a legitimately confirmed account; do not weaken confirmation. Greeting code publication also remains pending.

Previously reported dependency audit: 4 high / 8 moderate findings through inherited Expo tooling (`node-forge`/`uuid`). This was not rescanned during documentation reconciliation. npm's proposed Expo SDK 44 downgrade was not applied; no dependency remediation is authorized by this pause.
