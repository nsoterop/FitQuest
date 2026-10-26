# FitQuest

FitQuest is an iOS-focused training and nutrition app for adults. It turns five written intake answers into a weekly plan, keeps prescribed work separate from actual workout results, and brings food, weight and training history together for the next week.

The [October 26 workout-logging and table corrections](docs/archive/releases/2026-10-26.md#table-layout-and-synced-weight-units) are delivered from `33423d1` with passing CI, the existing API Live and a compatible preview OTA for [installed build 5](docs/guides/phone-preview.md). Logging has compact Set / Weight / Reps tables, editable blue recommendations, short prescription lines and inline warmup/activity instructions. Account → Weight units saves a single preference across devices. Finish records visible values; per-set confirmation, unit toggles, Done and restore-set buttons are removed. The approved additive preference migration preserves existing plans, records and spending; no native build or reinstall is needed. Physical-phone OTA launch remains owner acceptance. Other feature work is frozen and account-limit policy remains disabled.

## What it does

Build 5 enables deliberate [compatible OTA updates](docs/guides/mobile-updates.md). [Seven-day expiry and optional Face ID/passkey sign-in](docs/reference/session-expiry-and-face-id.md) are planned; authentication behavior is unchanged.

Week, Today and workout details show **Finished** for an acknowledged finished/completed saved occurrence at the exact account/plan/revision/session. Finish records the visible scalar values; blank/removed sets remain unlogged and ranges need an explicit number or clearing. Reopening/correction remains available.

- **Plan and review:** five progressive intake questions, a complete Monday–Sunday plan with multiple sessions, rest and optional work, explicit revisions, and an overview before acceptance. Accepting or reopening a saved plan makes no AI call.
- **Train and record:** Today and Week views, readable workout instructions, actual sets/reps/weight or completion, notes, corrections and workout history. Logging does not imply that every prescription was completed.
- **Track nutrition:** a today-first food diary with manual entry or explicitly requested AI estimates, reviewed candidates, known/unknown nutrient values and logged past-day averages. Past days remain editable. Saved meals and versioned recipes support fractional servings; later edits preserve earlier diary entries.
- **Record progress:** a separate Progress destination for dated weight logging, history and corrections. Measurements do not overwrite profile weight or accepted targets.
- **Continue across weeks:** explicit recurring permission covers profile/intake, workout/weight history and health notes shared with OpenAI. After plan acceptance, Sunday 9 PM planning enrolls automatically in the saved timezone; generated drafts still require **Use this plan**. Withdrawal stops future dispatch. Accepted weeks and nutrition targets apply by date.

Logging, meal-library arithmetic and saved-plan acceptance are deterministic. Generation, explicit revisions and AI food interpretation use the same permanent spending ledger. A failed or uncertain paid request is not automatically retried.

## Screens

Historical native captures from October 9, 2026, using synthetic fixtures. They illustrate implemented flows, not real athlete data, a fresh phone test or today's exact navigation. Expo's blue gear is a development overlay.

| Saved week | Food diary |
| --- | --- |
| <img src="docs/archive/verification/2026-10-09/account-training-ui/week.png" width="270" alt="Synthetic saved week with separate strength and optional evening sessions"> | <img src="docs/archive/verification/2026-10-09/food-diary/diary.png" width="270" alt="Synthetic food diary showing known nutrient subtotals and unknown values"> |

[Screen provenance and limitations](docs/reference/screenshots.md).

## Architecture

| Layer | Responsibility |
| --- | --- |
| `mobile/` | React Native 0.86, React 19, Expo SDK 57 and TypeScript; account-scoped UI and recoverable SecureStore drafts. |
| `backend/` | Fastify 5 on Node 24; verified Supabase sessions, application authorization, validation, AI dispatch/accounting and the production scheduler. |
| Supabase | Email/password Auth and PostgreSQL. Private application tables are accessed through the API using the restricted database role and owner-scoped transactions. |
| `backend/src/shared/` | Ten platform-neutral modules consumed by both API and mobile, kept inside the existing Docker build context. |
| `database/` | Immutable migrations and independently installed, guarded fresh-setup tooling. |
| `.github/workflows/` | Formatting, lint, types, isolated PostgreSQL/mobile regressions, packaging, dependency triage and full-history secret scanning. |

A single model request saves a complete document plan; a small display contract keeps flexible exercise instructions without a mandatory catalog. The server withholds workout details until acceptance. Legacy saved formats remain readable. This avoids a second paid extraction step, while leaving coaching quality dependent on the model output.

Sunday scheduling runs inside the existing production API process rather than a separate job service. Durable attempts and date-aware recovery prevent duplicate requests, but service downtime can delay generation. See [architecture and operational limits](docs/reference/architecture.md).

## Develop and verify

Use Node **24.21.0** (`.nvmrc`), npm, and PostgreSQL server/client tools on macOS or Linux. From the repository root:

```sh
npm ci --ignore-scripts
npm ci --prefix backend --ignore-scripts
npm ci --prefix database --ignore-scripts
npm ci --prefix mobile --ignore-scripts
npm run check
npm run check:database
npm run check --prefix mobile
npm run audit:dependencies
```

These checks use mocks and a disposable local database, without production credentials or paid AI. `check:database` refuses an occupied test port and stops its own cluster. Without it, the ordinary test command skips database suites. See [development checks](docs/guides/development.md) for details.

To run the application, follow [API configuration and fresh setup](backend/README.md) and [mobile setup](mobile/README.md). Environment examples contain placeholders; no hosted access or AI allowance is provisioned automatically. Keep owner-managed servers separate from temporary tests.

## Status and limits

The October 10 standalone-preview checkpoint passed 160 mobile tests, types/Expo compatibility, formatting/lint, repository packaging/publication checks and full CI including isolated PostgreSQL. See [exact-source CI](https://github.com/nsoterop/FitQuest/actions/runs/38087183717) and [dated release evidence](docs/archive/releases/2026-10-10.md#main-integration-and-standalone-personal-preview). Mocked tests, synthetic native checks and artifact inspection establish their stated scope, not coaching quality.

Two upstream mobile-tooling advisories remain: `braces` and `node-forge`. CI permits only their reviewed ranges through November 9, 2026; these are exceptions, not fixes. Affected-node counts differ by dated dependency checkpoint. See [security guidance](SECURITY.md) and [dependency evidence](docs/archive/audits/publication-safety-2026-10-09.md#dependency-triage).

The owner reports installing the standalone preview and seeing prior saved data without another sign-in. Full Mac-off cold launch, comprehensive saved-data/layout acceptance, VoiceOver, a real Sunday dispatch and live coaching quality remain unverified. Earlier header/tab text overlap was followed by tested 1.3× brand/tab scaling at 320 points and accessibility-large text; that does not establish complete accessibility coverage. Public signup needs suitable email delivery. Historical Actions logs/artifacts and a confidential vulnerability-reporting channel still need review; scoped source publication is not exhaustive security clearance. See [known limitations](docs/reference/architecture.md#known-limitations).

[Documentation index](docs/README.md) · [Repository layout](docs/guides/repository-layout.md) · [Contributing](CONTRIBUTING.md) · [Current agent rules](AGENTS.md) · [Historical release evidence](docs/archive/README.md)

## License

FitQuest project code is available under the [MIT License](LICENSE), copyright 2026 nsoterop. Existing [Expo attribution](mobile/LICENSE) and other dependency notices retain their original terms; see [third-party notices](THIRD_PARTY_NOTICES.md).
