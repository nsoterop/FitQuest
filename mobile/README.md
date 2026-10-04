# FitQuest mobile

## Saved-completion navigation — HQ accepted, deployment pending

HQ independently passed 68 mobile tests/typechecking/offline Expo compatibility and all 106 backend tests with isolated PostgreSQL and zero skips. No blocking findings; accepted for publication and deployment, then the mandatory owner-test reset/readback. Phone acceptance remains unverified.

The greeting now checks the existing authenticated `GET /training` and renders **View training** only when a saved training summary exists. Profile creation, a started conversation and an unconfirmed recap do not unlock it. Loading/errors keep the button absent; failed reads offer **Retry loading saved progress**. Returning to the greeting, foregrounding or reloading checks again, including after the owner test reset. A committed completion receipt still opens training immediately for the existing single weekly dispatch, and summary-only/pending/failed/blocked planning retains recovery access. Checks make no generation request. Account-keyed form state, aborts and request identity guards reject responses after navigation, unmount, sign-out or account switching.

**68 mobile tests** and TypeScript pass; offline Expo compatibility passes. Rendered tests cover new profiles, unconfirmed recaps, pending/failed reads, summary-only and failed/pending/blocked plans, return/reload/foreground, post-reset emptiness, session rejection and late account-switch/unmount responses. Existing complete-week generation, minimal exercise rows, draft cleanup and clarification regressions still pass. Backend passes **106 tests** with isolated PostgreSQL/zero skips; its six-request synthetic wording check settled $0.003118. No native build or deployment occurred. Physical-phone navigation, grouped conversation and keyboard acceptance remain unverified; deployment and the scoped owner test reset follow HQ review/publication.

React Native / TypeScript on Expo SDK 57. **Scoped onboarding and catalog-backed planning are authorized through HQ.** Existing-service deployment and phone reconnection are authorized for HQ’s reviewed checkpoint. Native builds and other paused work remain outside scope.

## Complete weeks and minimal session rows — deployed; phone acceptance pending

Owner testing reset after `05b4ec8` (October 3, 2026): server readback confirms no old conversation, retained summary or plan remains for the sole account. Removed one summary, two plans, one day detail and three completed jobs; account/profile/sessions, request limits and all spending records are unchanged. Reload the installed app, then choose **Start onboarding → Continue to onboarding**. The existing start flow removes an account-scoped draft when its conversation differs from the fresh server conversation; do not sign out or clear unrelated device storage. Server deletion is verified, but actual phone draft removal and fresh-screen acceptance remain unverified. The previous plans are no longer available for the partial-week testing instructions below.

After explicit onboarding completion and successful draft cleanup, the screen requests `target:"week"` once. A complete result contains all seven dated days, including every session/rest. Reopen only reads saved data. A saved partial week offers **Complete weekly plan**; a failed weekly attempt offers **Retry weekly plan** with its exact attempt ID. Replayed completion, pending work and failed attempts do not auto-generate/backfill. Missing days are labeled incomplete, never a completed week. There are no **Generate <date>** buttons or hidden daily dispatch loop.

Each exercise row is one name plus concise prescription: `Incline dumbbell press — 3 × 8`, `Outdoor walking — 20 min`, or `Mobility hold — 2 × 30 sec`. Distance remains in miles; per-side wording appears when prescribed. Instructions, setup, phase/review labels, references, load conventions, effort/rest prose and extra metadata are absent, without an expandable replacement. Stored catalog and prescription fields remain intact. Minimal date/session grouping and existing clarification/summary navigation remain.

**62 mobile tests**, TypeScript and offline Expo compatibility pass; backend passes **98 tests** with isolated PostgreSQL and zero skips. Actual rendered screen tests assert all row text across repetitions, duration, distance and count; one weekly request after completion; zero paid dispatch on reopen/replayed completion; double-press suppression; seven saved days; truthful partial status; explicit completion/retry; draft cleanup and account isolation. One bounded synthetic Luna call returned a complete mixed week, including a multi-session day, for $0.007804 through the existing ledger. No native build or phone acceptance is claimed.

