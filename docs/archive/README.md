# Historical evidence

Everything here is dated evidence, not current setup instructions, an active work queue or authorization to deploy/reset/spend. Use the [documentation index](../README.md) for current guidance.

## Releases and audits

- [October 10 releases](releases/2026-10-10.md): initial security/UX rollout, birthday backend `1859ef8`, mobile corrections, main integration and finished standalone preview build 3. Each section retains its own source/CI and delivery scope; account policy remains disabled.
- [October 3–9 release record](releases/2026-10-09.md): accumulated earlier application releases, runtime verification and evidence boundaries. Its final production checkpoint was `2e779e5`.
- [Publication safety, October 9](audits/publication-safety-2026-10-09.md): privacy/secret scan scope, dependency findings and safe-install verification.
- [Code quality, October 10](audits/code-quality-2026-10-10.md): build boundaries, tooling and CI results.

## Native verification — October 9, 2026

| Feature | Record |
| --- | --- |
| Account, intake and training UI | [Account/training](verification/2026-10-09/account-training-ui/README.md) |
| Training navigation and keyboard | [Usability corrections](verification/2026-10-09/training-usability/README.md) |
| Workout presentation | [Display corrections](verification/2026-10-09/workout-display/README.md) |
| Food diary and trends | [Food diary](verification/2026-10-09/food-diary/README.md) |
| Saved meals and recipes | [Food library](verification/2026-10-09/food-library/README.md) |
| Plan-derived nutrition | [Nutrition targets](verification/2026-10-09/nutrition-targets/README.md) |
| Actual workouts and notes | [Workout journal](verification/2026-10-09/workout-journal/README.md) |
| Dated measurements | [Body weight](verification/2026-10-09/body-weight/README.md) |
| Progress-informed planning | [Next week](verification/2026-10-09/next-week/README.md) |
| Enrollment and pause | [Sunday scheduling](verification/2026-10-09/sunday-scheduling/README.md) |

## Native verification — October 10, 2026

- [Branding and controls](verification/2026-10-10/branding/README.md): normal/large-text synthetic rendering, followed by the transparent-header correction. Native IPA checks are in the release record.
- [Nutrition repeat visits](verification/2026-10-10/nutrition-cache/README.md): cached data visible during delayed background refresh; in-memory/account-isolation limits.

## Native verification — October 11, 2026

- [Saved workout completion](verification/2026-10-11/workout-completion/README.md): explicit saved outcomes, exact source/account matching, Today/Week badges and synthetic normal-size native captures; matched delivery pending.
- [Flow-simplification checkpoint](../reference/flow-simplification.md): dated mock/native evidence and links to its captures.

These captures use synthetic fixtures. Their checks and limitations apply to the recorded checkpoint and were not rerun merely because files were moved. Some local temporary evidence paths in old records may no longer exist. Duplicate records and superseded design/instruction documents are available in Git at `a297e2d`; they are intentionally absent from the working tree.
