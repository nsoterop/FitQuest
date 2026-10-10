# Flow simplification — October 10, 2026

The owner authorized four focused UX batches on `codex/flow-simplification`, based on security checkpoint `b1662e4` (draft PR #1). Security protections and accounting remain prerequisites. This record is separate from the completed security batches.

| UX batch | Work | Status |
| --- | --- | --- |
| 1 | Continue the requested initial generation after confirmed sharing permission; preserve uncertainty, revisions and one-dispatch behavior | Implemented; six focused intent/uncertainty/account tests and mobile types passed |
| 2 | Explicit recurring/history disclosure and automatic Sunday 9 PM enrollment after acceptance, using the existing scheduler; withdrawal in account settings | Implemented; 334 backend/five installer tests, 136 mobile tests and types passed locally |
| 3 | Today-first diary, independent saved draft dates, editable past days and nutrient-specific logged-intake averages | Pending |
| 4 | Separate Progress destination for existing weight logging/history; simpler weekly nutrition charts | Pending |

Progress can host future sections based on actual workout journals. Performance analytics, new metrics, generic chart frameworks and placeholder trends are not assigned. Existing journal records and source references stay intact.

The new recurring agreement atomically records profile/intake and workout/weight permission with both expected revisions. Legacy permissions remain readable and retain their original scope; existing explicit scheduler enrollment remains compatible. New enrollment requires the recurring version and accepted document history. Its provenance flag allows consent withdrawal/regrant to stop/resume consent-managed schedules while preserving explicit legacy pauses. Acceptance alone never re-enables a paused row. Acceptance after the Sunday trigger waits for the next trigger; existing target weeks and failure fences still win. The scoped forward migration is `20261010154615_recurring_consent_enrollment.sql`, generated with the CLI and authored locally; it has not been applied remotely.

Ordinary next-week/enable controls are removed. The narrow recovery entry appears only for existing secure next-week input; it reads saved attempts before sending the same operation and never discards unknown input. Sharing permission lives in Account, and changing it there never generates an immediate plan.

No deployment, hosted migration or policy activation, credential/trust change, new resource, native build, data reset or paid AI test is authorized. The live service/scheduler remain unchanged. Verification uses mocks, owned disposable PostgreSQL and synthetic simulator fixtures; these do not prove live model quality, scheduled operation or physical-phone acceptance.