HQ independently passed all **62 mobile tests**, TypeScript and offline Expo compatibility, plus **98 backend tests** with isolated PostgreSQL and zero skips. No blocking findings; accepted for publication and Engineering deployment. The reviewed [05b4ec884a2512da7e8b88bcd6dbc4a5fd89b4d8](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db0qijqd0e5s73cpth4g) is live, verified October 3, 2026 at 9:18:07 PM EDT. Reload JavaScript and verify explicit completion → complete week → saved reopen with no generation. For an existing partial plan, use the single weekly completion action and confirm its existing sessions remain unchanged. Check exercise rows, clarification recovery, deletion/draft cleanup and keyboard behavior on the phone.

The actual iOS manifest and **4,912,995-byte** launch bundle returned HTTP 200 from the existing Metro server at `http://192.168.87.227:8081`. Verified `target:'week'`, **Complete weekly plan**, the approved API URL and the exact exercise-row fragment: name, separator and concise prescription; instructions, setup and load-convention metadata are absent. Backend runtime SHA/artifact hashes/weekly limits match the reviewed build; health and all 22 private-route rejection/no-store checks pass. No new native build or paid AI call occurred during deployment verification, and the spending ledger is unchanged.

Reload the installed development app on the Mac’s Wi-Fi; reconnect to the address above if needed. For an existing partial week choose **View training → Complete weekly plan** once, then reopen saved content without generation. The unchanged native build is `49e1ff3`. Manifest/bundle delivery and automated tests do not establish physical-phone reachability, layout, authenticated completion/backfill or keyboard acceptance.

## Previous clarification release — deployed; phone verification pending

Missing planning information now displays a concrete question and **Continue clarification**, with no seven-day “Coverage limited” list. Older enum-only blocks offer the same action and receive a tailored assessment from the retained summary. Actual catalog gaps are labeled separately. The action opens the existing minimal conversation directly, restores only its matching device draft, and uses ordinary Send/retry/reopen behavior. If completion already committed, the entry point accepts its cleanup receipt, clears the matching device draft and opens saved training; a lost receipt can be retried. It does not restart the whole onboarding interview or retrieve deleted chat. A corrected summary still needs explicit recap agreement before cleanup and a new outline; earlier saved sessions remain available.

HQ independently passed **60 mobile tests**, TypeScript and offline Expo compatibility, plus **84 backend tests** with isolated PostgreSQL and zero skips. Tests cover current/legacy blocks, catalog gaps, no automatic generation on reopen, routing to the question, draft restoration/cleanup, completion receipts and late sign-out responses. The reviewed backend [0cfff25b51f1d468f0073f34183ae9913b72c8b9](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db0pmdlg1s2s73f5gm40) is live, verified October 3, 2026 at 8:17:59 PM EDT. No native build occurred, and authenticated physical-phone/keyboard acceptance remains pending.

Reload the installed app, open **View training**, then reopen the existing blocked plan, select **Continue clarification**, answer the specific question, check the recap and agree. Verify the new outline/tomorrow, then reopen saved training without new generation. Confirm the old chat/draft is deleted and earlier saved sessions remain unchanged.

Metro at `http://192.168.87.227:8081` served the actual iOS manifest and **4,912,823-byte** launch bundle with HTTP 200. The bundle contains `/training/clarification`, **Continue clarification**, strict `summarySaved:true` receipt validation, draft-cleanup handling and the approved Render API URL. The running backend SHA/artifacts match the reviewed build; health and all 22 signed-out/invalid-token rejection/no-store checks passed. Native build `49e1ff3` is unchanged. This verifies delivery/compilation, not phone reachability, authenticated cleanup/recovery or keyboard layout. No paid call, migration or owner-data write occurred during deployment verification.

