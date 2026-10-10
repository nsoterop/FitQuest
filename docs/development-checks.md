# Development checks

Use Node **24.21.0** (`.nvmrc`), npm and PostgreSQL server/client tools on macOS or Linux. Production remains on its existing hosted release; these commands do not deploy or use production credentials.

From a fresh checkout:

```sh
npm ci --ignore-scripts
npm ci --prefix backend --ignore-scripts
npm ci --prefix mobile --ignore-scripts
npm run check
npm run check:database
npm run check --prefix mobile
npm run audit:dependencies
```

`check` runs formatting, linting, both TypeScript checks, production packaging checks, unit/component tests and repository-safety tests. Without `FITQUEST_TEST_DATABASE_URL`, the two PostgreSQL suites explicitly skip. **`check:database` is required for full verification and CI always runs it.** It creates a disposable loopback cluster on 55432, runs the full backend suite with no database skips, and stops/removes only its own cluster even if tests fail. An occupied port is a hard stop. PostgreSQL tools are discovered through `pg_config --bindir`; set `FITQUEST_PG_BIN` if your installation keeps them elsewhere. No Docker or production environment file is needed. Do not point the tests at existing application databases.

`npm run format` applies pinned Prettier formatting. `npm run format:check` and `npm run lint` enforce formatting plus practical TypeScript and React hook rules; production explicit `any` is rejected. SQL migrations, private evaluations, historical documents and design assets are excluded from automatic formatting. Keep formatting-only commits separate from logic changes. Git ignores private artifacts but cannot protect a deliberate `git add -f`.

Backend `npm run build` cleans and compiles the production graph rooted at `src/server.ts` into `dist`. It excludes tests, fixtures and paid evaluation tools. `npm run build:test` produces a separate `dist-test` graph. The Docker runtime still starts `dist/server.js`; its context and hosting configuration are unchanged. The platform-neutral contracts live in [backend/src/shared](../backend/src/shared/README.md), with no server/native dependencies. Tests enforce both the production artifact and shared-import boundaries. If testing on a phone, the owner must restart their existing Metro after this configuration change; agents must not replace an owner-managed server.

GitHub Actions runs on pushes and pull requests with read-only repository permission, immutable action revisions, locked npm dependencies and no application secrets. It runs the complete disposable PostgreSQL suite, mobile tests/Expo compatibility, formatting/lint/types/packaging, dependency triage, and checksum-pinned Gitleaks across all fetched history. It does not build a native app, call paid AI, deploy, or change branch protections. No `pull_request_target` workflow executes untrusted code with privileged credentials.

The dependency gate fails closed on unavailable audit data, new advisories, changed affected ranges and expired exceptions. Only the two unpatched mobile tooling advisories from [batch 1](publication-safety-2026-10-09.md) are excepted, through **November 9, 2026**; they remain visible in output. Renewing an exception requires a new reachability/patch review. Gitleaks uses only six exact historical false-positive fingerprints in `.gitleaksignore`; it does not suppress whole secret rules or source directories.

The completed 2026-10-07 format/preference comparison scripts are historical, explicitly authorized evaluation tools, not the active regression suite. Their old request-shape tests require the original planner checkpoint and fail against the later outline-required planner. They are retained for provenance and are not run by `npm test` or CI; this is a preexisting compatibility limitation, not permission to rerun paid evaluations. Active request-format/accounting regressions live in `backend/src/*.test.ts` and use mocks. Evaluation entry points compile into `dist-test`, never the production image.
