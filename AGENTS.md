# FitQuest — AI-assisted development workflow

## Owner authority

The owner requested a complete reset on 2026-10-02. The owner's roadmap controls all work. Do not propose a roadmap, milestones, architecture alternatives, extra prerequisites or other recommendations unless the owner specifically asks for suggestions.

Current owner-assigned task: add a very simple Fastify + TypeScript backend on Render so the existing React Native screen displays "Backend: Connected" after a successful real API request. The owner explicitly selected Fastify after Architecture's discussion and reports the simple mobile screen complete. Engineering is the sole implementation writer for one GET /health endpoint, deployment to the verified Render target, and truthful Checking/Connected/Unavailable mobile status with manual retry. No authentication, database, health integration or AI is included. Any ambiguous hosted target or new paid-plan choice needs the owner's concrete decision; do not alter unrelated existing services. Stop after this requested outcome; do not invent a next phase.

All pre-reset engineering, phone setup, architecture, design, AI-feature and milestone assignments remain stopped. Historical approvals and archived handoffs do not authorize restarting them. The owner's fresh tech-stack discussion supplies direction, not permission to implement the whole stack now.

## Working rules

- Implement only the requested task and its necessary ordinary steps. Do not turn long-term goals into permission for speculative infrastructure or another foundation initiative.
- Ask concise questions only when a missing choice actually prevents the requested work. Explain concrete safety, correctness or environment blockers without inventing additional project phases.
- Do not make the owner repeatedly approve ordinary steps within an explicitly assigned task. Material scope expansion and external/destructive actions still need the applicable explicit authorization.
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
