# FitQuest mobile

React Native / TypeScript on Expo SDK 57. **Only scoped onboarding has resumed under owner authorization through HQ.** Its deployment/activation and phone reconnection are authorized after HQ’s reviewed checkpoint. Native builds and other paused work remain outside scope.

## Implemented flow and publication state

Email/password sign-in or sign-up is the entry screen. Required email confirmation precedes access to private profile data. Sign-out clears that account's UI.

- Historical application `49e1ff3aed30a009172df44049bfae9ea405f897`: authenticated accounts see the profile form, with saved values restored when present; a committed save displays **User Data Saved**.
- **Reviewed commit `675cccb`, served through Metro:** a saved profile opens **Hi &lt;firstname&gt;**; a new account fills the form and reaches the greeting only after the API confirms a committed save. Loading hides the form; failed reads offer retry, not a misleading empty form. Failed saves retain entries. There is no edit-profile navigation from the greeting yet.
- Greeting and onboarding are included in the published checkpoint; the installed native binary still loads current JavaScript from Metro.
- Existing brand, sign-out and small backend-status footer remain. This is not a dashboard.

Profile fields: first name, last name, height (feet/inches, sent as total inches), age, weight (lb) and gender. Fastify owns validation, account authorization and persistence. The API still returns exactly `{"message":"User Data Saved"}`; the greeting UI consumes that response instead of displaying it as a success message.

## iPhone development setup

### Conversational onboarding

**HQ follow-up acceptance, October 3:** this source checkpoint is accepted for phone testing after Engineering verifies deployment and current Metro serving. HQ independently passed mobile typecheck and all 41 tests; the corresponding backend passed 48 tests. Final native keyboard behavior remains unverified after Simulator access timed out. The earlier “awaiting review” notes below describe implementation history, not a remaining code-review gate.

**Local UI simplification, October 3 (awaiting HQ Git review):** greeting → concise 18+/OpenAI retention disclosure → conversation, answer box and compact Send. The normal screen has no structured review/editor/confirmation, skip/refresh/delete stack, provenance/revision details or routine draft notices. Corrections are ordinary messages. A small **···** options menu contains navigation and explicit deletion. Only an actual pending/failed request shows its relevant recovery action. The UI never silently confirms structured context or generates a plan. The latest local backend adds conversational recap/agreement and a persisted finished acknowledgement.

Earlier simplification checks: mobile typecheck and **39 tests** passed, including the minimal healthy screen, disclosure, send/correction, persisted transcript and unsent draft reopen, same-ID lost-response recovery, secure-write failure, conditional pending/failed-reply checks, revision-conflict recovery, sign-out/account isolation and deletion during a pending request. Metro's actual iOS manifest and updated bundle returned 200 at `http://192.168.87.227:8081`; the 4,875,130-byte bundle contains the simplified UI and approved Render URL, with the removed review/recovery labels absent. Reload the installed FitQuest development app on the same Wi-Fi. This is serving/test evidence, not physical-phone acceptance. No native build, paid AI evaluation, backend/schema/provider/accounting change or hosted deployment was needed.

**Keyboard follow-up, October 3 (awaiting HQ review):** one `KeyboardAvoidingView` accounts for the enclosing safe-area top, with one outer scroll container and no automatic second keyboard inset. Focus, viewport changes, composer growth and new replies reveal the answer area while following the conversation; manual history scrolling suspends that behavior until focus or return to the bottom. No scrolling is triggered directly by each keystroke.

Latest checks: typecheck and **41 mobile tests** pass. The actual iOS manifest/bundle returned **200**, 4,881,590 bytes, with the current scroll component, safe-area offset and approved Render URL. A disposable iOS 26.4 simulator ran the actual App/OnboardingScreen with synthetic in-memory API/draft substitutes on a separate Metro port. Opening focus, multiline input and replies were exercised; this exposed a remaining safe-area overlap, now corrected. The Mac locked before the final native retest, and the follow-up Simulator access attempt timed out. The final keyboard layout and physical-phone behavior remain unverified. No new native build was made; no owner account or real API was used in the simulator.

One encrypted device draft per account holds only the bounded composer and pending operation (4,000-character text; 10,000-character record; 24-hour expiry). The transcript stays server-side. Pending IDs persist before send; lost responses recover with the same operation. Explicit AI retry is distinct and separately accounted. Failed secure writes prevent dispatch; storage failures are visible. Sign-out/account changes clear private UI and device draft, and late responses cannot revive them. Delete requires a concrete in-app confirmation, removes server content and local draft, and leaves profile/account intact; provider retention, backups and operational cost accounting are separate.

