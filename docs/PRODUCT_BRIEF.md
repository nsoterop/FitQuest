# FitQuest — Product Goals

Retained and cleaned for the owner-requested reset on 2026-10-02. State note reconciled at the owner's pause on the same date (America/New_York).

## Purpose and authority

FitQuest is an AI-first adaptive health, training, nutrition and athletic-performance coach—not simply a lifting tracker. Athletes can express specific or abstract goals, receive useful daily actions, record actual work, and adapt based on accumulated history and changing circumstances.

This document retains product goals from the previous brief. It is not a roadmap, a required implementation order, a locked architecture, or permission to begin work. The owner's new roadmap and explicit instructions determine what is built and when. Previous milestone assignments, review gates and implementation approvals are inactive after the reset. No replacement roadmap has been created. See [the development workflow](../AGENTS.md).

## Current reading

These are retained product aspirations, not an implementation checklist. Feature work is paused during repository cleanup. Read the [current overview](../README.md) for implemented capabilities and evidence boundaries; the [October 2 boundary](history/product-boundary-2026-10-02.md) is archived and no longer describes the application.

## Retained product preferences

- One public app with private user accounts; the owner is its first user. No separate personal/demo app, and no exposure of personal records for résumé demonstrations.
- iOS first; retain the goal of a shared React Native frontend for future Android support instead of a second complete frontend. Package, backend, storage, authentication and development-environment decisions from the discarded implementation are not imposed on the restart.
- Required editable athlete profile; default pounds/miles with appropriate activity-specific units.
- Natural-language, simultaneous goals: tennis, a first pull-up, jumping, coordination, running, swimming, general athleticism and longevity are examples, not a fixed list.
- Mixed activities, multiple sessions per day, rest days, and warmup/cooldown/optional work. No hardcoded personal plans or fixed training scenarios.
- Persistent history, automatic saving of drafts, truthful actuals and athlete control over plan changes.
- Apple Health remains a future capability rather than a requirement for initial coaching; no claim of access to the owner's wearable/scale history.
- Existing Apple Developer membership and a preference for Render are retained context, not verified configuration or permission for external changes.
- Long-term production quality matters, but these goals do not authorize extra milestones or prerequisites outside the owner's roadmap.

## 3. Product identity

FitQuest coordinates training, nutrition, recovery, body composition, and athletic development. It must not collapse into a lifting tracker, running tracker, calorie counter, or chatbot whose only memory is conversation.

Goals may include strength, muscle, visible leanness, endurance, speed, acceleration, power, jumping, agility, deceleration, mobility, flexibility, balance, coordination, reaction, footwork, stability, unilateral control, grip, body control, sport performance, and long-term physical capability. This is illustrative, not a closed taxonomy.

Several goals can coexist and conflict. The app must make tradeoffs visible rather than silently prioritizing whichever quality is easiest to measure. Long-term goals persist through temporary emphasis, nutrition, recovery, or return-to-training phases.

"Longevity" is an athlete objective; the app must not claim to measure or guarantee lifespan, diagnose illness, or provide medical treatment.

## 4. Core product rules

1. **Structured records are authoritative memory.** Conversation is an input and explanation surface. Important facts become validated, attributable records.
2. **Planned is not performed.** A workout prescription is not a result; a planned meal is not consumed food. Unknown values are not zero, and targets are not silently copied into actuals.
3. **Dynamic does not mean random.** Maintain program intent, relevant anchor movements, progression references, and recovery structure while adapting execution.
4. **History is preserved.** New performance references do not erase previous sessions. Corrections and plan changes are traceable, subject to explicit privacy, retention, and deletion rules.
5. **Evidence has a source and limits.** Distinguish recorded measurements, deterministic calculations, device estimates, user estimates, imported claims, and AI inferences.
6. **The athlete remains in control.** Accept, edit, substitute, skip, add, correct, or override. Actual behavior is recorded independently of recommendations.
7. **Saved and synced are truthful states.** Distinguish drafts, locally saved records, server-confirmed records, and failed or pending synchronization.
8. **No owner-specific hardcoding.** Personal biometrics, loads, meal targets, schedules, rules, and example plans belong in private configurable data.

