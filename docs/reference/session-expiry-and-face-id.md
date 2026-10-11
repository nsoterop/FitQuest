# Session expiry and Face ID sign in implementation plan

The owner selected a **seven-day session lifetime** and optional Face ID sign-in. After seven days, FitQuest must stop accepting that session and ask for a fresh sign-in. An enrolled user should be able to return using an Apple passkey, usually verified with Face ID, without typing an email/password. Password sign-in remains available. This is a plan; the EAS Update release does not implement these authentication changes.

## Expiry and biometric sign in

Seven days means 604,800 seconds from the creation of the verified authentication session. Refreshing a short-lived access token, reopening the app, reinstalling it or receiving an OTA update must not restart that period. The server owns the deadline; the phone clock and user-editable metadata cannot extend it. A successful password or passkey sign-in creates a new session with a new deadline.

Face ID by itself unlocks something on the phone. To sign in again after a genuinely expired session, use a passkey challenge that Supabase verifies before issuing fresh tokens. Do not store the user's password or treat a successful local biometric prompt as server authentication. Biometric templates stay with Apple's platform. The system may offer the device passcode or another available authenticator; explain this in enrollment copy. [Supabase passkeys](https://supabase.com/docs/guides/auth/passkeys), [Apple passkeys](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys).

Apple passkeys can sync through iCloud Keychain. Another device must still complete its own verified sign-in to obtain a session; keep FitQuest session tokens in device-only storage. The optional Face ID setting does not authorize sharing an existing session or automatically linking accounts.

Supabase's passkey API is currently experimental. The installed Supabase JS 2.117.2 meets the documented version requirement, but a native React Native passkey adapter and relying-party configuration must be proven with Expo 57/iOS before choosing the implementation. Keep this compatibility decision explicit; a local Face ID unlock cannot replace this step.

## Existing account flow

[Supabase configuration](../../mobile/src/features/account/supabase.ts) persists sessions in [chunked device-only Keychain storage](../../mobile/src/features/account/secureSessionStorage.ts) and automatically refreshes tokens. [AccountPanel](../../mobile/src/features/account/AccountPanel.tsx) verifies restored identities, hides private views during sign-out and rejects late account responses. Its current sign-out path clears recoverable onboarding drafts, so automatic expiry needs a separate preservation path.

The API verifies tokens through Auth and requires a verified `session_id`. Its request guard and private database functions check active Auth sessions and `not_after`. Extend the existing guards rather than adding a parallel session system. Keep the private schema, forced RLS, verified owner identity and restricted runtime role. [Supabase session behavior](https://supabase.com/docs/guides/auth/sessions).

## Implementation sequence

### 1 Validate native passkey sign in

Confirm an HTTPS relying-party domain controlled by the project, its allowed origins and Apple's associated-domain requirements. Evaluate the existing API hostname before proposing another resource or paid domain. Prove registration, fresh sign-in and cancellation with a maintained, pinned native adapter using disposable synthetic accounts and the current Expo/iOS stack. Establish the required associated-domain file and entitlements, challenge/response serialization and account identity checks. Verify hosted passkey availability without changing production settings during planning.

Registration requires a confirmed, signed-in account. A passkey must attach to that existing account, rather than create or silently link a second account. Validate enrollment after recent authentication and verify that a challenge cannot be reused for a different user or origin. Resolve the experimental API/adapter decision before implementation proceeds. Native passkey support and associated-domain entitlements will require a later authorized native build; OTA cannot add them to build 5.

### 2 Enforce the seven day deadline on the server

Inspect the hosted Auth plan and current session settings. Supabase's managed session timebox requires Pro or higher; do not upgrade billing automatically. If available, configure a seven-day Auth timebox in the separately authorized hosted change. Because timebox enforcement happens at refresh and an existing JWT can outlast that point, enforce the same exact cutoff in FitQuest's existing private session guards.

Use trusted `auth.sessions.created_at` and the earlier of creation plus seven days or an existing `not_after`. Update both the ordinary `session_active` verdict and the locking `onboarding_session_guard` used by interactive stores/request accounting through one forward migration. Retain existing owner checks, empty search paths, restricted execution grants and session locking. Do not grant the runtime role broad Auth-table access. Expose only verified expiry metadata needed by the mobile gate; never expose session rows or refresh tokens.

Update the guarded fresh-installer inputs/checkpoints and isolated schema-parity tests with the forward migration; never replay the historical account reset. Apply the deadline per session without enabling single-session enforcement as a side effect.

If managed timeboxing is unavailable, the private guards can enforce expiry for all FitQuest application access. Document that distinction: it does not itself make Supabase reject refresh tokens. Define the supported Auth-session termination path before claiming global token revocation; avoid an unreviewed admin credential or scheduled deletion workaround. Expiry must apply to existing sessions from their original creation time, with a normal fresh sign-in for sessions already older than seven days.

### 3 Add expiry and optional Face ID controls

Before restoring private screens, verify the session and server deadline. Check expiry on cold launch, foreground return, token acquisition and while the app remains open; stop automatic refresh once expired. Server denial is authoritative even if the phone clock is wrong. Show “Your session expired. Please sign in again.” without briefly showing profile/onboarding or saved private screens.

On automatic expiry, hide/unmount private UI, cancel account requests, clear volatile caches and remove expired authentication credentials. Preserve saved records, encrypted recoverable drafts and pending operation identities for the same account after reauthentication. Resolve uncertain writes through their existing receipts; do not blindly retry a paid or completed operation. Secure-storage cleanup failures must keep private views blocked and offer a recoverable retry.

Deny new interactions at the deadline while allowing previously authorized server work to record receipts and settled/uncertain charges durably. An expired client retrieves those results only after fresh sign-in; expiry must not discard financial liabilities or trigger a paid retry.

Add an opt-in account setting with clear passkey enrollment status. When enrolled and supported, the sign-in screen offers a Face ID/passkey action that completes the server challenge and establishes a fresh session. Keep email/password fallback for cancellation, unavailable hardware, failed verification or a removed passkey. Do not trigger biometric prompts on every app open while a valid seven-day session remains active. Explicit sign-out ends the current session; a registered passkey remains a sign-in method until the user explicitly disables/removes it.

Logout/expiry must not delete training, nutrition, weight, journals or profiles, change spending/account caps, or withdraw separate recurring-planning/OpenAI-sharing consent. Keep accounts isolated during account switches, late requests and biometric cancellation. In a network outage, block expired access and offer sign-in when connectivity returns; Face ID cannot create a new server session offline.

### 4 Verify and deliver the approved implementation

Use fake clocks, mocked native prompts and isolated PostgreSQL/Auth fixtures for deadline boundaries, refresh races and older sessions. Cover exactly seven days, daylight/timezone changes, phone clock rollback, long foreground sessions, same-device reinstall and OTA restart. Check revoked sessions and both database guards, including mutations and stale JWTs after expiry.

Test passkey enrollment, fresh session issuance, replay/origin rejection, wrong-account results, disabled passkeys, cancellation, passcode fallback and password recovery. Exercise automatic expiry during journal/draft editing, interrupted logout/storage cleanup and uncertain operations without losing recoverable data. Confirm the scheduler's separate authorization remains unchanged.

Run the repository checks and review the migration/hosted configuration before the separately authorized rollout. Deliver compatible backend and mobile changes, using a new native build for the passkey adapter/entitlements. Finish with registered-device Face ID, accessibility and seven-day expiry checks; simulator prompts and mocks cannot certify real Face ID behavior. Use synthetic fixtures, never a real-user test reset or paid coaching test.

## Completion criteria

- Every interactive FitQuest endpoint rejects a session at its trusted seven-day deadline, regardless of token refresh or phone clock.
- Expired sessions cannot flash private screens or recover into another account; saved data and recoverable drafts survive reauthentication.
- An opted-in user can establish a fresh same-account session with a verified Apple passkey; email/password fallback remains usable.
- No passwords, biometric templates, tokens, private answers or health records enter source, logs, screenshots or fixtures.
- Hosted settings, migration, native signing changes and physical-phone results are recorded separately from source/CI and mocks.
