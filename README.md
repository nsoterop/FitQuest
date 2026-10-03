# FitQuest

React Native/Expo iPhone app and Fastify backend. The owner-assigned work is Supabase **Free** email accounts and persistent six-field athlete profiles, with profile access through Fastify. Agents must never provision paid resources or subscriptions.

- [Product goals](docs/PRODUCT_BRIEF.md)
- [Development scope and ownership](AGENTS.md)
- [iPhone setup](mobile/README.md)
- [Backend and database setup](backend/README.md)

```sh
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/backend run check
npm --prefix /Users/nicksoteropoulos/Code/FitQuest/mobile run check
```

## Current verification / remaining work

This checkpoint implements Supabase accounts and profile persistence, replacing Clerk. The app opens at email sign-in/sign-up and shows the profile form only after authentication. HQ reran backend typecheck and 12 unit tests, one real PostgreSQL integration test in a new isolated local cluster, mobile typecheck and all 27 tests, and online Expo dependency compatibility; all passed. Engineering also verified an iOS Hermes bundle export. The database test uses synthetic Auth tables; Auth SDK tests mock its verification service. These do not establish hosted authentication success.

The existing Free FitQuest project (`wqvxddvihlobnalxpzow`) has now been reset completely at the owner's request. All 17 legacy tables, four RPCs, old accounts/identities/sessions/tokens and old storage bucket/policies are removed. `fitquest.profiles` was recreated empty with forced RLS, and application migration history now has one fresh baseline. Managed Supabase structures remain operational. Hosted catalog counts and the Authentication dashboard confirm zero users and zero legacy application data/components; restricted TLS and profile grants are verified.
Email confirmation remains enabled, but custom SMTP is disabled; the owner's email-delivery choice/configuration is pending. Auth redirect setup, Render environment/publication/deployment and real hosted two-account acceptance remain unfinished. A refreshed iPhone development build is required for SecureStore. Native session refresh/storage and physical-phone acceptance remain unverified.
The live service still runs intake acknowledgment checkpoint `2317297` on `codex/reset-backend-connectivity`; it has no durable profile storage or private accounts. The owner previously confirmed **Backend: Connected** and successful synthetic intake on the physical iPhone. Do not deploy historical `main` code. The accidentally created empty Render Postgres service was deleted; no hosted migrations/profile writes were applied there.
