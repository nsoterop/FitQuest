# FitQuest

The working tree was reset at the owner's request on 2026-10-02. Current scope: the iPhone welcome screen, backend connection status, and a six-field profile intake form that sends data to Fastify for validation and acknowledgment only.

- [Product goals](docs/PRODUCT_BRIEF.md)
- [AI-assisted development workflow](AGENTS.md)
- [iPhone setup and backend connection](mobile/README.md)
- [Backend setup and Render deployment](backend/README.md)

Local checks:

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

The fresh source is on `codex/reset-backend-connectivity`. The existing deployed connectivity checkpoint is `34ed41c`. On 2026-10-02, the public [health endpoint](https://fitquest-api-dpk5.onrender.com/health) returned HTTP 200, and the owner confirmed **Backend: Connected** on the physical iPhone.

The profile intake changes are locally implemented and tested (16 tests total). Publication, deployment and the phone submission walkthrough are pending. **User Data Saved** acknowledges receipt; no profile data is durably stored, and this public temporary endpoint does not provide private accounts.

Work will follow the owner's roadmap. Suggestions will be provided only when requested. Previous assignments are stopped; Git history is retained for recovery, not automatic reuse.
