# Security

Do not put credentials, real health records, tokens, exploit details or private logs in an issue, PR or screenshot.

## Reporting

The verified project channel is [GitHub Issues](https://github.com/nsoterop/FitQuest/issues), maintained by [nsoterop](https://github.com/nsoterop). Use it **only for a sanitized request to arrange confidential contact**, without vulnerability details or sensitive attachments. Wait for the maintainer to establish a private channel before sharing the report. A private repository issue is still visible to collaborators and may become public if repository visibility changes.

No dedicated security email or GitHub private-vulnerability-reporting channel was verified during this cleanup. This document does not invent one or promise a response time. Establish a confidential reporting channel before public release; that account-setting decision remains with the owner.

## Current evidence and limits

The October 10 checks use redacted Gitleaks history/file scans and synthetic privacy/account-isolation tests. The standalone preview additionally received scoped upload-archive and compiled-bundle inspection; see [release evidence](docs/archive/releases/2026-10-10.md#main-integration-and-standalone-personal-preview). Those checks do not prove absence of vulnerabilities, cover inaccessible history or constitute a native binary/third-party service audit. Keep ignored secrets and private evaluations out of Git; never force-add them.

Historical cleanup checkpoints recorded root/backend audits without findings and 16 affected mobile dependency nodes; the later security checkpoint recorded 15. Current CI still permits only the same two unresolved root advisories: [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv). The [batch-1 assessment](docs/archive/audits/publication-safety-2026-10-09.md#dependency-triage) documents build/development-tool reachability and controlled-input mitigations. These are unresolved dependencies, not fixed vulnerabilities or 16 demonstrated application exploits.

The dependency gate permits only those exact reviewed mobile advisories/ranges through **November 9, 2026** and fails on new/changed findings, missing audit data or expiry. Recheck patch availability and exposure before renewing any exception. Do not use a forced Expo downgrade or broad severity suppression.

Use the restricted database role, verified TLS and explicit OpenAI-sharing permissions. Preserve the permanent spending ledger and uncertain charges. Deleting/resetting training content does not imply deleting source health records, accounting, provider retention or backups. Real-user deletion/reset for testing remains prohibited; use fixtures or read-only checks. Existing operational data and hosted settings are outside this documentation task. Historical GitHub Actions logs/artifacts and confidentiality of retained screenshots require their own public-release review; private-source CI is not blanket clearance to change visibility.
