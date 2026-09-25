# FitQuest — M1c.1 HQ Review

Date: 2026-09-25 · Status: **F1–F4 closed by independent probes; acceptance withheld for F5 credential-corruption recovery.**

## Correction review — F1–F4 closed, F5 open

Engineering delivered its first correction in turn `01a0d968-05e0-70f3-b105-2a8ee30e6c8f`. HQ read the changed coordinator/regressions/report and independently reran `npm run check`: **83 tests** (API 2, contracts 12, mobile 69), typechecks, lint and builds passed. Runtime app/API/native/database paths remain unchanged. The actual-class in-memory reproductions now show:

- F1: logout/restart/fresh same-account sign-in becomes ready; exchange count advances to two without unlocking from retained credentials alone.
- F2: expired access first yields local-only/ACCESS_EXPIRED, then one refresh with fresh future deadlines becomes ready.
- F3: after the pending deadline but before access expiry, server-confirmed already-active becomes ready; server-expired stays unready.
- F4: mismatched independent environment with missing rotating credentials produces an integrity lock and no local authorization.

These findings are closed in the pure-model scope. A further continuation of the valid-local/corrupt-credentials test exposed F5 below. All implementation remains unaccepted/local/uncommitted; the historical first review is retained after F5.

## F5 — Corrupt rotating credentials permanently block the required fresh sign-in

**P1; blocks acceptance.** Source: `recover()` sets `retainedCorrupt` for any present record failing `PersistedCredentialsSchema`; `exchange()` immediately returns locked/AUTH_INVALID when that flag is set.

Reproduction using the actual coordinator/test ports: establish valid authorization and stable credentials; corrupt only the rotating bundle's refresh token; supply matching trusted account/store/install context; create a coordinator and recover. Result is correctly local-only/authorized with AUTH_REAUTH_REQUIRED. Then submit a fresh exchange. It returns `phase: locked`, `localAccess: authorized`, AUTH_INVALID, with no new exchange call (count remains one). Repeating from a new coordinator cannot repair the same durable record. The status also contradicts itself: locked phase with authorized local access.

The accepted policy requires fresh verification rather than reconstructing malformed credentials; it does not require abandoning a correctly owned store when rotating credentials alone are damaged. Required: a bounded reauthentication path using independently validated owner/store context and the retained storage revision. Treat every field in the corrupt bundle as untrusted; never reuse its tokens, derive owner authority from it, or silently reset/delete data. Persist a complete fresh bundle only after verified same-account identity and fenced CAS; preserve local authorization/pending work and reject a different account. Distinguish this from corrupt/mismatched independent authorization or unknown ownership, which must remain fail closed and use an explicit recovery-required state if identity cannot yet be established safely.

Add regressions that continue beyond the local-only corruption snapshot: successful same-account fresh verification, different-account rejection, lock/ownership mismatch, failed storage/readback and a newer revision/epoch winning while recovery waits. Assert coherent public state. No native adapters or runtime widening is requested; stay within the existing pure injected-port model, update the report and rerun full checks.

## Historical initial review — F1–F4 superseded above

## Delivery and independent checks

Engineering delivered additive auth contracts, a pure injected-port coordinator/tests, and [M1C1_REPORT.md](../../rebuild/docs/M1C1_REPORT.md). Source scope matches the [handoff](../ENGINEERING_M1C1_HANDOFF.md): no App/API/native wiring, dependency or migration changes. The only tracked existing-source edit is the additive contracts export. The implementation remains local/uncommitted; M1b is still the latest accepted implementation.

HQ read all new source/tests and the report. Fresh `npm run check` passed **77 tests** (API 2, contracts 12, mobile 63), typechecks, lint and builds. Node's existing experimental SQLite warning remains. Four extra source-driven probes below failed despite those passes. HQ loaded the actual coordinator with `node --import tsx`, transpiled the existing test harness declarations in memory (excluding its tests), and used its injected ports/fake clock. No files, actual credentials, native storage, network or databases were changed by these probes. This is model evidence, not runtime sign-in testing.

## F1 — Retained credentials prevent fresh sign-in after explicit logout