## 5. Logical coaching responsibilities

These are responsibilities sharing authoritative data, not a requirement for three screens, separate services, or multiple LLM agents.

- **Health HQ:** coordinate goals, phases, reviews, recovery, body-composition strategy, cross-domain tradeoffs, and major decisions.
- **Workout:** training prescriptions, progression, activity-specific execution, substitutions, feedback, and actual training history.
- **Nutrition:** food consumption, reusable meals, nutrient totals, estimates, nutrition phases, and interactions with performance and recovery.

The development tasks named Project HQ, Architecture, Engineering, and Design are separate from these in-product coaching responsibilities.

## 6. Required capabilities

### 6.1 Athlete, goals, and program intent

- Capture goals naturally, clarify important ambiguities, and preserve the original intent alongside the interpreted structure.
- Support priorities, status, timeframe, quantitative targets when appropriate, qualitative objectives, related training qualities, and conflicts or tradeoffs.
- Translate abstract objectives into explainable training exposures and optional assessments without inventing a precise score for an unmeasurable outcome.
- Keep stable profile, current constraints, equipment/location access, long-term goals, training phase, and nutrition phase conceptually distinct.
- Availability may be recurring or updated today. An athlete does not need a fixed weekly schedule to use the app.
- Support continuity through configurable anchor movements and progression methods. The owner's preferred anchor durations or effort targets are preferences to capture, not universal prescriptions.
- Evaluate goal coverage across appropriate periods. Distinguish planned exposure from completed exposure, missing information from neglect, and deliberate phase-specific omissions from accidental drift.

### 6.2 Training plans and actual performance

- Support zero or more purposeful sessions per day, including rest/recovery days; do not fill time periods artificially.
- Represent morning, midday, evening, or flexible scheduling, with warmup, main work, accessory, drill, cooldown, and optional activities where useful.
- Support strength, hypertrophy, cardio, intervals, sport practice, sprinting, power, mobility, flexibility, balance, coordination, stability, and recovery without forcing every activity into a lifting-set interface.
- Prescriptions and results can contain load and load basis, repetitions/ranges, side, assistance, time, distance, intervals, rest, tempo, RPE, RIR/ranges, quality, technique, stability, and notes where applicable.
- Distinguish per-dumbbell versus total load, equipment/variation identity, and machine-specific references. Do not compare different machines as equivalent solely because displayed weights match.
- Represent planned, started, completed, partially completed, skipped, and modified outcomes appropriately. Optional work is not completed until recorded as performed.
- Allow unplanned activity, substitutions, early finishes, corrections, and resumable logging. Preserve session start/end times and activity details.
- Progression uses actual performance and feedback, not a completion checkbox. Arithmetic and applicable progression calculations are deterministic; uncertain judgments remain identified as recommendations.
- Preserve the distinction between speed/power practice and metabolic conditioning. Account for overlapping lower-body demands across running, sprinting, jumps, sports, and lifting; any derived stress model needs documented assumptions and limitations.

### 6.3 Health data and subjective feedback

