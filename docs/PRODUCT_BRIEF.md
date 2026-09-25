# FitQuest — Product Brief

Version: 0.4\
Date: 2026-09-25\
Owner: Project HQ\
Status: Product requirements and core stack approved for the clean rebuild. React Native replaces the initial Swift proposal; Apple Health integration is deferred. Detailed decisions and approval boundaries are recorded in DECISIONS.md. Release dates are not committed.

## 1. Purpose and authority

FitQuest is an iOS-first, AI-powered adaptive health and performance coach. It translates an athlete's specific and abstract goals into useful daily actions, learns from accumulated real-world records, and explains meaningful adjustments.

The central question is: **Given this athlete's goals, history, nutrition, recovery, available health data, equipment, and current circumstances, what is the most useful thing to do next?**

This brief is the product source of truth for the clean rebuild. It supersedes conflicting product assumptions in the existing README, architecture document, data-model document, and prototype. Those files remain historical references, not approved rebuild designs. Explicit later owner decisions take precedence and should be reflected here.

The owner's detailed source brief included instructions to extend the old project. The owner explicitly chose a restart; that decision takes precedence. Preserve the old code and deployment until a separately approved transition. Local rebuild work may proceed within scoped handoffs; this does not authorize deletion, deployment, hosted infrastructure changes, or remote migrations.

## 2. Confirmed constraints

- **Owner checkpoint before AI implementation (2026-09-25):** before adding any product AI functionality or supporting AI integration/prompt/evaluation code, HQ must stop, explain the intended scope, data/privacy flow, provider/model choices, costs/limits and safety/acceptance plan, and wait for fresh explicit approval. Broad earlier approvals do not waive this gate. It applies to AI-assisted goal interpretation as well as coaching, regardless of milestone. Ordinary AI-assisted software development is unaffected; see D-019 in DECISIONS.

- Build **one public iOS application**, with the owner as its first real user. Other users access the same product through their own private accounts.
- Do not create a separate personal app, demo app, or mandatory demo mode. Screenshots and a walkthrough of implemented features can support a résumé without exposing personal records.
- Public availability does not make athlete data public. Account isolation is required even during owner-only validation.
- iOS is the only initial release platform. Android is a long-term product direction: use a shared React Native frontend rather than planning a second frontend. Android integration, testing, and release remain future work.
- Default displayed training units are pounds and miles. Preserve explicit units and appropriate precision; domain-specific displays such as seconds or swimming distances must remain usable.
- Athlete profile setup is required. Profiles, schedules, equipment, goals, targets, and preferences are editable data, not application constants.
- On 2026-09-24, the owner removed the original **$40/month ceiling as a constraint on Render hosting**. This is not unlimited AI-spend or paid-service-change approval. Confirm the app-AI allowance and a current hosting estimate before commitments; retain spend controls and usage reporting. The owner already has an Apple Developer subscription; no new enrollment purchase is required. Confirm treatment of future renewal and other costs before commitments.
- The owner reports an existing Render deployment costing $7/month and prefers Render unless a justified alternative fits better. Its present configuration, health, billing, and data have not been verified for the rebuild.
- Approved core direction: React Native with TypeScript and Expo, SQLite for scoped local persistence, a TypeScript/Fastify API, PostgreSQL for synchronized records, Render as the intended host, and Sign in with Apple for initial iOS authentication. These are explicit rebuild choices, not approval of the prototype implementation. Package versions, app AI model, detailed auth implementation, and service configuration still require verification.
- Apple Health integration and any HealthKit-specific native module are deferred. Initial coaching uses manual records and subjective check-ins, without claiming access to wearable or scale data.
- Never assume credentials, provider availability, migrations, deployment state, or previous test results are current. Never expose secrets or change hosted resources without explicit approval.

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

## 7. First adaptive-coach milestone — product target

**Outcome:** An athlete can establish their goals and current context, receive a coherent multi-session day, log actual activity and basic nutrition, and get a justified revision based on new evidence.

Build this in manageable increments tracked in ROADMAP.md. Only a scoped active handoff authorizes implementation of an increment:

1. Required profile and natural-language goal clarification; editable phases, equipment, availability, and relevant baselines.
2. Durable training records, basic consumed-food entries/reuse and nutrient totals, and subjective check-ins.
3. Task-specific context assembled from manual records, structured plan generation, activity-appropriate logging, and persisted plan revision with evidence-linked rationale. Health integration is not a dependency.
4. A repeat-use check across several days demonstrating that accumulated records affect subsequent recommendations and preserve progression continuity.

This is a bounded implementation slice of the multi-domain product, not permission to reduce FitQuest to a static workout generator. Basic nutrition participates early; Apple Health is a later enhancement. The initial local foundation and durable-logging increments are not themselves the finished adaptive coach.

### Acceptance criteria — not yet verified

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

## 8. Product-wide direction beyond the first slice

- Goal-coverage reviews that compare planned and completed exposure over appropriate horizons and explain intentional phase-specific omissions.
- Broader recipe management, personal tracking rules, natural-language food capture, and cross-domain nutrition review.
- Richer running metrics, strength/effort trends, athletic assessments, and longitudinal progress reviews where the data supports them.
- Initial Apple Health integration, followed by broader wearable signals as real availability and value are established. A future Android health integration uses its own platform adapter while sharing the app's domain model and UI where appropriate.
- Public release readiness of the same application after personal-use validation, security checks, device testing, operational preparation, and applicable platform review.

