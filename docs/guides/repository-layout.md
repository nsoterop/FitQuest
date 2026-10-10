# Repository layout

The repository has four main areas: the mobile app, the API, database tooling, and documentation. Root files contain project policy, licensing and shared verification tooling.

```text
mobile/
  App.tsx, index.ts       App entry points
  src/
    features/
      account/           Sign-in, account/profile, sessions
      onboarding/        Five-question intake and recoverable answers
      training/          Today/Week, plan acceptance, workout presentation
      weekly-planning/   Upcoming week recovery and Sunday scheduling status
      journal/           Actual workout records and drafts
      nutrition/         Diary, targets, meals and recipes
      weight/            Dated weight records and drafts
      progress/          Progress destination composing existing weight tools
    components/          Shared visual layout and keyboard/scroll components
    services/            Cross-feature backend health check
  tests/                 Mobile unit and mocked component regressions
  assets/                Branding and licensed local UI-icon artwork

backend/
  src/
    app.ts, server.ts    Routes, dependency wiring and runtime entry point
    features/
      account/           Verified identity and profile persistence
      onboarding/        Intake, saved summaries and legacy conversations
      planning/          Plan generation, validation, revisions and persistence
      weekly-planning/   Actual-history context and Sunday scheduling
      nutrition/         Food interpretation, diary and library persistence
      journal/           Actual workout persistence
      weight/            Dated measurement persistence
    ai/                  Provider transport, wire schema and diagnostics
    shared/              Pure contracts imported by API and mobile
    tests/
      unit/              Unit and request-shape regressions
      integration/       Isolated database suite entry point
      fixtures/          Synthetic fixtures and persistence scenarios
    evaluation/          Separately authorized evaluation support; never runtime
  fixtures/              Synthetic JSON replay data, outside compiled output
  scripts/               Explicit manual diagnostic/evaluation entry points
  catalog/, certs/       Required runtime assets

database/
  migrations/            Immutable historical/forward database migrations
  setup/                 Guarded fresh installer, checkpoint and installation tests
  package.json           Independent database-tooling dependency and commands

docs/
  README.md              Navigation for all documentation
  guides/                Current development, release and phone-testing instructions
  reference/             Architecture/diagnostics, retained goals and dated implementation context
  archive/
    README.md            Historical evidence index
    releases/            Dated release records with exact delivery evidence
    audits/              Dated privacy/dependency and code-quality evidence
    verification/        Dated native checks with their synthetic screenshots

scripts/                 Repository-wide checks and disposable database runner
.github/workflows/       GitHub Actions verification
```

Keep a feature's screens, API client, local transformations and draft storage together. Put a component in `components` only when it serves multiple features. Use direct imports; avoid an extra barrel-export layer that hides dependencies. Backend runtime modules must not import tests or evaluation support. Shared contracts must not depend on either platform's runtime.

Database schema history and installation tools belong in `database/`. Runtime queries remain beside their backend features, which own authorization and transactions. This directory boundary does not create a separate network service. Database tooling has its own locked dependencies and is outside the backend Docker context.

Tests live together rather than between application files. Backend tests remain under `src/tests` so their compiled paths mirror the server graph in `dist-test`; the production compiler starts only from `server.ts` and excludes them. Raw JSON fixtures are read explicitly from `backend/fixtures`. Mobile tests live outside `src` in `mobile/tests`.

## Removed during organization

- Superseded tracked HTML/CSS/JavaScript design prototypes and generated preview images under `docs/design`. Implemented UI is in mobile source; selected native evidence remains in the archive.
- Duplicate backend/mobile release histories and obsolete agent/product instruction snapshots. The single retained release record and Git history preserve provenance without competing instructions.
- The four format/preference comparison scripts/tests and their two guides. These completed experiments target a retired request shape; current regressions cover the active planner. Their private results, baseline and accounting were preserved.

These files remain recoverable from commit `a297e2d` and earlier. No applied migration, runtime legacy reader, active regression, provider/accounting record or private artifact was removed. Ignored owner-created local design exploration remains untouched and is not part of the source layout. Build outputs, dependencies and local configuration are generated/ignored, not source files to organize or publish.
