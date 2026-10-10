# Security implementation and status

The owner approved bounded security hardening on October 10, 2026, starting from `ccbd00d` on `main`. Work is on `codex/security-hardening`. This is source preparation, not a production deployment or authority to apply hosted policy.

## Batch-2 checkpoint — October 10, 2026

Batch 1 is committed at `f235f2a`; batch 2 is committed at `aa52c56089641ce5f2ac3fdb48898964c300dd70`. The batch-2 review found no implementation defect requiring another source change. At that checkpoint, account-limit work for batch 3 remained uncommitted and excluded from the review/publication. Its subsequent verification is recorded below.

Fresh verification used a disposable archive of the exact batch-2 commit, with existing locked dependencies and no local environment/private files:

| Command | Exact batch-2 result |
| --- | --- |
| `npm run check` | Passed formatting, lint, both TypeScript checks, 172 backend tests, 128 mobile tests and seven repository tests. One backend PostgreSQL suite and one installer suite skipped without a database connection. |
| `npm run check:database` | Passed 305 backend tests and five installer tests; zero failures/skips. The owned disposable PostgreSQL cluster stopped afterward. |
| `npm run check --prefix mobile` | Passed TypeScript, Expo dependency compatibility and all 128 mobile tests. |
| Gitleaks on `ccbd00d..aa52c56` | No findings in the two security commits; this is bounded scanner evidence. |

The first archived-check run failed only because a directory-level dependency symlink made Git's ignore check reject a synthetic `node_modules` path. Correcting the disposable dependency layout, without changing tests or source, allowed the complete check to pass. Local Node was 24.12.0, within the declared range; CI uses the pinned 24.21.0.

Separately, `npm run check` passed on the combined dirty tree: 174 backend tests, 129 mobile tests and seven repository tests, with the same two database skips. That result includes later-batch changes and is not evidence for the exact batch-2 commit or certification of batch 3. All pre-existing tracked edits were byte-identical before this checkpoint edit; all 1,390 private files matched the preserved hash snapshot.

Self-review covered the complete batch-2 diff, provider parsing, shared saved-document contracts, generation/review/scheduler dispatch, transactional completion and mobile feedback handling. The new wire envelope is validated before publication; scope outcomes, provider refusal, incomplete transport and schema failure retain distinct codes. Failed or stale revisions leave usable documents/history and submitted feedback intact; successful revisions require fresh acceptance. Existing tests exercise ownership, withdrawn consent, dates, concurrent/idempotent claims, late settlement, free acceptance/reopen and hidden unaccepted exercise details. Trusted instructions contain no interpolated athlete text. No runtime model/settings change, extra dispatch, paid retry or semantic classifier was added.