**P1.** [Coordinator recovery/exchange](../../rebuild/apps/mobile/src/auth/coordinator.ts#L118).

Reproduction: successful exchange → `logoutOrSwitch()` → new coordinator → `recover()` → fresh `exchange()`. Recovery correctly reports locked, but returns before inspecting the retained credential revision. Exchange then sees a nonempty credential store with no loaded record/revision and returns `unavailable / AUTH_INVALID` without dispatching a fresh exchange. Total exchange calls remain one. The retained stable credentials are intentionally preserved, so the normal sign-back-in path becomes stuck.

Required: preserve the durable lock while allowing fresh verified identity to safely replace/reconcile retained credentials with fenced revision checks. Do not solve by deleting credentials, encryption keys, fixture data or pending work; retained credentials alone must never unlock. Test logout/restart/fresh same-account sign-in, different-account isolation, lock/write failure, and newer epoch/credential CAS conflicts.

## F2 — Ordinary access-token expiry disables valid refresh

**P1.** [Recovery expiry branch](../../rebuild/apps/mobile/src/auth/coordinator.ts#L144) and [refresh guard](../../rebuild/apps/mobile/src/auth/coordinator.ts#L211).

Reproduction: establish stable credentials, advance fake time to 10:16 with access expired at 10:15 but refresh valid for 30 days, create a coordinator, recover, then call refresh. Both calls remain `reauth_required`; refresh transport is called zero times. Recovery sets the same terminal UI phase used for unrecoverable credentials, and `refresh()` refuses that phase. This requires Apple sign-in after ordinary short-lived access expiry even when renewal is valid.

Required: distinguish refreshable access expiry from terminal reauthentication/refresh-family expiry. Allow the approved single-flight, durable exact-operation refresh while retaining authorized local logging and keeping sync unavailable until renewal succeeds. Tests must use newly issued future deadlines for the rotated bundle, retain terminal same-operation reauth behavior, and prove expired refresh/session credentials still cannot renew.

## F3 — Lost activation response cannot recover an already-active generation after the pending deadline

**P2.** [Activation preflight](../../rebuild/apps/mobile/src/auth/coordinator.ts#L267).

Reproduction: retain `activation_pending`, advance fake time to 10:06 (pending deadline 10:05, access valid until 10:15), configure the transport to return matching `active / alreadyActive: true`. Recovery returns `reauth_required`, with zero activation calls. The client cannot know whether the previous activation committed, yet its preflight treats the pending-only deadline as proof the session never became active.

The accepted proposal explicitly allows idempotent acknowledgement of an already-active matching generation while its access bearer is valid. Required: distinguish server-confirmed pending expiry from an unknown activation outcome. Allow a bounded idempotent recovery check with a still-valid bearer; never extend the deadline or activate a server-expired pending generation. Test paired outcomes at the same fake time: already-active succeeds after matching identity confirmation, genuinely expired stays unavailable, and expired access cannot become sync-ready. The current test covering only an already-active retry *before* the deadline does not cover this case.

## F4 — Missing credentials bypass local-authorization binding validation

**P1.** [Local authorization installation](../../rebuild/apps/mobile/src/auth/coordinator.ts#L126).

Reproduction: establish valid local authorization, remove the rotating credential record, change the returned authorization binding's environment to another valid environment, then recover. Observed `reauth_required / localAccess: authorized`, with zero integrity locks. `recover()` installs authorized status before validating the binding and returns early for missing/malformed/unreadable credentials. `exchange()` already checks environment/epoch, but recovery does not on this branch.

Required: validate the independent authorization record and its expected environment/epoch/owner scope before exposing local authorization on *all* recovery paths, including missing/corrupt/unavailable rotating credentials. Make any expected-account/store contract explicit in the injected ports; do not rely on a null-credential fence to imply a matching owner. Preserve the valid missing-credentials/local-only case. Add mismatch tests for environment, epoch and available expected-owner context, plus malformed binding and unavailable protected-storage cases. No actual native dual-latch implementation is requested here.

## Correction scope and stop condition

Return F1–F4 and focused regressions to Engineering within the already approved M1c.1 scope. Preserve the pure model boundary and every M1a/M1b regression. Update the report, rerun full checks, document fake-port limitations, and stop for HQ review. No M1c.2, native/provider/backend work or new dependencies. No implementation acceptance, commit or push of unreviewed source is implied by passing the 77-test baseline.
