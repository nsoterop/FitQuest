# Release 2 native evidence — October 9, 2026

The disposable iOS 26.4 simulator ran the production Nutrition components in existing Expo Go 57, using synthetic fixtures and an in-process fetch stub restricted to fixture.example.test. No owner data, production mutation, paid AI request, native build or new dependency was used.

Verified diary totals and unknown-value explanations, software-keyboard composer and visible submit button, focused clarification, candidate review, supplied/AI-estimated/unknown provenance, saved-entry editing and weekly trends. Correcting a synthetic lunch multiplier from 1 to 1.5 changed the day's known calorie subtotal from 1,250 to 1,575. The calorie average remained 1,880 across three explicitly completed days; incomplete Friday, unlogged Thursday and future weekend dates were excluded. All four macro trend sections expose date/value/completeness text in the accessibility tree.

Native inspection found a partially covered composer submit button. Including the button in the measured composer fixed it; composer-keyboard.png records the correction. The diary now displays known-subtotal labels alongside incomplete totals. The shared footer, scrolling content, editable date, assumptions and correction fields remain readable in this simulator. Physical-phone, VoiceOver, additional Dynamic Type sizes and real-model estimation accuracy are not verified by these screenshots.

| State | Evidence |
| --- | --- |
| Diary | [diary.png](diary.png) |
| Composer with software keyboard | [composer-keyboard.png](composer-keyboard.png) |
| Clarification | [clarification.png](clarification.png) |
| Candidate review | [review.png](review.png) |
| Per-food provenance | [provenance.png](provenance.png) |
| Saved-entry editor | [edit.png](edit.png) |
| Weekly trend overview | [trends.png](trends.png) |
| Complete/incomplete/missing/future labels | [trend-detail.png](trend-detail.png) |

The owned temporary preview on port 8082 and disposable simulator were stopped after verification. Owner Metro PID 91062 was left untouched. Backend persistence, date moves, stale edits, delete/Undo expiry, idempotency, unknown responses, account isolation and budget outcomes are covered separately by synthetic tests; the native preview does not establish production persistence.

Phone testing after release: reload the existing app, open Nutrition (also available from the saved profile), add a manual meal with a blank nutrient, edit its date/multiplier, inspect both affected dates, mark a fully logged day complete and inspect Weekly trends. Review any conversational candidate before saving; each explicit AI send uses the existing shared allowance. Delete a test entry and use Undo within 30 seconds. Leaving the screen preserves an unfinished draft; signing out clears it. Existing training behavior is unchanged.
