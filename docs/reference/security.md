# Security implementation and status

The owner approved bounded security hardening on October 10, 2026, starting from `ccbd00d` on `main`. Work is on `codex/security-hardening`. This is source preparation, not a production deployment or authority to apply hosted policy.

## Scope and decisions

Keep the current Sol 6.1 low setting, one accounted document request, flexible athlete programming, consent, server-owned identity/acceptance and all saved/legacy readers. Separate server instructions from athlete data; add explicit bounded non-plan outcomes; close pre-auth request gaps and enforce durable account fairness through the existing ledger. No classifier, keyword blacklist, tools, additional AI stage or generic policy framework.

The document planner now sends the five faithful answers, minimal body profile, revision and progress context as lower-priority serialized input. Server-owned coaching/display instructions and a concise shared trust boundary are separate. Reachable legacy planning and food paths receive the same boundary; legacy onboarding already separates instructions from serialized input and retains its existing explicit scope and untrusted-data rules within its bounded request size. User text is never promoted to a system/developer role. No credentials, account IDs or new profile fields are introduced.

## Verification and remaining work

Batches 1–2 are implemented. The provider uses `document_result_v1`, containing either a complete plan or a bounded `out_of_scope`/`unable` code. Saved documents remain `document-week-v4`; old saved readers are unchanged. Provider refusals, incomplete responses and invalid structure stay distinct. App-owned copy invites correction; no arbitrary decline prose is displayed. Isolated persistence checks cover settlement, explicit retries, free acceptance/reopen and preservation of drafts/accepted history. Request/account fairness and final verification remain in progress. Mock tests prove request wiring and code behavior only. They do not establish live model resistance, fitness relevance or clinical safety. A structurally valid model answer may still be inappropriate.

## Sources

The [OpenAI Responses guide](https://developers.openai.com/api/docs/guides/migrate-to-responses) documents separate instructions and input. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) distinguish schema output from refusals and incomplete responses. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) informs private owner policies and restricted functions. The [Supabase changelog](https://supabase.com/changelog) was checked; no change to existing Auth API usage is assigned.

## Release boundary

No deployment, hosted migration, credential/trust change, resource creation, native build, owner-data reset, paid evaluation or owner-plan regeneration is authorized. Existing production and scheduler settings remain unchanged. Preserve the single $7 lifetime / $0.25 evaluation ledger and all settled/uncertain charges. Temporary test processes must stop after verification.
