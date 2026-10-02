# FitQuest API

Minimal Fastify 5 + TypeScript service. Node.js 24 is required.

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend ci
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend start
```

`check` builds the TypeScript source and tests the endpoints. `start` runs the built server. It listens on `0.0.0.0`, using `PORT` (default `10000`). Control-C stops it; SIGTERM also closes the server.

`GET /health` returns HTTP 200 with exactly:

```json
{"service":"fitquest-api","status":"ok"}
```

## Profile intake

`POST /profile-intake` accepts `Content-Type: application/json` with these six fields (synthetic example):

```json
{"firstName":"Alex","lastName":"Example","height":{"value":68,"unit":"in"},"age":29,"weight":{"value":155.5,"unit":"lb"},"gender":"Prefer not to say"}
```

Names and gender are required text, 1–100 characters with at least one non-whitespace character. Age is a whole number from 1 to 130; height is total whole inches from 1 to 120; weight is greater than 0 and up to 1,500 pounds, allowing decimals. Both units are required and must be exactly `in` and `lb`. Fastify JSON Schema validation rejects missing fields, extra properties and wrong types without coercion. Invalid input returns a 4xx error with a generic message; the body limit is 4 KiB. Parser errors and submitted values are never echoed or logged; logging is silenced for this route.

Valid input returns HTTP 200 with exactly `{"message":"User Data Saved"}`. This is **acknowledgment only**, with no database, durable storage or profile retrieval. The endpoint is temporarily public and has no account authentication or private-account readiness claim. Use invented values for verification.

Local TypeScript build and all 5 endpoint tests pass, covering health, acknowledgment, malformed input and logging privacy. On 2026-10-02, a synthetic request to the deployed POST endpoint returned HTTP 404: the deployed connectivity checkpoint does not yet contain the intake route. Publishing and deploying the intake checkpoint, then verifying it with invented values and the physical phone, remain pending.

## Render setup

HQ published the fresh code on `codex/reset-backend-connectivity`. Docker checkpoint `34ed41c85f410fde7bdd862aa257ab6ca9657319` was built and deployed successfully on Render on 2026-10-02. Historical pre-reset checkpoints with `rebuild/` must not be deployed for this task.

The owner selected the existing paid Docker `fitquest-api` service (`srv-d828o7pj2pic739le3ug`), keeping its current compute plan. Set its source branch to the fresh checkpoint, root directory to `backend`, Dockerfile path to `./Dockerfile`, Docker build context to `.`, and health path to `/health`. The Dockerfile builds TypeScript with Node `24.21.0`, installs production dependencies, and starts `dist/server.js` as a non-root user. Use Render's supplied `PORT` and managed HTTPS URL. No secrets or database are required. [Render Docker settings](https://render.com/docs/docker).

Engineering verified the owner's Hobby workspace and the existing service's Starter plan and private FitQuest source. The owner repaired the Render GitHub installation's repository access. The service now uses the fresh branch and backend paths above; **After CI Checks Pass** was restored as its auto-deploy policy. The existing Blueprint association and compute plan were retained.

The public [health endpoint](https://fitquest-api-dpk5.onrender.com/health) was verified over HTTPS with HTTP 200 and both expected fields. The owner separately confirmed **Backend: Connected** on the iPhone. The connectivity Docker image build and startup were verified on Render (local Docker remained stopped). Set the mobile app's `EXPO_PUBLIC_API_URL` to `https://fitquest-api-dpk5.onrender.com`. [Render web service settings](https://render.com/docs/web-services).
