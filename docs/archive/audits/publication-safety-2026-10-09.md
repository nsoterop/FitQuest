# Publication-safety cleanup — batch 1

This is a private repository preparation checkpoint, not a deployment or public-release clearance. Feature work remains paused. No hosted data, migration, scheduler setting, secret, spending ledger, default branch or repository visibility was changed. The existing release remains live.

## Secrets and artifacts

Gitleaks **8.30.1**, downloaded from its official GitHub release and checked against its published SHA-256 checksum, scanned all **101 fetched reachable commits** with `git --log-opts='--all --full-history' --redact=100`. Its six candidates were reviewed in context: five database-role/SQL identifier matches and one synthetic fixture marker. No confirmed credential was found. The final tracked and non-ignored untracked working-file snapshot has no findings. No scanner allowlist was added to hide these candidates.

Reports stay in the ignored `.private-audit/` directory (0700; report files 0600). Source code and screenshots were not uploaded to an external scanner. Scan scope excludes installed dependencies, generated output, intentionally ignored local environment/credential files and private evaluation data. Git scanning does not cover unfetched/unreachable objects, reflogs, external systems or image pixels; detection is not a guarantee that no secret exists.

All **142 tracked images** were reviewed in contact sheets and with local macOS Vision OCR (142 successes). Screens show synthetic Alex Example/Alex Taylor profiles, example-domain email addresses, mock workouts/food/weight data and generic artwork. Source fixtures, design data and documentation were checked for identity/credential patterns and fixture provenance; no real personal record was identified in intended publication content. Preexisting untracked design exploration and `.DS_Store` remain on disk and are ignored, not included in this publication. Their exclusion is not an audit clearance. All **1,390 private evaluation artifacts** match the preexisting preservation snapshot.

Root ignore rules cover environment variants across packages, common credential files, private evaluations/audits, local databases and generated output while retaining placeholder examples and reviewed assets. Examples now use placeholder service endpoints. Documentation replaces local machine paths, LAN addresses and unnecessary hosted resource identifiers; historical commits remain unchanged and contain the old operational identifiers. Commit provenance and verification counts remain. Editing current files does not remove prior history.

Journal copy now says saving makes no AI request and that explicit future-planning permission can share notes, including health feedback, with OpenAI. Consent enforcement and saving behavior are unchanged.

## Dependency triage

The initial mobile audit reported 23 affected dependency nodes (16 high, 7 moderate), arising from three root advisories. Backend audit reported zero.

| Root advisory | Reachability and action |
| --- | --- |
| [uuid — GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Patched to **11.1.1** with an override scoped to `xcode`. That build tool uses CommonJS `uuid.v4()` without an output buffer. Its generated project-ID format was verified with 100 IDs. Expo/RN/native dependencies are unchanged. All seven propagated moderate findings are gone. |
| [braces — GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Registry and advisory show **3.0.3**, with no published patch. Used by glob/build tooling, not imported by application code. Treat repository patterns/configuration as trusted input; do not run builds against untrusted pattern input. This mitigates exposure but does not fix the vulnerable dependency. |
| [node-forge — GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Registry and advisory show **1.4.0**, with no published patch. Present through Expo code-signing/development tooling; not used by application authentication or the backend. Do not rely on affected verification for untrusted signing material; keep build/signing inputs controlled. No signing configuration was changed. |

The final mobile audit retains **16 high affected nodes from the two unpatched root advisories**; zero moderate/critical. These are not 16 independently demonstrated app exploits. None of the three packages appeared in the previously verified matching iOS JavaScript source map. This supports JavaScript reachability assessment, not a native binary security audit. No forced audit fix, Expo downgrade, native build or security bypass was used. These unresolved upstream advisories remain an explicit limitation.

## Safe installation and verification

[Fresh database setup](../../../backend/setup/README.md) substitutes a non-destructive profile baseline for the historical one-time account reset, then applies 19 unchanged forward migrations from a checksum-verified checkpoint. It refuses existing app schemas/checkpoint versions and never clears Auth, Storage or migration history. New installations retain the original disabled initial budget row; existing spending ledgers cannot enter this fresh-install path. No applied migration was edited.

The isolated PostgreSQL test proves managed synthetic records/policies survive, mid-install failures roll back schema/role/ledger changes, existing installations refuse reruns, and the complete schema dump (including policies/functions/grants) matches the historical migration path. Hosted authentication and production migration reconciliation were not exercised.

Validation: **301 existing backend tests + 5 fresh-install checks**, all passing without skips; **128 mobile tests**, backend/mobile TypeScript, Expo dependency compatibility check, **3 publication-safety tests**, and `git diff --check`. Tests cover existing consent, journal, schedule and persistence behavior. No additional native interaction test was needed for the static journal-copy correction; physical-phone acceptance was not performed. No Expo server was started. The temporary PostgreSQL process was stopped; owner-managed Metro was left alone.

Reproduce: `node --test scripts/publication-safety.test.mjs`; `npm run check --prefix mobile`; and, against the documented disposable loopback cluster, `FITQUEST_TEST_DATABASE_URL=postgresql://fitquest_test@127.0.0.1:55432/postgres npm test --prefix backend`. Never use a hosted or ordinary development database for that test command.

## Publication boundary

GitHub was freshly verified private with `main` as its default. Render's actual dashboard showed the release branch `codex/reset-backend-connectivity`, automatic deployment disabled after a specific-commit deployment, and the existing live application `2e779e5`. Cleanup publication uses the separate **`codex/publication-safety`** branch, without opening a deployment-triggering PR, deploying, changing settings or resetting training data. The commit and verified remote state are reported in the task handoff. Batches 2 and 3 are not included.