## Previous catalog planning deployment

HQ independently passed all 56 mobile tests/typecheck and offline Expo compatibility, plus 67 backend tests with isolated PostgreSQL. The actual iOS manifest/bundle returned 200 with the corrected training screen. All review findings are resolved and the owner approved publication/deployment. Engineering subsequently verified [ae588d66c8e5571fe1c284f5c5aec5a23624a5a4 live on Render](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db0on3c9v7es73ccgu80), exact health contract and 20 private-route rejection/no-store checks. The previous 314336e deployment failed because its Docker context omitted the catalog; the reviewed packaging correction built and deployed successfully. The backend migration was applied once from `20261003214718_catalog_planning.sql` at source commit `314336e4d0014923e530c6690ad5d7845dfcbeb9`, recorded in hosted history as `20261003225930_catalog_planning`; do not reapply it. No new native build or paid deployment-verification call occurred.

`TrainingScreen.tsx` adds a minimal saved seven-day view, per-day sessions/rest and a secondary **Training summary → Edit summary** affordance. Reported facts, AI inferences, assumptions and unknowns remain labeled. The new completion receipt includes `summarySaved:true`; only after deleting the account/conversation-scoped device draft does the phone open planning and request the outline followed by tomorrow. **View training** reopens saved content without generation. Later day details have explicit Generate/Retry actions. Failed generation preserves the saved summary; unknown response outcomes are checked with **Reload saved training**. Summary corrections preserve existing workouts and offer **Create outline from updated summary**. These are prescriptions, not workout logs.

Review corrections show canonical kg/meter prescriptions as lb/miles with sensible display precision; catalog per-dumbbell/per-side conventions remain visible. Outline headings include weekday/date and concise descriptive session intent (upper body, lower body, mobility, cardio or sport). An oversized unpublished outline offers explicit retry and no longer blames summary length. Added rendered-screen tests use actual catalog entries with 20 lb/approximately one mile, descriptive weekday labels, and failed-outline recovery.

The device supplies its current IANA time zone at start/explicit finish; retries retain the original command. Dates are computed on the server as calendar dates, including DST. The disclosure now says concise summaries/plans remain while the chat is deleted. No new native dependency/build is needed. Existing account-keyed unmount/cancellation guards clear private UI; late responses cannot open another account's plan.

`EXPO_OFFLINE=1 npm --prefix mobile run check` passes typecheck, Expo compatibility and **56 tests**. New component tests cover summary receipt → awaited device cleanup → outline/tomorrow only, saved reopen, on-demand days, edits preserving previous prescriptions, explicit retry and late unmounted responses, and cleanup of completed device drafts without removing newer unfinished drafts. Backend acceptance passed 67 tests including local PostgreSQL before the packaging-only correction; its 11 focused packaging/planning checks and subsequent Render image build also passed. Metro was restarted after its previous process had stopped; iOS manifest/bundle returned 200, **4,909,178 bytes**, with planning/disclosure/approved API markers. HQ independently rechecked this bundle over the LAN after deployment. This verifies serving/compilation, not device layout or phone reachability.

Backend planning is **live**. Runtime catalog, restricted TLS database access and unchanged accounting are verified. The current Wi-Fi address is `192.168.87.227`; the actual Metro iOS manifest/bundle returned 200 (4,909,178 bytes) after deployment. To test: reload the installed dev app on the Mac's Wi-Fi (`http://192.168.87.227:8081`), complete a fresh onboarding explicitly, check a dated outline/tomorrow, reopen without regeneration, request a later date, then correct the summary and explicitly generate a new outline. Confirm old saved sessions remain and sign-out clears them. Physical-phone acceptance and final keyboard behavior remain outstanding.

## Implemented flow and publication state

Email/password sign-in or sign-up is the entry screen. Required email confirmation precedes access to private profile data. Sign-out clears that account's UI.