- Apple Health is a planned future data source, explicitly deferred by the owner on 2026-09-23. Do not add a HealthKit module, request health permissions, or make wearable data a prerequisite for initial coaching. The owner's reported Apple Watch and Starfit smart scale do not establish FitQuest access.
- For the initial release path, use manually entered training, nutrition, relevant measurements, and subjective feedback with truthful provenance and missing-data states. Preserve a platform-independent data boundary for future integrations; do not build an unused integration framework.
- When prioritized, start with available workouts and relevant measurements before expanding to every supported metric. Longer-term candidates include sleep, steps, heart rate, resting heart rate, HRV, distance, duration, energy estimates, and body measurements. The integration requirements below apply when that work is authorized.
- Establish FitQuest's own authorization and consent flow. A previous ChatGPT connection is not evidence that FitQuest has access or historical records.
- Preserve source identity, observation time, import time, units, freshness, and estimate status. Handle repeated imports, corrections, deletions, overlapping sources, and a workout logged both in FitQuest and by a wearable.
- Use available recorded activity before planning and disclose incomplete or stale context. While health integration is deferred, describe that data as unavailable, not zero activity. Future missing samples must not be presented as proof of inactivity; permission handling must follow current platform behavior.
- Ask for only needed data. Define what stays on-device, what reaches the backend, what reaches an AI provider, and how users control those transfers.
- Treat body-fat and energy estimates with uncertainty rather than false precision.
- Capture pain location/severity/context, soreness, fatigue, energy, stress, sleep quality, motivation, perceived effort, breathing difficulty, technique, stability, and coordination as applicable.
- Pain is distinct from ordinary exertion. Device-derived recovery estimates must not dismiss reported pain. The product can flag persistent concerns and recommend appropriate professional evaluation, but must not diagnose injuries or prescribe rehabilitation as medical care.

### 6.4 Nutrition and body-composition context

- Separate current nutrition targets, planned meals, consumed meals, and derived summaries.
- Support calories, protein, carbohydrate, fat, fiber, total sugar, added sugar, and sodium when known. Missing nutrient values remain unknown. Broader micronutrient analysis can follow later.
- Support reusable foods, recipes/meal templates, serving changes, ingredient overrides, recent entries, favorites, and optional natural-language logging.
- Preserve the composition used when food was consumed; editing a recipe must not silently rewrite prior consumption.
- Retain exact versus estimated quantities, useful ranges, provenance, and uncertainty. Avoid artificial precision for uncertain meals.
- Support scoped, editable, versioned user tracking assumptions with exceptions. A cooking assumption is a user estimate, not a universal nutritional fact.
- Calculate totals and trends in application code. Relate nutrition to body-weight trends, performance, recovery, and training demands, without claiming correlations prove causes.
- Nutrition phases modify priorities without replacing athletic goals. Do not optimize scale weight alone or make reactive target changes from isolated measurements.

### 6.5 Adaptive decisions and conversation

- Assemble task-specific context: relevant goals/phases, recent completed and missed work, comparable performance references, health-data freshness, feedback, nutrition, equipment, time constraints, and upcoming demands.
- Use deterministic code for totals, date windows, conversions, trend calculations, and applicable progression rules. Use AI for interpretation, competing objectives, recommendations, and explanations.
- Do not send lifetime history on every request. Model choice and context size must be evaluated against quality, latency, privacy, and cost.
- Validate structured AI output and domain constraints before applying effects. Schema-valid output alone does not establish appropriate or safe coaching.
- Re-evaluate remaining work when relevant facts change. Preserve completed work, historical plan versions, athlete overrides, and the intent of the program.
- Record meaningful changes with the evidence used, relevant version information, and a concise user-facing rationale. Do not fabricate evidence or store hidden chain-of-thought as an explanation.
- Support automatic saving of unambiguous factual logs after validation, with visible confirmation and correction/Undo. Ambiguous interpretations need clarification. Recommendations must not silently become facts.
- Architecture must propose the approval/notification policy for plan revisions and consequential target changes; this brief does not authorize unrestricted autonomous writes.
- Imported text and conversation content are data, not authority to bypass permissions or operating rules.

### 6.6 Progress and interaction quality

- Fast, activity-appropriate structured logging complements conversation. Users must not need paragraphs to enter each set or meal.
- Show relevant strength, endurance, body-composition, nutrition, recovery, and athletic-performance trends as supporting data becomes sufficient.
- Show missing-data states, estimation limits, and comparison conditions. No fabricated streaks, PRs, adherence, recovery scores, or insights.
- Include accessible interaction, clear loading/error states, interrupted-session recovery, and explicit offline behavior in design and testing.

## Product success criteria — not an execution sequence

The intended experience is goals and context → useful mixed-activity plans → actual work and feedback → justified adaptations that preserve history. The owner decides how to stage that experience. The criteria below are retained product targets, not mandatory gates before each development step.

