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

Deploy only a published checkpoint containing this new `backend/` package. Historical pre-reset checkpoints with `rebuild/` must not be deployed for this task. HQ owns publishing the fresh checkpoint; publication alone is not deployment verification.

Use a Node web service with root directory `backend`, build command `npm ci && npm run build`, start command `npm start`, and health check path `/health`. The package bounds the runtime to Node 24; Render can also set `NODE_VERSION` to `24.21.0`. Use Render's supplied `PORT` and managed HTTPS URL. No secrets or database are required.

The Render account, service target, and plan are awaiting signed-in inspection. No deployment has been made. Do not change unrelated services or select a paid plan without the owner's specific approval.

Once deployed, set the mobile app's `EXPO_PUBLIC_API_URL` to the service's HTTPS base URL and verify the public `/health` response and the iPhone status separately. [Render web service settings](https://render.com/docs/web-services), [Node version settings](https://render.com/docs/node-version).
