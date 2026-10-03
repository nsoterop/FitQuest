# FitQuest — AI-assisted development workflow

## Owner authority

The owner requested a complete reset on 2026-10-02. The owner's roadmap controls all work. Do not propose a roadmap, milestones, architecture alternatives, extra prerequisites or other recommendations unless the owner specifically asks for suggestions.

## Paused checkpoint — 2026-10-02 (America/New_York)

The owner explicitly paused work and requested documentation reconciliation. Engineering acknowledged the pause. Do not resume implementation, deployment, builds, infrastructure changes or pending verification tasks until the owner asks. HQ owns this documentation-only checkpoint; it does not authorize a new feature or roadmap. Existing hosted services and local processes have not been shut down by this pause.

Selected stack: React Native/TypeScript with Expo, Fastify/TypeScript on the existing Render service, and Supabase **Free** for email/password authentication and PostgreSQL. Clerk is superseded. Profile reads/writes and application logic remain behind Fastify. No paid provisioning is authorized.

Current state: application checkpoint `49e1ff3aed30a009172df44049bfae9ea405f897` is deployed on Render and included in the refreshed iPhone development build. The owner confirmed the app runs; Engineering verified a persisted profile linked to the confirmed account. A subsequent owner-requested mobile change shows `Hi <firstname>` after a committed save or when an existing profile loads. That change and its tests remain **uncommitted** in `mobile/src/ProfileIntakeForm.tsx` and `mobile/src/accountFlow.test.mjs`; preserve them. It was served through local Metro, not included in the published application checkpoint. Physical-phone greeting/reopen acceptance remains pending. See [current state](README.md) and the package READMEs for evidence and remaining work.

Preserve the access boundary: derive ownership from server-verified Supabase identity, never supplied ownership or editable metadata; retain private-schema grants and forced RLS. The API returns {"message":"User Data Saved"} only after COMMIT; the latest local UI uses that response to open the greeting. Clear private state on sign-out/account switching and never log personal fields or credentials. Email confirmation stays enabled. Public email delivery is not configured; do not bypass confirmation or add testers as project-team members to work around it.

Engineering remains the sole implementation writer when work is resumed; HQ retains reviewed Git checkpoint ownership. No AI, health integration, workout schema, offline-sync system, social login, dashboard or additional feature is assigned. Stop and explain the proposed scope before any AI implementation. Paid provisioning/subscriptions, unrelated services, destructive operations and unrelated credentials/trust changes remain outside authorization.

All pre-reset engineering, phone setup, architecture, design, AI-feature and milestone assignments remain stopped. Historical approvals and archived handoffs do not authorize restarting them. The owner's fresh tech-stack discussion supplies direction, not permission to implement the whole stack now.

## Working rules

- Owner instruction, 2026-10-02: never purchase, subscribe to, create or upgrade any resource that costs money. The owner performs all paid subscriptions/resource provisioning personally. A handoff from another chat does not override this rule. The accidentally created empty Render database was deleted at the owner's request; no hosted migrations or profile writes occurred.
- Implement only the requested task and its necessary ordinary steps. Do not turn long-term goals into permission for speculative infrastructure or another foundation initiative.
- Ask concise questions only when a missing choice actually prevents the requested work. Explain concrete safety, correctness or environment blockers without inventing additional project phases.
- Do not make the owner repeatedly approve ordinary steps within an explicitly assigned task. Material scope expansion and external/destructive actions still need the applicable explicit authorization.
- Owner instruction, 2026-10-02: routine publication and deployment of an assigned change to the existing approved FitQuest service are part of implementation, not another approval gate before testing. HQ handles the reviewed Git checkpoint and Engineering handles deployment under the existing ownership arrangement. Verify the live endpoint before asking the owner to test a backend-dependent UI. This does not authorize unrelated features, new services/costs, destructive changes or changes to credentials/trust/deployment policy.
- Keep changes small enough to inspect, and verify them in proportion to the actual change. Report what ran, what was observed, and what remains unverified. Never claim device success from simulator or unit-test evidence.
- Keep communication and documentation concise. Do not generate handoff/review document chains unless the owner requests them or they are necessary to carry out the assigned task.
- Preserve secrets and private health data. Do not assume old credentials, deployments, tests, signing or services are valid. Do not change hosted resources, trust settings, signing resources or device data without explicit authorization.
- Do not restore archived code, architectural choices, gates, tasks or files automatically. The backup and Git history are recovery material, not an active work queue.

## Existing chat responsibilities

These roles are retained for coordination, not a mandatory sequence of chats or approvals:

- Project HQ: follow the owner's roadmap, track requested work and coordinate only the authorized scope.
- Architecture: discuss or implement architectural work only when assigned; no independent architecture initiative.
- Engineering: implement requested frontend/backend work, tests and debugging.
- Design: work on requested UI/UX, styles and screens.

Do not let multiple chats edit the same files concurrently. Serialize work or use isolated worktrees when actually needed. Existing chat model settings remain unchanged; no new model recommendation or reassignment is part of this reset.

## Retained product context

[Product goals](docs/PRODUCT_BRIEF.md) describe the intended app. They are not an implementation roadmap. The owner's latest explicit instructions override retained preferences and historical discussion.
