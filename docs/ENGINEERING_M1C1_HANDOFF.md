# FitQuest — Engineering M1c.1: Authentication Contracts and Recovery Coordinator

Date: 2026-09-25 · Owner: Project HQ

Status: Owner-approved first implementation delivered; **HQ acceptance withheld for [F1–F4](reviews/M1C1_REVIEW.md)**. Bounded corrections dispatched on 2026-09-25 to **Engineering**, task `01a0d053-66ed-79a0-a0bb-5b366646e723`, local host; correction turn `01a0d968-05e0-70f3-b105-2a8ee30e6c8f`. Original delivery turn `01a0d954-dfdb-7d31-831d-16f88c789219`. No M1c.2 or wider scope; stop for HQ review.

## Outcome

Implement strict additive authentication contracts and a pure, deterministic credential-recovery coordinator with injected ports. Make the next auth increments executable without inventing recovery semantics. **The running app and API behavior must remain unchanged and real sign-in remains locked.** No Apple identifiers, credentials, device access or hosted resources are needed.

Accepted implementation baseline: `490f9239614d6f40cc63cbf3010c37ea34ff23a6`. Planning checkpoint: `1317c2ad4596c2227e10990b474b8c2798a0398a`. Reinspect current Git/source state; HQ is updating shared docs independently. All 49 existing baseline tests must continue to pass. The nine accepted PostgreSQL tests remain previous evidence; do not claim rerunning them unless actually run.

## Required context and ownership

Read current PROJECT_CONTEXT, PRODUCT_BRIEF, DECISIONS, ROADMAP, HANDOFF and DESIGN_SYSTEM under `docs/`, then the [M1c proposal](proposals/M1C_ARCHITECTURE_PROPOSAL.md), [HQ review](reviews/M1C_ARCHITECTURE_REVIEW.md), [prior recovery addendum](proposals/M1_RECOVERY_ADDENDUM.md), and [M1b acceptance](reviews/M1B_REVIEW.md). HQ review and this handoff take precedence for current scope.

Engineering is the only implementation writer under `rebuild/`. Preferred files: new `rebuild/packages/contracts/src/auth.ts` and focused tests plus an additive export from `src/index.ts`; new `rebuild/apps/mobile/src/auth/` modules/tests; `rebuild/docs/M1C1_REPORT.md`. A short rebuild README status/test note is allowed if useful. HQ owns root README and shared `docs/`. Do not edit another task's docs, dispatch work, stage, commit or push; HQ integrates under standing Git approval. No worktree needed.

Inspect existing `access.ts`, `accountTransitions.ts`, `sync.ts`, `store.ts` and tests for behavior to preserve, but **do not wire the new modules into App.tsx, these runtime modules, the API, or native adapters in this increment**. Keep all code importable by existing Node/Vitest checks without loading Expo/SecureStore/native runtime.

## Implementation requirements

