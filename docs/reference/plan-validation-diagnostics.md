# Complete-week validation diagnostics

Applicable application validation failures retain one private, sanitized record per attempt in `fitquest.plan_validation_diagnostics`. A retry gets a new attempt and never overwrites the preceding diagnostic. Provider HTTP failures/refusals/incomplete responses remain distinct and use existing `onboarding_attempts.provider_diagnostic`; successful HTTP 200 does not imply the application accepted the plan.

Current document planning uses bounded shape, overview and size codes; it is not catalog-constrained. Catalog/pair/unit codes and exercise positions apply to legacy complete-plan paths. Document diagnostics record catalog version `not-applicable`. The retained closed stage/rule codes distinguish schema shape, wire pair/unit/recovery conversion, canonical structure, catalog lookup/tracking/equipment/load, size and unchanged-work checks. Positions are zero-based day/session/block/exercise indexes; `recovery: true` identifies active recovery and replaces the exercise index. Valid catalog-ID syntax is retained even for an unknown ID. Invalid IDs and arbitrary validator paths/keys are discarded. Tracking failures retain only whitelisted actual/allowed target kinds. A schema-level failure may identify a container rather than a specific activity.

Records contain the attempt and plan references, database timestamp, deployment SHA (null outside a recognized deployment), catalog version and schema version. Join the attempt to retrieve its existing sanitized provider request ID, HTTP status and model. Intake answers, prompts, responses, complete plans, free-text equipment/health context, headers, credentials and exception bodies are never diagnostic fields. No diagnostic is included in ordinary mobile responses or application logs. Existing failures without a diagnostic remain undiagnosed; do not infer their failing activity from a synthetic reproduction.

## Read-only retrieval

Use an approved administrator SQL session on the existing FitQuest project, after positively identifying the account. Substitute the verified owner UUID in the parameter placeholder; optionally restrict `d.attempt_id` to the receipt's attempt UUID. Do not select prompts, summaries or plan contents.

```sql
SELECT d.attempt_id, d.created_at, d.expires_at,
       d.deployment_sha, d.catalog_version, d.schema_version,
       d.diagnostic,
       a.model,
       a.provider_diagnostic->>'requestId' AS provider_request_id,
       a.provider_diagnostic->>'httpStatus' AS provider_http_status
FROM fitquest.plan_validation_diagnostics d
JOIN fitquest.onboarding_attempts a
  ON a.user_id=d.user_id AND a.id=d.attempt_id
WHERE d.user_id = :verified_user_id
  AND d.expires_at > now()
ORDER BY d.created_at DESC, d.attempt_id DESC
LIMIT 50;
```

The private table has forced RLS with the existing `fitquest_app` owner policy and no grants to PUBLIC, anon, authenticated or service_role. There is no new diagnostic API. Provider request IDs follow the existing sanitizer and [OpenAI's debugging reference](https://developers.openai.com/api/reference/overview#debugging-requests).

## Retention and failure handling

Each row is at most 1 KiB of diagnostic JSON, and the writer retains at most the newest **50 failures per account**, with a **14-day expiry**. Every diagnostic write prunes that account's expired rows and oldest excess rows in the same transaction. Retrieval excludes expired records. Physical removal is opportunistic: an inactive account's expired rows remain until its next diagnostic write, an explicit user-requested product deletion or separately authorized maintenance. There is no cron or background cleanup service.

For physical cleanup of expired records in an approved account scope:

```sql
DELETE FROM fitquest.plan_validation_diagnostics
WHERE user_id = :verified_user_id AND expires_at <= now();
```

The owner revoked all standing owner-only test-reset authority on October 10, 2026; do not delete real plans or diagnostics to test, regenerate or verify them. Use isolated fixtures or read-only retrieval. Existing diagnostic retention is unchanged, and an explicit user-requested product deletion of a plan still cascades to its diagnostics. Neither retention nor an authorized product deletion deletes the independent attempt, provider metadata, settled/uncertain charges, reservations or budget. Diagnostics do not belong to the permanent spending ledger.

Settlement occurs before application validation. Diagnostic writes run separately, with a two-second statement timeout and one-second lock timeout; all diagnostic failures roll back and are swallowed without logging private errors. Connection acquisition uses the existing bounded pool timeout. Diagnostic failure does not replace the original validation code, modify a saved usable plan, cause another dispatch or interfere with settlement. Missing diagnostics can therefore mean pre-release data or a best-effort storage failure; absence is not evidence that validation passed.

## Verification

`npm run check` runs unit/provider/service and mobile checks. `npm run check:database` is required for full persistence verification: it creates an isolated disposable loopback cluster, exercises real RLS/account isolation, retry retention, bounded cleanup and a diagnostic-insert failure independently of plan preservation and settlement, then stops and removes its own cluster on success or failure. An occupied test port is a hard stop; do not use a hosted or ordinary development database. See [development checks](../guides/development.md).