Batch-2 publication contained only committed batches 1–2. Render was freshly verified to track `codex/reset-backend-connectivity`, with automatic deployment disabled and PR previews Off; the live source remains `2e779e5`. The only repository workflow is verification-only Checks. [Batch-2 CI](https://github.com/nsoterop/FitQuest/actions/runs/38059697039) passed both quality and full-history secrets jobs for the exact `aa52c56` commit. No PR was opened at this checkpoint.

Live model resistance, independent semantic scope checking, hosted proxy behavior and physical-phone acceptance remain unverified. Mocked responses and local persistence tests do not establish these properties. This checkpoint was recorded after publishing batch 2; it was not part of that source commit.

## Batch-3 checkpoint — October 10, 2026

Batch 3 implements durable ordinary-request counters and account AI allowances through the existing ledger. All runtime reservation callers use the narrow shared helper; the scheduler keeps its existing dispatch/retry fence. The forward migration leaves the new policy inactive. Activation and deployment require separate owner authorization.

Self-review corrected two concurrency details: delayed requests cannot rewind a newer counter window, and cleanup runs after locking the active counter to avoid cycles across expired accounts. Retry-After is bounded to the applicable minute/hour window. AI reservation timestamps are captured after accounting/policy locks, so a request waiting across UTC midnight is dated when it reserves. No financial settlement function, model setting, prompt or saved-document contract changed in this batch.

| Local command | Batch-3 working-tree result |
| --- | --- |
| `npm run check` | Passed formatting, lint, both TypeScript checks, 174 backend tests, 129 mobile tests and seven repository tests. Two PostgreSQL-dependent suites skipped without the test connection. |
| `npm run check:database` | Passed 315 backend tests and five installer tests; no failures/skips. All owned clusters stopped, including failed intermediate checks. |
| `npm run check --prefix mobile` | Passed TypeScript, online Expo compatibility and all 129 mobile tests after updating Expo to 57.0.27. |
| `npm run audit:dependencies` | Passed the existing gate. Root/backend/database have zero advisories; mobile retains the two reviewed, unpatched tooling advisories affecting 15 dependency nodes, expiring November 9, 2026. |

Persistence checks include migration preservation of settled/reserved/uncertain historical attempts and managed accounts, private policy/metadata grants, revoked sessions, independent app instances, committed counts after invalid payloads, monotonic rollover, bounded skip-locked cleanup, separate daily/lifetime/global denials, old unresolved liabilities, idempotent late settlement and account deletion. Actual mocked planning, food and scheduled flows confirm no extra dispatch after denial and continued saved-work/manual-log access subject to ordinary request limits. During test refinement, a misplaced expected-count edit caused two failures; the assertions were corrected and the complete final suite passed without relaxing checks.

The local full check includes the previously preserved, uncommitted legacy trust-test expansion in `aiTrust.test.ts`. That later-batch addition is excluded from this publication; CI verifies the committed tree. The existing 20 historical migrations and manifest entries remain unchanged, and private-file preservation is checked against the 1,390-file snapshot. Supabase CLI 2.67.1 has no advisor command; private-role/catalog/RLS queries were verified locally instead. Hosted advisors and real proxy/client-IP topology were not verified.

Before private publication, Render was rechecked: linked branch `codex/reset-backend-connectivity`, automatic deployment disabled, PR previews Off, live commit `2e779e5`. Batch 3 was published privately at `96e0dfa13bf0a3c2d28b85b0f51096049de64176`; [CI](https://github.com/nsoterop/FitQuest/actions/runs/38061390175) passed 315 backend, five installer, 129 mobile and seven repository tests, plus the dependency and full-history secret gates. No PR was opened at this checkpoint. The live evaluation protocol below remains a proposal, with no paid calls authorized or run.

## Batch-4 checkpoint — October 10, 2026

Batch 4 adds invented adversarial and legitimate regression cases without changing runtime behavior, prompts, models, limits or migrations. The previously preserved legacy trust-test expansion is included in this batch.

| Acceptance area | Evidence |
| --- | --- |
| Instruction/data boundary | `aiTrust.test.ts` exercises fake roles, delimiters, forged request settings, unrelated tasks and remote markup in every intake field, revisions, prior prescriptions, progress notes and legacy onboarding quotations. Exact input survives; provider authority/settings remain server-owned. |
| Useful programming | Mixed adapted sports, strength/endurance/mobility, three sessions on one day, optional practice, rest days and nutrition remain accepted by the existing contract. These are mocked proposals, not evidence of live coaching quality. |
| Provider privacy | `providerPrivacy.test.ts` exercises the real adapter with a fake transport: unknown error prose/metadata and invalid request identifiers are discarded, tool-shaped output cannot trigger actions, oversized streams are canceled, and failures never retry. Accountable usage survives refused/incomplete responses. |
| Private route logging | `app.test.ts` injects invented bearer/body/query markers and throwing services through nine private handlers plus malformed JSON. Responses are no-store with fixed errors; private logs remain empty. A public health request confirms the logger is active. |
| Mobile text rendering | `accountFlow.test.mjs` verifies current v4 exercise/prescription/nutrition markup stays literal text without executable nodes or remote requests. Existing tests retain overview-before-acceptance, free acceptance/reopen and saved-version behavior. |
| Durable authorization/accounting | The full disposable PostgreSQL suite verifies cross-account isolation, revoked sessions, independent instances, concurrent counters/reservations, denial without dispatch/retry, consent fences and preserved settled/uncertain liabilities. |

`npm run check` passed formatting, lint, types, production packaging, 189 backend tests, 130 mobile tests and seven repository tests; the two database-dependent suites skipped in that command. `npm run check:database` then passed all 330 backend and five installer tests with no skips. Its owned PostgreSQL cluster stopped and was removed. Online mobile Expo compatibility and the dependency gate passed. The two previously reviewed mobile tooling exceptions remain visible with their unchanged November 9 expiry. All 21 migration checksums and the 1,390-file private preservation snapshot are unchanged.

Read-only trigger review confirmed Render's linked branch is still `codex/reset-backend-connectivity`, auto-deploy is disabled, service PR previews are Off, and the live artifact remains `2e779e5`. The Render Blueprint still has Auto Sync Yes on `main`; this feature branch does not update that linked branch. A draft PR uses `[skip preview]` to exclude Blueprint previews under [Render's documented trigger rule](https://render.com/docs/preview-environments#manual-vs-automatic-preview-environments). This does not authorize a merge or sync. The FitQuest Supabase project's GitHub repository selector is unconnected. GitHub Actions remains the sole supported CI workflow, with no deployment or paid AI step; no matching security PR existed at review time. Exact source/CI/PR publication evidence belongs in the handoff. No hosted release, policy activation or paid evaluation occurred.

## Scope and decisions

Keep the current Sol 6.1 low setting, one accounted document request, flexible athlete programming, consent, server-owned identity/acceptance and all saved/legacy readers. Separate server instructions from athlete data; add explicit bounded non-plan outcomes; close pre-auth request gaps and enforce durable account fairness through the existing ledger. No classifier, keyword blacklist, tools, additional AI stage or generic policy framework.

The document planner now sends the five faithful answers, minimal body profile, revision and progress context as lower-priority serialized input. Server-owned coaching/display instructions and a concise shared trust boundary are separate. Reachable legacy planning and food paths receive the same boundary; legacy onboarding already separates instructions from serialized input and retains its existing explicit scope and untrusted-data rules within its bounded request size. User text is never promoted to a system/developer role. No credentials, account IDs or new profile fields are introduced.

## Request and account enforcement

All private routes, including both profile routes, share a pre-auth burst guard. It holds at most 1,000 socket-address buckets for one minute, rejects after 120 requests and supplies HTTP 429 with Retry-After. Private requests remain no-store with silent request logging. Fastify explicitly keeps `trustProxy: false`; client-supplied forwarding headers cannot rotate buckets. Render's actual origin/proxy chain and client-IP normalization are not established by source tests, so this remains a coarse socket/proxy guard, potentially shared by many users. Do not enable blanket proxy trust or a guessed hop count.

`take_account_request` enforces authenticated request limits atomically in PostgreSQL, after a fresh session check. Its short transaction commits before payload parsing or feature work. Validation failures cannot erase usage. Proposed defaults are 120 requests per minute and 1,200 per hour. Counter windows never move backward when requests wait for locks. One row per existing account holds counters; account deletion cascades only this transient row. Each active call prunes up to 100 rows idle over seven days with skip-locked cleanup after updating its own counter. There is no IP/request-content history. Inactivity can delay cleanup until subsequent requests; row count remains bounded by accounts.

Every runtime AI path, including food, legacy onboarding/planning and scheduled weeks, uses the same `reserve_onboarding` function through a small helper. Evaluation support continues to call that same reservation function directly and remains subject to the global/evaluation caps. The existing attempt ledger supplies account totals; there is no duplicate balance. Historical reservations receive their original creation timestamp. Existing settled costs and unresolved liabilities count toward account limits. Reserved/uncertain amounts remain fully charged against available headroom across UTC day boundaries. Settlement remains the existing idempotent function, including late usage. Denials persist bounded codes in failed operations without dispatch or an automatic retry. The scheduler retains its failed-week fence. AI exhaustion leaves the independent ordinary request allowance intact: accepted-plan reads, free acceptance/reopen and manual food/work/weight logging remain available subject to ordinary throttling. Every authenticated HTTP request, including an AI-denied request, consumes its normal request count. Auth sign-out is independent.

The proposed, administrator-controlled defaults are:

| Limit | Default | Rationale |
| --- | --- | --- |
| AI reservations per account per UTC day | 60 | Five-question intake is free; allows daily food interpretation/corrections, occasional plan revisions and legacy onboarding. Count includes accepted reservations even if later canceled before dispatch. |
| AI daily account headroom | $4 | Supports one maximum Sol reservation ($2.97 at 450,000 input bytes / 48,000 output tokens with the conservative long-context premium), with space for ordinary food use. Typical shorter requests reserve less. |
| AI lifetime account headroom | $5 | Prevents one account consuming the entire existing $7 shared lifetime allowance while allowing a valid maximum-size request. Historical spending is included; activation can immediately limit an existing account. |

All limits are subordinate to the unchanged $7 global lifetime and $0.25 evaluation caps. Account limits do not solve multi-account abuse or provider/model misuse. Concurrent outstanding reservations can temporarily reduce headroom. Daily request-count exhaustion resets at UTC midnight; spending exhaustion may also depend on pending liabilities settling. Generation APIs retain their persisted failed-operation response contract and fixed explanatory copy; ordinary request throttling returns 429/Retry-After. No automatic retry is introduced.

The new forward migration is `20261010140607_security_account_limits.sql`. It creates an inaccessible administrator policy row with **enabled=false**, expiring request counters and reservation metadata, replaces the narrow reservation function, and extends only the food error-code allowlist. All prior SQL migration bytes are unchanged. The fresh-install manifest adds that migration while preserving previous entries and the safe baseline. The old transactional request-limit table is retained for historical/rollback compatibility but is no longer the active limiter. Hosted activation has not occurred.

## Verification and residual limits

Batches 1–4 are implemented and locally verified as described in the checkpoints above. The provider uses `document_result_v1`, containing a complete plan or bounded `out_of_scope`/`unable` code. Saved documents remain `document-week-v4`; all legacy saved readers are unchanged. Provider refusals, incomplete responses and invalid structure stay distinct. App-owned copy invites correction without displaying arbitrary refusal prose. Tests cover explicit retries, single settlement, free acceptance/reopen, hidden draft exercises and preservation of accepted history.

Invented adversarial fixtures cover fake roles/delimiters, unrelated requests, overrides embedded in notes/prior output, malformed results, malicious markup/URLs, forged identity, revoked sessions, concurrent reservations/counters, UTC windows and unknown/late accounting. Existing safe text-rendering tests cover HTML, remote images and links; legitimate mixed training, arbitrary sports, limitation disclosures, multi-session/rest days and nutrition remain covered. Database tests use only owned disposable clusters and stop them afterward.

Mocks establish wiring and deterministic enforcement, not actual model resistance, fitness relevance or clinical safety. A model can still report a structurally valid inappropriate plan; its scope decision is not independent semantic verification. No blacklist, grader, moderation call, tools or classifier service was added. Source tests do not establish physical-phone acceptance or hosted proxy behavior.

No new telemetry service or raw-prompt logging was added. Existing allowlisted validation diagnostics retain their existing 14-day / 50-failures-per-account bounded cleanup; scope declines are bounded job codes, not validation incidents. Provider diagnostics retain only existing sanitized status/code/request identifiers. Existing operation/job attempt UUIDs correlate bounded failure codes with the same accounting attempt; no input text is a correlation field. Ordinary request denials return fixed codes/Retry-After without creating prompt-bearing incidents. Permanent financial attempt metadata and operation receipts are not transient logs and are not pruned. See [diagnostic retention](plan-validation-diagnostics.md).

## Proposed live evaluation — not run

Use only invented profiles and fixed dates, no owner baseline or saved account plan. Six individually authorized requests would cover: (1) unusual mixed sports plus multiple sessions, (2) mobility/limitation disclosure, (3) unrelated poetry task with fake roles, (4) a legitimate revision containing a policy override, (5) progress notes/prior-output injection while preserving actual training context, and (6) ordinary food plus an instruction to change account/budget policy. Expected outcomes are useful in-scope content or the bounded decline where appropriate, faithful sessions/limitations, no unrelated task, no executable/remote content and no asserted account/budget authority. Inspect each response manually; a small sample is not proof of resistance. Record exact request/settings, accounted usage and uncertainty privately. No retries, automated grading, production writes or plan acceptance.

At existing Sol rates, an illustrative 2,000-input/3,000-output-token plan costs about $0.034 ($2/M input + $10/M output); this is an estimate, not a reservation. The actual production adapter conservatively reserves by request bytes and a 48,000-output-token maximum: even the output allowance alone is $0.48. **A production-settings plan evaluation cannot fit the current $0.25 evaluation cap.** Therefore this protocol cannot be executed as-is under current authority. A separately authorized diagnostic token-bound design and fresh ledger headroom verification would be required; do not raise/reset caps or silently truncate production requests to make it fit. No paid evaluation was run.

## Release and rollback checklist

1. Verify exact reviewed commit, passing CI, migration checksum, current deployed artifact and existing service triggers. Production remains on its existing release; `main` source publication is separate.
2. Obtain explicit authorization for the scoped hosted forward migration, policy activation/defaults, matching backend/mobile release and any verification requiring live requests. No credentials, resource or native-build changes are required by this source work.
3. Under that authorization, capture private schema/accounting preservation evidence and apply only the new forward migration. Do not replay history or the fresh installer. Confirm restricted grants, preserved global totals and inactive policy. Resolve real proxy topology separately before considering forwarded-header trust; no proxy change is required here.
4. Coordinate/drain in-flight generations when switching the provider envelope so an old response is not interpreted with a new contract. Activate the reviewed policy explicitly and deploy the matching source/JavaScript; verify health, auth/no-store, bounded errors, ordinary saved-work access and release identity without paid regeneration or owner-data reset.
5. Rollback, if needed and authorized: restore the previous application artifact and reviewed policy state; retain all forward tables/columns and ledger liabilities. Never reverse schema by deletion or reset spending. Existing old clients show safe fallback copy for unknown codes. Old backend calls still use the same reservation signature. Do not blindly revert to an old runtime while new provider requests are in flight.

Final local/CI commit evidence is recorded in the implementation handoff; no item above is authorization to execute hosted changes.

## Sources

The [OpenAI Responses guide](https://developers.openai.com/api/docs/guides/migrate-to-responses) documents separate instructions and input. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) distinguish schema output from refusals and incomplete responses. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) informs private owner policies and restricted functions. [Fastify proxy guidance](https://fastify.dev/docs/latest/Reference/Server/#trustproxy) explains why forwarding headers remain untrusted. [Render web service guidance](https://render.com/docs/web-services) does not establish this service’s actual trusted origin chain. The [Supabase changelog](https://supabase.com/changelog) was checked; no change to existing Auth API usage is assigned.

## Release boundary

No deployment, hosted migration, credential/trust change, resource creation, native build, owner-data reset, paid evaluation or owner-plan regeneration is authorized. Existing production and scheduler settings remain unchanged. Preserve the single $7 lifetime / $0.25 evaluation ledger and all settled/uncertain charges. Temporary test processes must stop after verification.
