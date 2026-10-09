# Usability batch 1 verification — October 9, 2026

Production components ran in a temporary isolated Expo Go preview on the disposable iOS 26.4 simulator. All profile/intake/training responses were synthetic in-process fixtures; external requests were blocked. No owner generation, paid AI request, native build or dependency change was used.

The original keyboard behavior was reproduced before editing: opening the software keyboard left Continue underneath it. The native viewport/content-size callbacks ran before the scroll bounds settled. Re-measuring after keyboard show/hide fixes that transition. Intake bounds long answers while the keyboard is visible, and keeps earlier-answer history above the active question so expanded history does not separate question and composer.

- [Schedule question and multiline answer](keyboard-schedule.png): full question, input and Continue visible with the keyboard, without manually scrolling.
- Keyboard closing/reopening and earlier-answer editing were exercised; Save answer and Cancel edit stayed above the keyboard. A 375-point-wide preview with extra-large system text was inspected. This is a narrow preview on the existing simulator, not a separate small-device or maximum-accessibility-size certification.
- [Pending review](review.png): clear weekday headings and distinct sessions; no main navigation or workout details before acceptance.
- [Accepted Today](accepted-today.png): the synthetic server acceptance response opens Today and Today/Week/Nutrition navigation.
- [Direct second session](direct-second-session.png): tapping the second Today session opens its exact optional evening workout, retaining time range and Markdown.

Automated verification: 274 backend tests including isolated PostgreSQL, 114 mobile tests, TypeScript checks and diff checks pass. Tests cover new/summary-only/pending/failed/accepted/history roots, relaunch and past weeks, server acceptance, unknown results, account isolation, feedback preservation, hidden pending details and exact session selection. Existing generation, prompt/schema/settings, accounting, nutrition and legacy-reader tests remain green.

The temporary port-8082 Expo process, PostgreSQL fixture and disposable simulator were stopped. No owner process was stopped or restarted. At final inspection no owner Metro listener was present on port 8081. A production iOS Hermes export succeeded offline: 1,941,808 bytes, SHA-256 `6e6b8cd7a088817d107232ac59affbad1a887dafb4bdea0055e0073b366913b3`; 12 relevant source-map files exactly match repository source. This verifies built JavaScript, not an actively served phone bundle.

Phone check: start the owner's normal mobile development server, reload FitQuest, proceed through onboarding with the software keyboard, review and accept a plan, then tap a non-first Today session. Physical-phone acceptance and coaching quality remain unverified. Workout-content formatting and nutrition-target generation are separate queued batches.