Defer HealthKit integration, dedicated watch apps, Android release work, web clients, social features, subscriptions/payments, clinical records, exhaustive food databases, meal-photo estimation, and specialized real-time coaching unless separately prioritized. Preserve the shared-frontend path to Android without claiming untested Android support. Medical diagnosis and treatment are outside this product's scope. Do not prebuild speculative services or a large agent network to accommodate possible future needs.

## 9. Architecture and operational guardrails

- Prefer clear domain boundaries and the smallest practical deployment footprint. Follow the approved core stack in DECISIONS.md; Architecture owns detailed contracts and technical tradeoffs. This brief is not a database schema.
- Account for authenticated access, local persistence, offline logging, recoverable synchronization, atomic effects, duplicate-safe retries, concurrent revisions, and migrations from the first implementation.
- Keep model credentials server-side, authorize every data operation, minimize third-party disclosure, and redact sensitive telemetry. Explain consent, export, retention, correction, and deletion behavior.
- Version relevant prompts/configuration and output contracts. Use representative AI evaluations for grounding, constraint adherence, progression continuity, balanced goals, pain handling, and uncertainty—not only successful parsing.
- Define separate development/test and live data boundaries. Tests must not reach production by accident. Use synthetic test data and least-privilege tools.
- Establish reproducible setup, scoped CI checks, dependency discipline, observability, backup/restore verification, and a release/recovery process proportional to actual risk.
- Enforce request and spend controls. When generation cannot proceed, preserve logging and existing plans and state the limitation honestly. Development evaluations count toward the operating AI allowance unless separately funded.
- Obtain current provider pricing and calculate total operating costs, including any temporary overlap with the old deployment. A free tier is a documented tradeoff, not an availability or durability guarantee.

## 10. Example plan interpretation

The owner supplied a ChatGPT-generated day consisting of morning mobility, evening upper-body training with load/rep ranges and RIR, and an optional recovery swim. The explanation referenced previous-day running and lower-body training.

This illustrates the required plan shape and reasoning experience. It does not establish a fixed weekday split, prove that referenced activities were completed, or prescribe default exercises, loads, effort, or duration for another athlete. In any future import, preserve the distinction between the quoted plan, user-reported history, and independently recorded activity.

The original private brief also includes personal measurements, health concerns, nutrition targets, equipment, rules, and performance references. Do not copy these into public documentation or default seeds. A separately authorized private onboarding/import can confirm dates, provenance, and current relevance.

## 11. Current baseline and collaboration

The existing repository is a prototype, not the clean rebuild. The prior audit found an Expo/React Native mobile app, Fastify API, shared TypeScript contracts/domain models, SQL migrations, goal interpretation, daily-plan generation, and mixed-activity logging paths. It also found incomplete adaptation, misleading demonstration behavior, and data-integrity/test-coverage gaps. Nutrition and HealthKit have conceptual/schema placeholders, not completed workflows.

At brief creation, Git has no commits or remote and existing project files are untracked. No application code, infrastructure, data, or old documentation was replaced to create this brief. Previous passing checks are historical evidence only; none establish current deployment or rebuild readiness.

- **Project HQ:** product scope, priorities, acceptance, coordination, and shared status.
- **Architecture:** technical proposals, boundaries, data semantics, security, AI design, and decision records. No broad feature implementation without a scoped approval.
- **Engineering:** approved implementation, tests, debugging, integration, and migration execution within authorized environments.
- **Design:** approved interaction patterns, accessibility, design system, screens, and scoped UI work.
- **Independent review when needed:** verify a bounded change against requirements and evidence; review is not a replacement for tests or owner approval.

Use scoped handoffs with relevant requirements, starting state, file ownership, non-goals, acceptance criteria, and verification. Serialize edits or use isolated worktrees after a committed baseline exists. Shared files must have a clear integration owner.

PROJECT_CONTEXT.md, ROADMAP.md, DECISIONS.md, DESIGN_SYSTEM.md, and HANDOFF.md are the cross-task source of truth. Read them before work and distinguish approved choices, proposals, implementation, and verification. Project HQ maintains shared status; other tasks return evidence for HQ to integrate.

## 12. Current execution gate

The initial Architecture proposal is complete. Its Swift/SwiftUI and early HealthKit recommendations are superseded by the owner's React Native and health-deferral decisions. Its remaining recommendations are not blanket-approved policies.

The bounded local foundation and its simulator development-workflow follow-up are completed and accepted. M1's Architecture recovery baseline is reviewed, and the owner approved the initial Design direction and offline-access policy. [M1a durable local logging](ENGINEERING_M1A_HANDOFF.md) is the first authorized Engineering implementation slice; only its bounded scope is approved. Follow [HANDOFF.md](HANDOFF.md) for current dispatch/ownership/evidence; do not restart the completed foundation task or treat approval as passing runtime tests. Real authentication, backend synchronization, and the adaptive coach remain later work. No AI model, privacy-retention schedule, automatic replan policy, remote migration, hosted change, or public launch is approved by this local implementation decision.