- Historical application `49e1ff3aed30a009172df44049bfae9ea405f897`: authenticated accounts see the profile form, with saved values restored when present; a committed save displays **User Data Saved**.
- **Reviewed commit `675cccb`, served through Metro:** a saved profile opens **Hi &lt;firstname&gt;**; a new account fills the form and reaches the greeting only after the API confirms a committed save. Loading hides the form; failed reads offer retry, not a misleading empty form. Failed saves retain entries. There is no edit-profile navigation from the greeting yet.
- Greeting and onboarding are included in the published checkpoint; the installed native binary still loads current JavaScript from Metro.
- Existing brand, sign-out and small backend-status footer remain. This is not a dashboard.

Profile fields: first name, last name, height (feet/inches, sent as total inches), age, weight (lb) and gender. Fastify owns validation, account authorization and persistence. The API still returns exactly `{"message":"User Data Saved"}`; the greeting UI consumes that response instead of displaying it as a success message.

## Historical completion-only deletion deployment

HQ acceptance, October 3: independently passed typecheck and all 50 mobile tests, alongside the 50-test backend suite. Reviewed commit `cd79e78c15bc4cd8d3ad76400be6508566c13e49` was [deployed on Render](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db0kg95g1s2s73efutn0); actual phone cleanup/reopen and final keyboard behavior remain unverified. Earlier local-review notes below describe implementation evidence, not an outstanding code-review gate.

The new retention override clears the completed transcript and answer/pending UI on a committed deletion receipt, then clears the account/conversation-scoped device draft and returns to the existing greeting with a brief acknowledgement. Start onboarding uses the existing button and starts fresh. Reopen discards a draft tied to an already-deleted old ID; a lost completion response recovers from `not_found` without an AI retry. Incomplete conversations and drafts still resume as before; sign-out continues to clear local private state.

A failed device cleanup hides the deleted transcript and offers only **Finish cleanup**, which retries local storage without another server/provider request. Cleanup is serialized with writes and matches the old conversation ID, preserving a newer draft and other accounts. Secure storage now propagates private-chunk deletion failures and retains its index until deletion succeeds; reopen finishes a partial deletion or reports failure, rather than leaving inaccessible private fragments. Late callbacks cannot restore the completed screen or draft after close/account switching. Disclosure explains completion deletion and separate provider/backup retention.

Typecheck and **50 mobile tests** pass. The actual Metro iOS manifest/bundle returned 200 (4,885,633 bytes) with the cleanup flow, new disclosure and approved Render URL. Tests include completion acknowledgement timing, greeting/fresh start, failed cleanup, same-ID retry/lost response, stale draft removal, account switching, response validation and interrupted private-chunk cleanup. No native build or device acceptance is claimed. Deployment verification rechecked the same 4,885,633-byte iOS bundle with its deletion-receipt handler, Finish cleanup action, updated disclosure and approved API URL. **Reload JavaScript before testing** so the phone understands the new server receipt.

## iPhone development setup

### Previous deployed onboarding and planning walkthrough

**Ready for owner testing, October 3:** `0cfff25` is live. Reload the installed FitQuest development app on the same Wi-Fi as the Mac. If disconnected, choose **Enter URL manually** and use `http://192.168.87.227:8081`. The installed native binary is unchanged; this loads current JavaScript.

1. For an existing information-blocked plan, open **View training → Continue clarification** and answer its specific question. Otherwise start or resume onboarding. Incomplete conversations resume; deleted conversations are never recovered. Continue to the recap and explicitly agree, for example **Looks good**.
2. Confirm the conversation disappears and the retained summary leads to a dated seven-day outline and tomorrow's sessions/rest. Check weekday/session labels, lb/miles, keyboard visibility and scrolling.
3. Return to the greeting and use **View training** or **Reload saved training**. Saved content should reopen without generating again. Request one later day explicitly; other days should remain undetailed.
4. Open **Training summary → Edit summary**. Save a correction and explicitly create a new outline; previous saved sessions should remain accessible. Generation/retry actions may spend from the existing allowance; saved reads do not.
5. Check sign-out/reopen isolation and that a new onboarding starts fresh. If draft cleanup fails, use **Finish cleanup**; if generation fails, check saved progress before explicitly retrying.

