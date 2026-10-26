# Release procedure and boundaries

The [October 26 loading and recommendation correction](../archive/releases/2026-10-26.md#saved-progress-loading-and-explicit-dose-fallback) is delivered from mobile source `7bc2430`: exact-source CI passed and preview OTA group `659026e7-7168-4c15-b41a-a67a8572543a` matches build 5. The existing API stays Live at `33423d1`; the previously approved account-unit migration remains applied. No new migration/backend deploy/native build was required. [Phone instructions](phone-preview.md) distinguish publication from owner acceptance. Existing plans/records, accounting and production channel are preserved. Follow the owner's current assignment and [agent rules](../../AGENTS.md); historical releases do not grant further build, OTA, migration or reset authority.

## Source publication

1. Check the working tree, actual remote/default branch, divergence, protection requirements and existing matching PRs. Preserve other writers' changes and Git history. Use a normal fast-forward/integration under the owner's publication authority; no force-push or protection/visibility change.
2. Inspect the actual linked service branch, Auto-Deploy, previews, Blueprint file/branch/auto-sync and EAS GitHub/workflow triggers. Do not infer safety from a branch name. The last verified source-only main push changed no Blueprint YAML; Render Auto-Deploy was disabled and EAS had no GitHub connection. Recheck when publishing, without changing settings to get past a blocker.
3. Run proportionate [development checks](development.md), inspect the diff and keep keys/private records/logs out of source and PRs. Reuse a matching PR if one is required; attach any created PR. Verify the pushed exact commit's CI and distinguish source publication from application delivery.

## Application delivery when assigned

Compare the target backend/database graph with the actual Live revision. If unchanged, do not redeploy merely to match a newer documentation/mobile commit. Engineering handles assigned routine application delivery after checks and compatibility review; the docs-only scope is not a new blanket no-deploy or HQ-review gate. A hosted migration, setting/policy change, credential/trust/signing change, new resource/billing or native build needs its applicable owner authority.

For an authorized backend release, verify required hosted schema/grants and migration history before deploying the exact tested source to the existing service. The already-applied security-account-policy, recurring-enrollment and birthday migrations are recorded in the archive, including differing hosted version identifiers. Do not replay them, push the entire migration directory, or use the [fresh installer](../../database/setup/README.md) on an existing database. A healthy `/health` alone does not prove authenticated schema compatibility. Verify runtime identity, health, auth/no-store and appropriate read-only saved-work behavior without paid regeneration or real-data resets.

For mobile delivery, distinguish development JavaScript served by owner Metro from embedded preview JavaScript/assets. A Git push does not update an installed preview. Build 5 is configured for compatible preview EAS Update; [OTA publication](mobile-updates.md) requires deliberate release and runtime verification. Future authorized preview builds must check current source/CI, hosted public client settings and included allowance; preserve app/keychain identity, signing and registered devices; inspect the successful artifact and give a verified install link. The completed one-build approval is not standing authority for another build. Use [phone instructions](phone-preview.md) for the existing build.

## Preservation and rollback

Preserve all saved records, recoverable drafts, source snapshots, receipts, enrollment/consent and settled/uncertain accounting. Real-user test resets are prohibited under the owner's ongoing clarification; use isolated fixtures/read-only checks. Explicit product deletions and established retention policies remain separate. Keep account-policy enforcement disabled by owner choice and the same $7 lifetime/$0.25 evaluation caps; do not silently activate quotas or buy retries.

Coordinate in-flight provider work if an assigned change affects response contracts. A rollback restores compatible application artifacts, retaining forward schema and all financial liabilities; never delete schema, rewrite migration history or reset spending. Do not switch runtimes blindly while a new-format request is in flight. Stop only agent-owned test processes and preserve owner Metro.

## Evidence and remaining limits

Report source/CI, actual backend revision, mobile build/source and owner phone observations separately. The owner reports installing the standalone preview and seeing saved data without another sign-in. Full Mac-off cold launch, comprehensive saved-data/layout acceptance, VoiceOver, actual Sunday dispatch and live coaching quality remain unverified. Historical simulator fixtures and artifact checks establish their stated scope only.

Public-release readiness is separate from private publication. The historical Actions log/artifact review and confidential vulnerability-reporting channel remain outstanding; reviewed dependency limitations remain in [SECURITY.md](../../SECURITY.md). No repository visibility or reporting setting is changed by this guide.
