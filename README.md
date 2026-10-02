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

The fresh source is on `codex/reset-backend-connectivity`. Profile intake checkpoint `2317297` is deployed to the existing Render service. On 2026-10-02, the public [health endpoint](https://fitquest-api-dpk5.onrender.com/health) returned HTTP 200; the owner previously confirmed **Backend: Connected** on the physical iPhone.

All 16 tests, typechecks and Expo compatibility checks pass. The deployed intake endpoint was verified over HTTPS: invented valid values returned HTTP 200 with exactly `{"message":"User Data Saved"}`; missing fields returned HTTP 400. On 2026-10-02, the owner confirmed successful submission on the physical iPhone after the invented-values walkthrough. This requested feature is complete. **User Data Saved** acknowledges receipt; no profile data is durably stored, and this public temporary endpoint does not provide private accounts.

Work will follow the owner's roadmap. Suggestions will be provided only when requested. Previous assignments are stopped; Git history is retained for recovery, not automatic reuse.