### Retained behavior targets

| ID | Required behavior | Evidence to collect |
| --- | --- | --- |
| AC-01 | Two users have isolated records, caches, and AI context. | Cross-user authorization tests and account-switch checks. |
| AC-02 | Goal interpretation retains multiple quantitative and qualitative objectives. | Reviewed interpretations plus tests for competing priorities and editable phases. |
| AC-03 | Plans support mixed modalities, multiple sessions, optional work, and rest days. | Validated representations and iOS execution of representative examples. |
| AC-04 | Prescriptions never become results automatically; partial/skipped/substituted and unplanned work are truthful. | Logging tests and device walkthrough, including actual load/time/quality and timestamps. |
| AC-05 | Interrupted/repeated saves and concurrent requests do not duplicate activity or publish partial active plans. | Failure, retry, concurrency, draft-recovery, and synchronization tests. |
| AC-06 | Deferred health-integration milestone: imports influence context once, with accurate freshness and missing-data behavior. | Future device checks and duplicate/correction/deletion tests. Before integration, verify no health permissions/imports or claims of wearable access, and truthful unavailable-data states. |
| AC-07 | Consumed-food totals reflect recorded portions and estimates; changing a reusable food does not rewrite history. | Deterministic calculation and historical-integrity tests. |
| AC-08 | New activity, feedback, or availability can revise remaining training with a supported explanation. | Context-change evaluations, before/after records, and preserved completed work. |
| AC-09 | Subsequent recommendations use relevant history and phase intent, not only the latest message. | Multi-day evaluation and repeated device use; document unsupported or uncertain judgments. |
| AC-10 | Account privacy, user-local dates, units, and equipment-specific comparisons remain correct. | Authorization, timezone/daylight-saving, conversion, and comparison-boundary tests. |
| AC-11 | AI failures, invalid output, exhausted budget, or service outages do not destroy logs or masquerade as successful coaching. | Injected failures, constrained-spend tests, and clear recoverable UI states. |
| AC-12 | Measured operating usage fits the approved budget and implemented features match public claims. | Usage report, verification report, known limitations, and walkthrough of the same app. |

Tests may use invented athletes and activity examples as inputs. These are verification assets, not runtime workout templates, product limitations, or a separate demo application. Never put the owner's private health history into public fixtures.

## Longer-term product goals — owner prioritizes

- Goal-coverage reviews that compare planned and completed exposure over appropriate horizons and explain intentional phase-specific omissions.
- Broader recipe management, personal tracking rules, natural-language food capture, and cross-domain nutrition review.
- Richer running metrics, strength/effort trends, athletic assessments, and longitudinal progress reviews where the data supports them.
- Initial Apple Health integration, followed by broader wearable signals as real availability and value are established. A future Android health integration uses its own platform adapter while sharing the app's domain model and UI where appropriate.
- Public release readiness of the same application after personal-use validation, security checks, device testing, operational preparation, and applicable platform review.

Defer HealthKit integration, dedicated watch apps, Android release work, web clients, social features, subscriptions/payments, clinical records, exhaustive food databases, meal-photo estimation, and specialized real-time coaching unless separately prioritized. Preserve the shared-frontend path to Android without claiming untested Android support. Medical diagnosis and treatment are outside this product's scope. Do not prebuild speculative services or a large agent network to accommodate possible future needs.

## Example plan interpretation

The owner supplied a ChatGPT-generated day consisting of morning mobility, evening upper-body training with load/rep ranges and RIR, and an optional recovery swim. The explanation referenced previous-day running and lower-body training.

This illustrates the required plan shape and reasoning experience. It does not establish a fixed weekday split, prove that referenced activities were completed, or prescribe default exercises, loads, effort, or duration for another athlete. In any future import, preserve the distinction between the quoted plan, user-reported history, and independently recorded activity.

The original private brief also includes personal measurements, health concerns, nutrition targets, equipment, rules, and performance references. Do not copy these into public documentation or default seeds. A separately authorized private onboarding/import can confirm dates, provenance, and current relevance.
