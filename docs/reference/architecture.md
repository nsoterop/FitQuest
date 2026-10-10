# Architecture and operational limits

This describes source behavior on the cleanup branch as of October 10, 2026. It is not a deployment runbook or authority to change hosted services.

## Boundaries

The React Native client talks directly to Supabase for Auth and to Fastify for application data. The API verifies the current account/session before private interactive routes. PostgreSQL operations use the restricted application role, private schema and owner-scoped transactions. SecureStore holds native sessions and recoverable drafts; it does not replace server authorization.

Eight platform-neutral modules in `backend/src/shared` define contracts used by both packages. Keeping them inside `backend` preserves the existing Docker context without a separate package publishing step. Mobile's watcher/import boundary includes only those shared modules. TypeScript compiles the server graph to `dist` and the test/evaluation graph to `dist-test`; production packaging excludes fixtures and evaluation entry points.

The main implementation entry points are [API routes](../../backend/src/app.ts), [runtime and scheduler startup](../../backend/src/server.ts), [planning persistence](../../backend/src/features/planning/planningStore.ts), [shared contracts](../../backend/src/shared/README.md), and [mobile navigation](../../mobile/App.tsx).

## Planning and records

Five fixed intake questions preserve the athlete's own goals, activity, equipment, preferences and limitations. Current document planning sends one request for the complete dated week and nutrition. A small display schema preserves separate sessions, optionality, timing and duration ranges; readable workout content remains flexible. It is not a detailed exercise-prescription validator or mandatory exercise-catalog selection flow.

The server owns identity, dates/timezone, revisions and acceptance metadata. It derives an overview from the saved complete document and withholds workout details until acceptance, including reload/API reads. Acceptance/reopen is free; explicit revisions use a new metered request and require acceptance again. Legacy formats remain readable without silent regeneration.

Accepted prescriptions and actual records are separate. Journals retain source snapshots, actual values, blank/unknown values, completion outcomes and notes. Food entries preserve provenance and versioned recipe snapshots. Dated weight history does not overwrite profile weight or accepted nutrition targets. Logging and library arithmetic do not call AI; conversational food interpretation and plan generation do.

Next-week context uses original intake, an accepted baseline and actual history only after explicit OpenAI-sharing permission. It includes up to 64 ending-week journals, up to 16 older matching-name sessions from the preceding 56 days, and up to 14 eligible weight measurements. Recent overflow or an oversized snapshot fails before dispatch; omitted older history is flagged. Matching names do not prove comparable equipment, units or loads. Details and provenance are retained in the [historical implementation record](../archive/verification/2026-10-09/next-week/README.md).

One permanent ledger accounts for every provider dispatch, including uncertain outcomes. Existing lifetime/evaluation caps, reservations and settlement remain independent of resettable training data. No automatic paid retry, repair or hidden second extraction request is used.

## Weekly scheduling

Enrollment is off by default. After an accepted document week and both sharing permissions, the athlete may enable Sunday 9 PM planning in the saved timezone. Enrollment does not immediately generate a plan. Pause prevents future dispatch; work already transmitted may finish.

The production API scans approximately every 60 seconds and at startup. Per-account locks, target-week identity and durable dispatch markers coordinate scheduler/manual requests. An existing target-week draft or accepted plan wins. After downtime, only the latest eligible current/upcoming week is considered; obsolete backlog is skipped. A failure or uncertain dispatch requires explicit retry rather than buying another request automatically.

This reuses the existing service and avoids another job resource, but depends on API uptime. It is not an exact-time or delivery guarantee and sends no notification. The generated draft still needs acceptance. Accepted upcoming work becomes current by date; Sunday is not replaced merely because next week was accepted early. See [dated scheduler evidence](../archive/verification/2026-10-09/sunday-scheduling/README.md).

## Known limitations

- Physical-phone acceptance, a real enrolled Sunday dispatch and live coaching quality were not established by the cleanup checks. Simulator fixtures, component tests and an offline bundle are separate evidence.
- The largest accessibility-only text setting can overlap the shared brand/header and bottom navigation. Full VoiceOver and device/text-size coverage remain incomplete.
- `braces` and `node-forge` have unresolved upstream mobile-tooling advisories, with reviewed CI exceptions expiring November 9, 2026. [Dependency assessment](../archive/audits/publication-safety-2026-10-09.md#dependency-triage).
- Supabase's default Auth email sender is restricted; public signup requires appropriate email delivery. [Official SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp). Existing hosted delivery settings were not changed or reverified for this cleanup.
- Historical paid comparison harnesses targeting a retired planner shape were removed; provenance remains in Git. [Development-check limitation](../guides/development.md).
- No app-store distribution, native rebuild, wearable integration or broad medical/coaching-quality validation is established by this branch.

## Evidence and release state

The October 9 production record identifies application `2e779e5`. Cleanup is published separately on private `codex/publication-safety`; the historical `main` branch is not the current API release source. No cleanup commit implies a deployment. [Release history](../archive/README.md), [publication-safety audit](../archive/audits/publication-safety-2026-10-09.md), and [code-quality checks](../archive/audits/code-quality-2026-10-10.md) preserve their original dates and scope.
