# Database tooling

This package owns FitQuest’s database schema history and fresh-install tooling. Runtime queries, account authorization and transactions remain with their features in `backend/src/features`.

- `migrations/` contains the immutable historical and forward SQL migrations.
- `setup/` contains the guarded installer, frozen checksum manifest, non-destructive profile baseline and installation tests.
- `package.json` and its lockfile provide the installer’s PostgreSQL client independently of the backend package.

From the repository root, run `npm ci --prefix database --ignore-scripts` to install tooling. Follow [fresh installation](setup/README.md) before running `npm run setup:fresh --prefix database`; historical migrations must not be blindly replayed. Existing databases require separately reviewed forward migrations.

For verification, install the repository and backend dependencies too, then run `npm run check:database` from the root. It creates a disposable local PostgreSQL cluster, runs backend persistence and installer checks, and stops the cluster afterward. `npm test --prefix database` skips persistence checks unless the isolated test connection is explicitly provided by that runner.

Moving these files does not change hosted services, database contents or migration checksums. Database tooling is outside the backend Docker build context and is not included in the API runtime image.
