# FitQuest — M1 Design Review and Owner Approval

Date: 2026-09-23 · Status: initial UX direction approved; M1a authorized

## Source and evidence

HQ read the completed proposal from **Design M1 sign-in and profile**, task `01a0d101-4c19-7b63-8d49-5fa0e5f70129`, completed turn `01a0d101-5bba-7f72-972b-157c8d38fd71`. Its [complete source snapshot](../proposals/M1_DESIGN_PROPOSAL.md) contains flows, textual wireframes, provisional tokens, save/recovery copy, and acceptance walkthroughs. Design reports no file edits or runtime tests. Textual wireframes and contrast calculations are not a rendered accessibility review.

The owner approved HQ's recommended initial UX direction, first scoped Engineering implementation, and expired-credential local-access policy. This approval does not authorize all M1 work, hosted changes, real Apple configuration, or deployment.

## Accepted direction

- Sessions-first navigation with an Account entry, required minimal profile, mixed strength/timed entries, and multiple sessions per day. This is a temporary foundation for the adaptive coach, not the final home experience or finished athlete onboarding.
- Explicit factual entry and correction; missing actuals remain unknown. Units, repetition/load basis, time, and session outcomes stay distinct. New sets do not silently copy actuals.
- Local save and server confirmation are separate states. Failed local writes cannot be presented as saved; unknown server outcomes cannot invite duplicate submissions. Recovery preserves the latest local work and respects account ownership.
- Initial neutral surfaces, teal actions, system typography, accessible controls, and a small reusable component set. Design's exact tokens are provisional implementation defaults; rendered screen review can refine them without treating this as a permanent brand system.
- Retain pending records under the original account on sign-out. No silent discard, production demo account, fabricated health history, or automatic migration of fixture records into a real account.

## Approved offline-access policy

Ordinary credential expiry may stop synchronization without stopping local capture for the previously verified, locally authorized account, provided its account/store ownership state and separate encryption key remain intact. A later app restart must validate that durable local authorization state rather than trust a cached nickname or account ID.

Explicit logout/account switch or confirmed revocation locks local access and stops work until the same account is verified again. Missing/corrupt/inconsistent authorization or ownership state also stays locked. Keys and pending records are retained, not regenerated or deleted as an authentication recovery shortcut. Ordinary expiry is not permission to bypass a failed identity check; undetected remote revocation cannot be claimed as enforced while offline. Engineering must distinguish these transitions in tests. Exact lifetime and device-unlock policies remain later authentication-gate decisions.

M1a tests this boundary with synthetic local identity transitions only. Actual production identity verification, credential rotation/activation, revocation transport, and physical-device behavior are not thereby proven.

## Scope cuts for the first implementation

The [M1a handoff](../ENGINEERING_M1A_HANDOFF.md) is authoritative for the current slice:

- Build shared validation, durable local capture/drafts/outbox records, and a small usable profile/session flow.
- Use manual time entry now. Live timer controls and timer-restoration UX are deferred to a later scoped increment; do not add nonfunctional controls.
- Do not implement backend transport, server conflict comparison, real sign-in screens that pretend to authenticate, or hosted PostgreSQL. Preserve the reviewed contracts so these can be added next.
- Developer-only identity/failure fixtures support verification, not a second app or public demo mode. Default and Release paths must fail closed without real authentication. Only synthetic records are authorized in this slice.

## Completion boundaries

M1a requires actual native local-storage/restart evidence plus automated tests; mock-only tests are insufficient. Full M1 additionally requires real authenticated synchronization, backend concurrency/isolation evidence, and device authentication checks. AI goals/coaching remain later work. HQ will review Engineering's report before assigning the next slice.