Onboarding is **published and activated** at `675cccb5069613b50a3497fa4e95fda9a6606370` on the existing Render service. The forward migration and single lifetime allowance are active; the running server confirms GPT-6 Luna and the approved key. The $7 total includes the $0.004677 already spent on 12 synthetic local calls; the local evaluation ledger is now frozen. Adults 18+ and history until deletion with separate provider/backup retention remain the approved policy. No new native dependency or build was needed. HQ independently passed all 36 mobile tests and typecheck; physical-phone acceptance remains pending.

Verification: mobile typecheck and 36 tests pass, including actual React screen behavior with mocked native/Auth/network surfaces for greeting/disclosure, review/edit/skip/confirm, secure-write failure, lost-response/reopen recovery, deletion, auth expiry and account-switch races. Expo compatibility used its offline bundled map. The earlier iOS Hermes JavaScript export remains historical evidence; it was not rerun for this change. Backend tests independently cover real local Postgres/API isolation and accounting. These do not establish physical-phone layout or native Keychain reopen. A new context-limit regression verifies that an explicitly rejected change retains its text, unlocks editing and permits a shorter send/review/confirmation. Unknown network outcomes still preserve recovery IDs. The current UI keeps conversations without exposing the earlier structured-review controls. Initial live and full multi-turn evidence are in the backend README. Physical-phone acceptance remains the owner’s walkthrough.

The [refreshed development build](https://expo.dev/accounts/nsoterop/projects/fitquest/builds/67f13060-1006-4b6f-a2f5-f59eed28d594) succeeded at `49e1ff3` and contains Expo SecureStore. The owner confirmed the app runs after installation. No replacement native build is required for the greeting and onboarding changes; a development build loads current JavaScript from Metro.

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile ci
cp -n /Users/nicksoteropoulos/Code/FitQuest/mobile/.env.example /Users/nicksoteropoulos/Code/FitQuest/mobile/.env.local
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile start
```

Metro was started with a cleared cache on October 3. The actual iOS manifest and its referenced Hermes development bundle returned **200** at `http://192.168.87.227:8081`; the 4,881,020-byte bundle contains the approved Render API URL and onboarding UI. This verifies serving from the Mac, not phone reachability. Keep Mac and iPhone on the same Wi-Fi; open the installed **FitQuest development build**, choose **Enter URL manually**, and enter that URL. Reload an already-open app. The address can change with networks; earlier `172.20.10.2` and saved QR images are stale.

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
- Historical greeting-only check: Engineering passed typecheck and **28 tests**, including existing-profile/confirmed-save greetings, pending/failed saves, failed-read retry, refresh and account-switch clearing. Engineering also verified the updated Metro iOS bundle returned 200.
- Greeting verification rerun on 2026-10-03: typecheck and all **35 current mobile tests** pass. Existing-profile lookup and acknowledged save both open `Hi <firstname>`; failed reads/saves do not. No application changes were needed for this recheck, and existing onboarding work was preserved. Metro is listening on port 8081; physical-phone acceptance remains unverified.
- The component tests mock native/Auth/network surfaces. Secure-storage tests cover serialized writes, reopen, large Unicode tokens and failed writes; they are not native Keychain acceptance.
- Owner confirmed phone launch. Engineering's hosted aggregate checks confirmed one persisted profile linked to the confirmed account. The earlier zero-user reset snapshot is historical, not current.
- Physical-phone greeting, sign-out/sign-in restoration, reopen/session refresh and hosted two-account isolation remain unverified. No additional unit tests were needed for deployment/configuration-only activation.

Future local checks:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

The pending phone walkthrough is to reconnect the installed build to Metro, confirm the saved account opens its greeting, check sign-out/sign-in and app reopen, and verify a new profile reaches its greeting only after a confirmed save. A second-account check needs a legitimately confirmed account; do not weaken confirmation. Greeting code is published in `675cccb`.

Previously reported dependency audit: 4 high / 8 moderate findings through inherited Expo tooling (`node-forge`/`uuid`). This was not rescanned during documentation reconciliation. npm's proposed Expo SDK 44 downgrade was not applied; no dependency remediation is authorized by this pause.
