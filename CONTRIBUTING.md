# Contributing

FitQuest is currently a private repository undergoing cleanup; feature work is paused. Agree scope with the maintainer before starting a feature or infrastructure change. Use [Issues](https://github.com/nsoterop/FitQuest/issues) for ordinary, sanitized bug reports and scope discussion. Include reproducible steps, expected/actual behavior and a code checkpoint; use synthetic data. Follow [security reporting](SECURITY.md) for sensitive findings.

Use Node 24.21.0 and the three locked dependency installs in [the README](README.md#develop-and-verify). Run [development checks](docs/development-checks.md), including disposable PostgreSQL checks for persistence work. Keep formatting commits separate from logic, preserve shared-contract boundaries and add meaningful regression coverage when behavior changes. Do not use production credentials or paid AI as a routine test dependency.

Keep contributions focused. PR descriptions should explain the problem, final behavior, verification and remaining limits. Do not include keys, real health records, account identifiers, private evaluation output or local environment files. Preserve third-party notices and the [MIT license](LICENSE). Do not replay historical resets or alter permanent accounting.

Only start temporary servers when testing requires them; stop your own processes afterward and leave someone else's server alone. Native builds, hosted changes, paid resources and public publication need their applicable owner authorization.

## Proposed protection settings

These are recommendations for the owner, not settings applied by this cleanup:

- Require the `quality` and `secrets` jobs from the **Checks** workflow before merging to `main`, with the branch up to date.
- Require PRs and resolved review conversations; add one approving review when an independent reviewer is available. Avoid a mandatory review rule that makes the sole maintainer unable to merge.
- Block force pushes and branch deletion. Keep workflow tokens read-only and privileged secrets out of PR checks.

GitHub currently reports that protection for this private repository requires a plan upgrade or public visibility. Neither change is authorized here. The owner must separately decide PR merge/public visibility and available protection controls. Do not change the default branch or merge automatically.