1. Add strict Zod request/response schemas for the proposed challenge/exchange, pending credentials, activation, refresh, logout, active identity and auth errors. Use bounded token/string sizes, positive safe generations, valid IDs/instants, coherent timestamps, and explicit unknown-field rejection. Define a versioned persisted credential state union and separate local-authorization port/result types. Document technical bounds. Export additively; preserve existing command canonicalization, strict M1b identity shape, domain errors and stored hashes/outcomes.
2. Implement a small coordinator/reducer plus effect ports for time, unique operation IDs, credential read/write/readback, challenge/provider authorization or already-returned authorization input, auth transport, identity confirmation and local access/locking. Ports are injected test doubles here, not actual fetch, SecureStore, SQLCipher, Apple, filesystem storage, or token-issuing server code. Avoid framework dependencies and a generalized workflow engine.
3. Enforce `stable -> refresh_prepared(operationId, old complete bundle) -> activation_pending(new complete bundle) -> stable`. Persist and successfully read back before refresh dispatch or activation. On restart recover the recorded phase and exact operation ID; never reconstruct a partial bundle, invent a replacement operation for consumed credentials, or replay cached issued secrets from a server surrogate. Same-operation reauthentication and different-operation revocation are transport outcomes; this client increment does not implement server replay detection.
4. For initial exchange, uncertain response loss requires fresh authorization; do not automatically re-exchange a single-use code. If a complete bundle remains in memory after failed storage, a bounded persistence retry may use that same bundle before expiry. A received-but-abandoned bundle may be revoked through the injected cleanup capability without installing it. Activation-response loss permits exact activation retry; do not report signed-in/sync-ready before activation, matching identity confirmation and required durable local-authorization acknowledgement.
5. Separate ordinary expiry/reauthentication, provider/network unavailability, malformed credentials, and confirmed bound-session revocation. Preserve existing local authorization on ordinary expiry or unavailable rotating credentials when its independent integrity remains valid; never unlock based on a cached account ID alone. Corrupt/contradictory ownership fails closed. No draft/outbox/key deletion or replacement action exists in this coordinator.
6. Make refresh single-flight per bound account/session and reject late work using environment/account/session/epoch/generation checks across every await and at dispatch/application boundaries. Port contracts must make storage writes serialized or conditional so an in-flight old write cannot overwrite a newer bundle/lock. Test both delayed network and delayed storage completions. Stop/cancel invalidates future dispatch and installation without claiming to undo already-sent work.
7. Model explicit logout/switch and confirmed revocation with immediate in-memory invalidation and required durable lock acknowledgement before reporting completed logout or opening another account. Offline server revocation may remain pending after a successful local lock; failure of all durable lock writes must report incomplete logout, not success. Inject the lock behavior rather than implementing native dual-latch storage now. Retain a bounded capability to revoke the old family without exposing it in public status.
8. Keep status/errors free of access/refresh/revocation secrets, provider tokens, request bodies and raw exceptions. Expose no arbitrary-account authority selection or synthetic fallback. Use named configurable proposal timing defaults with fake time; don't build server enforcement, background cleanup, key generation, signing or rate limiting here.

## Required verification

- Happy initial persistence/readback/activation/identity sequence; pending credentials never permit private work.
- Strict schema rejection of missing/extra/invalid/oversized values, mismatched account/session/generation and incoherent deadlines; existing contracts remain unchanged.
- Failure/crash before and after each persistence/readback, exchange, activation, refresh and stable-install boundary; restart from each durable phase with all simulated local work preserved.
- Exchange timeout/unknown outcome never blindly repeats the code. Activation response loss retries the same stored bundle; pending expiry and already-active retry behavior are distinct. Refuse sync-ready state on identity mismatch.
- Concurrent refresh requests share one operation. Restart uses the same persisted ID. Lost committed-refresh response, same-operation reauth, different-operation bound revocation, unknown token and provider outage take distinct paths; no secret replay claim.
- Controlled late responses and storage writes after stop/logout/switch/newer generation cannot overwrite or unlock another account; cancelled token/storage waits dispatch nothing new. Genuine cleanup revocation is scoped to the abandoned family.
- Ordinary expiry preserves approved local logging; malformed independent authorization locks. Successful offline local logout remains visibly server-pending; durable lock failure never reports completion or allows the switch.
- Public snapshots/diagnostics do not leak generated fake secrets. Tests assert call order and prohibited side effects as well as final state; use deterministic barriers/fake clock, not timing sleeps.
- Run `npm run check` from `rebuild/`: all prior tests, new tests, typecheck, lint and builds. Run `git diff --check -- rebuild`. No database/native checks are required because those runtime paths are unchanged; state this limit explicitly. If a perceived need arises to touch them, stop and explain rather than silently expand scope.

## Delivery and stop conditions

Write `rebuild/docs/M1C1_REPORT.md` with exact files, public contracts/ports, state transitions, test commands/counts, failures/limits, and the next narrow task. Report model-only recovery separately from actual native storage, Apple, PostgreSQL/session or phone verification. Stop for HQ review; no M1c.2 auto-progression.

No dependency installs, broad refactors, native config/build, migrations, real provider/API/network calls, Apple assets, secrets, phone setup, LAN/tunnel exposure, hosted changes, deployment, paid builds or real health data. Preserve fixture stores/keys/revocations and prototype. Owner approval removes an extra approval round for this reviewed increment; it does not authorize guessed external targets or destructive recovery.
