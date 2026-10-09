# Workout-content batch 2 — October 9, 2026

New `document-week-v2` plans show ordered exercise names and concise plain-text prescriptions. Workout detail keeps the session identity, timing, duration and optionality but does not repeat its goal. The [exact formatting-only diff](formatting-diff.md) documents what changed and why the deleted owner example's precise historical cause remains unverified. Existing Markdown documents stay readable; explicit revisions may publish v2 only on success, preserving accepted v1 history.

Verification: **276 backend tests including isolated PostgreSQL, zero skips; 116 mobile tests; both TypeScript checks and self-review pass.** Mocks cover unchanged coaching prefix/settings, one initial/revision dispatch, display bounds, mixed prescriptions, hidden details, free acceptance/reopen, rejected/stale revisions, concurrency/ownership, migration preservation and explicit v1→v2 revisions with untagged legacy history. The tests do not claim provider coaching consistency.

The production components ran in an isolated Expo Go preview on the disposable iOS 26.4 simulator with synthetic responses and external requests blocked. A 375-point-wide layout used the system's extra-extra-large text size:

- [Strength and superset rows](strength-large.png): readable sets/reps/load, reps in reserve and recovery after each pair.
- [Mixed activities](mixed-large.png): run/walk distance and active recovery, mobility per-side/round pauses, and coordination time/counts.
- [Second session](second-session-large.png): a direct Today tap opens the optional evening session with its own duration and recovery.

All rows remained readable when brought into view. This verifies a narrow preview at one larger system text setting, not every physical device, maximum accessibility size or VoiceOver interaction. No native build, paid evaluation or owner regeneration was used. The owned Expo process, PostgreSQL fixture and disposable simulator were stopped; no owner-started server was changed.

Phone check: start the normal owner-controlled Metro server and reload FitQuest. A newly generated plan should reveal concise rows only after Use this plan. Open multiple sessions and check units/recovery. Existing saved Markdown remains in its original format until an explicit revision succeeds and is accepted. Phone acceptance and live coaching quality remain unverified. Nutrition targets are batch 3 and remain queued.

Published application `885eb9750c30929b3d6ef5f41e74f25cf3443a2c` is [Live on Render](https://dashboard.render.com/web/srv-d828o7pj2pic739le3ug/deploys/dep-db4ng0gm7kps73ancuv0). All 30 deployed compiled/catalog hashes match the local tested build. The undispatched runtime request reports the v2 row schema, Sol 6.1 low and unchanged 48,000-token limit; health and 38 private-route rejection checks pass. Hosted migration `20261009232521_document_exercise_rows` retained forced owner RLS. At 7:27:09 PM EDT, the nine scoped owner training tables were already empty, with one account/email, 17 protected groups and 141 permanent attempts preserved; no repeated deletion was needed. Food/library fingerprints and all 1,390 private artifacts match.

The [production iOS Hermes export](bundle.json) is 1,944,612 bytes, with all six changed production sources matching its source map. This is built-JavaScript evidence; no owner Metro listener was present. The final deployment screenshot is retained in the local task at `/tmp/fitquest-batch2-live.png`.
