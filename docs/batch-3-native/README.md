# Integrated nutrition targets — October 9, 2026

New document-week-v3 plans add estimated daily kcal/protein/carbohydrate/fat targets to the same weekly request. Targets preview below the overview; Use this plan accepts workouts and targets together for free. Nutrition looks up only the accepted version containing the diary date, including accepted history during revisions. Legacy plans remain readable without targets or automatic backfill. Food and recipe arithmetic is unchanged; an entirely unknown consumed nutrient displays an em dash.

Before new plan transmission, each account explicitly allows or declines sharing saved age, height, weight and self-reported gender plus intake/revision context with OpenAI. No account name, email or ID is added to the request. The versioned permission defaults to null, supports withdrawal and optimistic revision checks, and is checked again under the same account lock as withdrawal immediately before dispatch. Decline does not disable saved plans or manual food logging. Already transmitted data cannot be recalled by withdrawal. The disclosure links OpenAI's actual API data policy, acknowledges retention and unverified organization controls, and makes no public-launch compliance claim.

The existing five-answer training prompt is byte-for-byte unchanged. The request appends a faithfully labeled body-profile paragraph with inches/lb/years, describes gender as self-reported rather than confirmed physiology, and then exactly:

> I also want you to return an object with macronutrient targets based on my body profile and goals. These targets should be whatever levels would best help me achieve all my goals.

A final formatting paragraph defines the small nutrition object, units, estimates and honest unavailable outcome. No formula, maintenance default, fixed deficit, macro-allocation bounds, extra questionnaire or request was added. Sol 6.1 low, limits, prices and the single permanent ledger remain unchanged.

**279 backend tests with isolated PostgreSQL and zero skips; 119 mobile tests; both TypeScript checks and self-review pass.** Tests cover exact prompt/schema, faithful minimal context, permission decline/revoke/isolation/staleness and zero dispatch, one-call generation/revision, hidden workouts with preview targets, free combined acceptance/reopen, dated accepted history, failed/stale revisions, unavailable targets, null-aware totals, late-response isolation and migration preservation. No paid provider evaluation or owner regeneration was performed.

Production components ran with synthetic responses in an isolated Expo Go preview at 375 points and extra-extra-large system text on the disposable iOS 26.4 simulator. [Targets below the week](targets-large.png) and [accepted diary values](nutrition-large.png) remained readable when scrolled into view. Explicit permission and combined acceptance taps were verified. One preview Fast Refresh hit an ExpoAsset runtime error; a normal reload recovered and final rendering passed. This does not establish physical-phone acceptance, all accessibility sizes or live coaching quality.

The [offline production Hermes export](bundle.json) matches all eight changed production/shared sources. The owned Expo server, PostgreSQL fixture and disposable simulator were stopped; temporary text size was restored. No owner Metro listener was present, so owner-controlled phone serving remains unverified.

Release and protected readback evidence will be recorded after the existing-service deployment.
