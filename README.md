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

Deployment is awaiting Render account/target inspection. Deploy a published checkpoint containing the current `backend/` package, not a historical pre-reset `rebuild/` checkpoint. Git publication alone does not mean the API is deployed or connected on the phone.

Work will follow the owner's roadmap. Suggestions will be provided only when requested. Previous assignments are stopped; Git history is retained for recovery, not automatic reuse.