These are pending owner acceptance steps. HTTP checks, local tests and bundle delivery do not verify authenticated device behavior, coaching quality or final keyboard layout. The following completion-only and earlier UI notes are historical; the current summary-retention/planning flow above supersedes their return-to-greeting ending.

**Reviewed UI simplification, October 3:** greeting → concise 18+/OpenAI retention disclosure → conversation, answer box and compact Send. The normal screen has no structured review/editor/confirmation, skip/refresh/delete stack, provenance/revision details or routine draft notices. Corrections are ordinary messages. A small **···** options menu contains navigation and explicit deletion. Only an actual pending/failed request shows its relevant recovery action. The UI never silently confirms structured context or generates a plan. The deployed backend adds conversational recap/agreement and a persisted finished acknowledgement.

Earlier simplification checks: mobile typecheck and **39 tests** passed, including the minimal healthy screen, disclosure, send/correction, persisted transcript and unsent draft reopen, same-ID lost-response recovery, secure-write failure, conditional pending/failed-reply checks, revision-conflict recovery, sign-out/account isolation and deletion during a pending request. Metro's actual iOS manifest and updated bundle returned 200 at `http://192.168.87.227:8081`; the 4,875,130-byte bundle contains the simplified UI and approved Render URL, with the removed review/recovery labels absent. Reload the installed FitQuest development app on the same Wi-Fi. This is serving/test evidence, not physical-phone acceptance. No native build, paid AI evaluation, backend/schema/provider/accounting change or hosted deployment was needed.

**Reviewed keyboard follow-up, October 3:** one `KeyboardAvoidingView` accounts for the enclosing safe-area top, with one outer scroll container and no automatic second keyboard inset. Focus, viewport changes, composer growth and new replies reveal the answer area while following the conversation; manual history scrolling suspends that behavior until focus or return to the bottom. No scrolling is triggered directly by each keystroke.

Latest checks: typecheck and **41 mobile tests** pass. The actual iOS manifest/bundle returned **200**, 4,881,590 bytes, with the current scroll component, safe-area offset and approved Render URL. A disposable iOS 26.4 simulator ran the actual App/OnboardingScreen with synthetic in-memory API/draft substitutes on a separate Metro port. Opening focus, multiline input and replies were exercised; this exposed a remaining safe-area overlap, now corrected. The Mac locked before the final native retest, and the follow-up Simulator access attempt timed out. The final keyboard layout and physical-phone behavior remain unverified. No new native build was made; no owner account or real API was used in the simulator.

One encrypted device draft per account holds only the bounded composer and pending operation (4,000-character text; 10,000-character record; 24-hour expiry). The transcript stays server-side. Pending IDs persist before send; lost responses recover with the same operation. Explicit AI retry is distinct and separately accounted. Failed secure writes prevent dispatch; storage failures are visible. Sign-out/account changes clear private UI and device draft, and late responses cannot revive them. Delete requires a concrete in-app confirmation, removes server content and local draft, and leaves profile/account intact; provider retention, backups and operational cost accounting are separate.

Onboarding was initially **published and activated** at `675cccb5069613b50a3497fa4e95fda9a6606370` on the existing Render service. The forward migration and single lifetime allowance are active; the running server confirms GPT-6 Luna and the approved key. The $7 total includes the $0.004677 already spent on 12 synthetic local calls; the local evaluation ledger is now frozen. Adults 18+ and history until deletion with separate provider/backup retention remain the approved policy. No new native dependency or build was needed. HQ independently passed all 36 mobile tests and typecheck; physical-phone acceptance remains pending.

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
