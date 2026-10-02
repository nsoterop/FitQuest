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

HQ published the fresh code on `codex/reset-backend-connectivity`. Docker checkpoint `34ed41c85f410fde7bdd862aa257ab6ca9657319` was built and deployed successfully on Render on 2026-10-02. Historical pre-reset checkpoints with `rebuild/` must not be deployed for this task.

The owner selected the existing paid Docker `fitquest-api` service (`srv-d828o7pj2pic739le3ug`), keeping its current compute plan. Set its source branch to the fresh checkpoint, root directory to `backend`, Dockerfile path to `./Dockerfile`, Docker build context to `.`, and health path to `/health`. The Dockerfile builds TypeScript with Node `24.21.0`, installs production dependencies, and starts `dist/server.js` as a non-root user. Use Render's supplied `PORT` and managed HTTPS URL. No secrets or database are required. [Render Docker settings](https://render.com/docs/docker).

Engineering verified the owner's Hobby workspace and the existing service's Starter plan and private FitQuest source. The owner repaired the Render GitHub installation's repository access. The service now uses the fresh branch and backend paths above; **After CI Checks Pass** was restored as its auto-deploy policy. The existing Blueprint association and compute plan were retained.

The public [health endpoint](https://fitquest-api-dpk5.onrender.com/health) was verified over HTTPS with HTTP 200 and both expected fields. The owner separately confirmed **Backend: Connected** on the iPhone. Local backend build and 2 endpoint tests pass; the Docker image build and startup were verified on Render (local Docker remained stopped). Set the mobile app's `EXPO_PUBLIC_API_URL` to `https://fitquest-api-dpk5.onrender.com`. [Render web service settings](https://render.com/docs/web-services).
