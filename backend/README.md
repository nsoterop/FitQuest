# FitQuest API

Minimal Fastify 5 + TypeScript service. Node.js 24 is required.

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend ci
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend start
```

`check` builds the TypeScript source and tests the endpoint. `start` runs the built server. It listens on `0.0.0.0`, using `PORT` (default `10000`). Control-C stops it; SIGTERM also closes the server.

`GET /health` returns HTTP 200 with exactly:

```json
{"service":"fitquest-api","status":"ok"}
```

## Render setup

HQ published this new `backend/` package on `codex/reset-backend-connectivity` at commit `c103458cb6c85179b41bce270911a29b2f421c9d`. Historical pre-reset checkpoints with `rebuild/` must not be deployed for this task. Publication alone is not deployment verification.

The owner selected the existing paid Docker `fitquest-api` service (`srv-d828o7pj2pic739le3ug`), keeping its current compute plan. Set its source branch to the fresh checkpoint, root directory to `backend`, Dockerfile path to `./Dockerfile`, Docker build context to `.`, and health path to `/health`. The Dockerfile builds TypeScript with Node `24.21.0`, installs production dependencies, and starts `dist/server.js` as a non-root user. Use Render's supplied `PORT` and managed HTTPS URL. No secrets or database are required. [Render Docker settings](https://render.com/docs/docker).

Engineering's Render inspection on 2026-10-02 confirmed the owner's Hobby workspace and the existing service's Starter plan and private FitQuest source. Use the latest reviewed published checkpoint on `codex/reset-backend-connectivity` containing `backend/Dockerfile` for this adaptation. No new deployment has been made. Engineering verified the official Node image tag; local Docker is stopped, so image build verification will occur on Render.

Once deployed, set the mobile app's `EXPO_PUBLIC_API_URL` to the service's HTTPS base URL and verify the public `/health` response and the iPhone status separately. [Render web service settings](https://render.com/docs/web-services), [Node version settings](https://render.com/docs/node-version).
