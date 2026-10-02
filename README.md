# FitQuest

The working tree was reset at the owner's request on 2026-10-02. Current scope: a simple iPhone welcome screen and a Fastify health endpoint, with a truthful backend connection status in the app.

- [Product goals](docs/PRODUCT_BRIEF.md)
- [AI-assisted development workflow](AGENTS.md)
- [iPhone setup and backend connection](mobile/README.md)
- [Backend setup and Render deployment](backend/README.md)

Local checks:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

The fresh source is on `codex/reset-backend-connectivity`. Commit `34ed41c` is deployed to the owner's existing Render FitQuest service. On 2026-10-02, the public [health endpoint](https://fitquest-api-dpk5.onrender.com/health) returned the required HTTP 200 response, and the owner confirmed **Backend: Connected** on the physical iPhone. Backend build/tests and mobile typecheck/dependency checks/tests pass (7 tests total).

Work will follow the owner's roadmap. Suggestions will be provided only when requested. Previous assignments are stopped; Git history is retained for recovery, not automatic reuse.
