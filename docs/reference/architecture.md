# Architecture and operational limits

This describes the implemented application through the October 26 workout-logging delivery. The [project README](../../README.md) is the current-state entry point; [release procedure](../guides/release.md) governs delivery when assigned. Feature work is frozen for personal testing. Retained [product goals](product-goals.md) are aspirations, not implemented features or a work queue.

The [October 26 release](../archive/releases/2026-10-26.md) keeps the same architecture and hosting. Optional versioned logging hints and journal v2 use existing JSON columns, with legacy transport projection and old-writer protection. Local raw edits/pending stable operations are encrypted; serialized idle autosave retains newer edits through replay and conflict. Per-set confirmation distinguishes suggested/draft data from actuals; finished sessions do not imply all prescribed work. No migration, native dependency or new service was introduced.

## Boundaries

The React Native client uses Supabase for Auth and Fastify for application data. Both restored mobile sessions and private API operations verify identity with Auth. PostgreSQL access uses the restricted application role, private schema, session checks and owner-scoped transactions with forced RLS. User-editable identity fields do not authorize access.

Server records hold profiles/intake, saved plans and acceptance, journals, food/library snapshots, weight measurements, operation receipts, enrollment/consent and permanent accounting. SecureStore holds native sessions and account-scoped recoverable input/operation drafts. Local drafts and prescribed plans are not server-confirmed actual records. The same-device Keychain session can survive iOS uninstall/reinstall; session entries use device-only accessibility and do not migrate to a new device through backup restoration. [Session behavior](../../mobile/README.md#accounts-and-shared-code).

Nutrition additionally keeps loaded view data in memory within the account's training screen. It loads lazily, reuses reads for 30 seconds and refreshes older data without discarding the loaded display. Date/timezone and target changes revalidate the relevant data; account changes clear the mounted view and reject stale responses. This memory is lost on app restart and is not persistent/offline synchronization. Secure drafts and server receipts remain separate. [Dated cache checks](../archive/verification/2026-10-10/nutrition-cache/README.md).

[Database tooling](../../database/README.md) owns immutable migration files and guarded fresh installation with its own lockfile. Backend features own runtime persistence/authorization; this source boundary does not create a separate microservice or change hosted topology. Existing databases must not replay the fresh installer or historical account-reset SQL.

Nine platform-neutral TypeScript modules in [backend/src/shared](../../backend/src/shared/README.md) serve both packages, including birthday/derived-age validation. They remain inside the existing backend Docker context and have no server/native dependencies. Mobile watches/imports only this shared boundary. The backend production graph compiles to `dist`; tests/evaluation compile separately to `dist-test`, with fixtures/evaluation excluded from production.

Implementation entry points: [API routes](../../backend/src/app.ts), [runtime/scheduler startup](../../backend/src/server.ts), [planning persistence](../../backend/src/features/planning/planningStore.ts) and [mobile navigation](../../mobile/App.tsx).

## Profile, planning and records

New profiles choose birthday through a calendar-date picker and explicitly select gender. The API validates birthday and derives age at UTC date boundaries; February 29 advances on March 1 in non-leap years. Birthday remains in the private account/backend profile; AI contexts receive derived age, not the birthday. Adult checks use derived age. Legacy age-only profiles/clients remain supported without invented birthdays or automatic gender changes; old age-only writes preserve an existing birthday.

Five fixed intake answers preserve goals, activity, equipment, preferences and limitations. Document planning makes one accounted request for the complete dated week and nutrition. A small display contract preserves sessions, optionality, timing and duration ranges with flexible workout content; it is not an exercise-catalog selection or detailed prescription-validation framework.

The server owns identity, dates/timezone, revisions and acceptance metadata. It derives the overview from the saved complete document and withholds exercises until acceptance, including reload/API reads. Acceptance/reopen is free. Explicit revisions use a new metered request and require acceptance again; failures retain prior usable work. Legacy saved readers remain without silent regeneration. Restored accepted progress routes to Today after neutral loading; empty progress opens the initial disclosure, whose back action edits profile setup.

Prescriptions and actual records remain separate. Journals retain source snapshots, actual/unknown values, completion outcomes and notes. Food entries retain provenance and versioned recipe composition; changing a library recipe does not rewrite earlier consumption. Dated weight history does not overwrite profile weight or accepted nutrition targets. Logging/library arithmetic is deterministic; explicit food interpretation and plan generation/revision use AI.

Next-week context uses original intake, an accepted baseline and actual history only with explicit OpenAI-sharing permission. It includes up to 64 ending-week journals, 16 older matching-name sessions from the preceding 56 days, and 14 eligible weight measurements. Recent overflow or oversized context fails before dispatch; omitted older history is flagged. Matching names do not prove comparable equipment/units/loads. [Historical context evidence](../archive/verification/2026-10-09/next-week/README.md).

Every provider dispatch uses one permanent ledger with $7 lifetime and $0.25 cumulative evaluation caps, reservations and settled/uncertain liabilities. These are independent of application-content retention. No automatic paid retry, grader, repair or hidden extraction call is used. The additional account-policy quotas are implemented but remain disabled by owner choice; the pre-auth burst guard and existing global caps remain separate. [Security implementation record](security.md).

## Weekly scheduling

Accepted document history plus explicit recurring profile/intake and workout/weight sharing permission enrolls eligible accounts automatically for Sunday 9 PM in the saved timezone. Legacy explicit enrollment/pauses remain readable without permission upgrades. Consent withdrawal stops consent-managed future dispatch; work already sent may finish. Acceptance alone does not re-enable a paused schedule. Enrollment does not immediately generate a plan; the reviewed provenance migration is applied, but a real Sunday dispatch remains unverified.

The scheduler runs in the existing production API at startup and approximately every 60 seconds. Per-account locks, target-week identity and durable dispatch markers coordinate manual/scheduled work. Existing target-week drafts or accepted plans win. After downtime, only the latest eligible current/upcoming week is considered; obsolete backlog is skipped. Failed/uncertain dispatch requires explicit retry rather than an automatic new purchase.

API uptime can delay generation; this is not exact-time/notification delivery. A generated draft still needs acceptance. Accepted upcoming work becomes current by date; Sunday remains visible when next week is accepted early. [Dated scheduler checks](../archive/verification/2026-10-09/sunday-scheduling/README.md).

## Delivery and evidence

The existing API is Live at `1859ef83b212afe3fe7534fa9a011766dac04e9a`, matching current backend/database source. The applied security-account-policy, recurring-enrollment and birthday forward migrations retain their recorded source/hosted version mappings. Account-policy enforcement stays disabled.

`main` includes the completed source changes. Finished internal iOS Release build 5 (`5c579f01-e433-4c2a-bb83-bac14b7104d9`) embeds source `1a3b254` and the approved hosted configuration. It requires no Mac/Metro; hosted features require internet. Expo Updates uses the `preview` channel and fingerprint compatibility: deliberate publications can deliver compatible JavaScript/assets; native changes require a new build. The separate development profile remains for coding. No App Store/TestFlight delivery is configured. Git pushes and docs-only commits do not publish updates. See [phone instructions](../guides/phone-preview.md), [mobile updates](../guides/mobile-updates.md) and [release evidence](../archive/releases/2026-10-11.md#update-enabled-preview-and-authentication-plan). Session expiry/Face ID remain a [plan](session-expiry-and-face-id.md).

The owner reports installing the preview after deleting the prior app and seeing saved data without another sign-in. This supports reported installation/restored visible data, consistent with same-device Keychain behavior; it is not full acceptance. Dated [UX](flow-simplification.md), [security](security.md), [release](../archive/README.md) and [audit](../archive/audits/code-quality-2026-10-10.md) records retain their original checkpoints rather than claiming every historical SHA is current.

## Known limitations

- Full Mac-off cold launch, comprehensive saved-data/layout acceptance, actual VoiceOver, a real enrolled Sunday dispatch and live coaching quality remain unverified. Mocks, simulator fixtures, offline exports and IPA inspection cover their stated scope only.
- Earlier large-text header/navigation overlap was followed by 1.3× brand/tab scaling and synthetic 320-point/accessibility-large rendering checks. Page content still scales. This is not complete device/text-size accessibility coverage; large picker typography can still wrap. [Branding checks](../archive/verification/2026-10-10/branding/README.md).
- `braces` and `node-forge` retain unresolved mobile-tooling advisories with exact reviewed CI exceptions expiring November 9, 2026. [Dependency assessment](../archive/audits/publication-safety-2026-10-09.md#dependency-triage).
- Supabase's default Auth email sender is restricted; public signup requires appropriate email delivery. [Official SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp). Hosted delivery settings were not changed/reverified for this docs task.
- Actual hosted proxy/client-IP topology and independent semantic model resistance are not established by source tests. [Security limits](security.md#verification-and-residual-limits).
- Historical Actions logs/artifacts and the confidential vulnerability-reporting channel still need public-release review. Private-source CI is not blanket publication clearance. [Security policy](../../SECURITY.md).
- Wearable/Apple Health integration, app-store distribution and broad medical/coaching validation remain future aspirations. Removed retired comparison harnesses remain in Git; no paid evaluation is assigned. [Development-check scope](../guides/development.md).
