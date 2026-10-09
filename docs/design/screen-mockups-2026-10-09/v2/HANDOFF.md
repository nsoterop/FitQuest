# FitQuest · Design study 02

Proposed visual direction for owner review, 9 October 2026. This responds to the request for less generic, more professional screens and explicit nutrition concepts. All athlete, workout and food content is synthetic. No application implementation, service, account, private record or production plan was changed. The earlier design study remains intact.

## Review the work

Open `index.html` locally. It needs no server, dependency install, login or network. The outside-phone menu opens eight screens: Today, Week, Workout, Food diary, Weekly macros, Add meal, Plan review and Intake. Phone navigation connects the main screens. Nutrition submission updates the preview in memory only; reload discards it. `previews/training-board.png` and `previews/nutrition-board.png` provide the principal visual comparison; individual and full-scroll PNGs are alongside them. `styles.css`, `app.js` and `tokens.json` are editable design sources, not React Native implementation.

## Research and design interpretation

Official sources were reviewed on 9 October 2026. The Hevy and MacroFactor screenshots were visually inspected. The following design decisions are our interpretation, not research findings about FitQuest users.

| Reference | Observed pattern | FitQuest application |
| --- | --- | --- |
| [Hevy: workout logging](https://www.hevyapp.com/features/track-workouts/) | Compact exercise rows, aligned values, action priority and local context within a session. | Stronger workout hierarchy, numbered prose sections, clear duration and ordered sessions. FitQuest does not inherit unimplemented tracking controls. |
| [Runna: app navigation](https://support.runna.com/en/articles/10473504-your-quick-guide-to-navigating-the-runna-app) | A focused Today destination alongside a full-plan destination. | Preserve Today and Week; make Nutrition a third destination rather than embedding the whole diary in Today. |
| [MacroFactor: dashboard](https://macrofactor.com/dashboard-customization/) | A prominent daily summary with detailed nutrition views below it. | One clear daily calorie total, three named macros and a separate meal list; no invented calorie budget, progress ring or target. |
| [MacroFactor: weekly averages](https://help.macrofactorapp.com/en/articles/18-view-weekly-nutrition-averages) | Nutrient-specific averages and inspection of daily values. | Three aligned macro charts with visible grams, a stated average denominator, explicit partial-day treatment and a text table. |

The revised style removes the repeated soft-green cards from the first study. White and graphite carry the interface; cobalt identifies interaction, and lime is confined to the featured training surface. Narrower corner radii, fine dividers, aligned metadata and deliberate type scale replace decorative panels. The simple line motif is original CSS geometry, not a copied brand asset. No competitor imagery or assets are embedded in the deliverables.

## Navigation and behavior

**Today → session → workout:** each scheduled session remains distinct. The featured example now starts with the first session in saved order. The addendum also shows user-selected focus. Never infer completion, parse timing prose, or favor a modality to select it. Past selected days use their actual date rather than the heading Today. All sessions remain reachable. Week preserves Monday–Sunday, rest days, flexible timing, optionality, ranges and long titles.

**Review → Use this plan → Week:** review contains no workout prose. Acceptance reveals the saved workout content and does not imply another generation request. Unsent revision feedback blocks acceptance in the prototype. Existing stale-revision, failure and unknown-outcome behavior remains binding; this visual pass does not replace the first study's detailed state design. Intake retains the five existing questions. The full companion onboarding prototype now includes all five questions, prior-answer editing, profile/account entry, disclosure, generation and recovery views; see `ONBOARDING.md` and `onboarding.html`.

**Nutrition → Food diary / Weekly trends:** the diary shows consumed food, not suggested meals. Calories and macros are logged totals, not goals or recommendations. A clear Add meal control sits beside the meal list. Meal rows retain timing and portions; tapping a row reveals the example nutrient source/values. The weekly view uses three comparable zero-baseline charts on the same 0–300 g scale, with exact values printed above bars. It does not claim a performance or health effect from the displayed pattern.

**Add meal → diary:** manually enter meal name, meal category, time eaten, and portion. Calories and macro grams are optional values for that consumed portion. Blank values remain unknown. Estimates are labeled. Submission adds one synthetic entry in memory and recalculates known totals; it does not claim real persistence. Values are not inferred from the meal name. No scanner, food database, photo AI, automatic lookup or paid interpretation is implied.

## Nutrition defaults recommended for HQ review

- Keep Nutrition as the third main destination; use Food diary and Weekly trends as views within it.
- Start with explicit manual capture, not an extra nutrition onboarding interview. Date defaults to the selected diary day. A real implementation needs an editable local date as well as time; this prototype uses the shown example date.
- Unknown nutrient values never become zero. Show known subtotals with an incompleteness label. Preserve quantity, consumed portion, estimate/source and the composition at the time of entry.
- Use grams for protein, carbohydrate and fat and kcal for energy. No macro targets are proposed here; targets remain separate from consumption and require their own assigned product decision.
- For averages, count only days the athlete explicitly considers fully logged and that contain the relevant nutrient data. Do not infer a complete day from midnight passing. The example has four synthetic completed logging days; Friday is partial and Saturday/Sunday are future. Missing past days should say “Not logged,” not zero. A date with unknown nutrients remains incomplete for that nutrient's average.
- Include a direct way to mark/reopen daily logging completeness, edit an entry and undo a deletion in the eventual flow. Those controls, historical date browsing, favorites and reusable recipes are not built by this visual prototype. Do not silently change historical entries when a reusable recipe changes.
- Preserve a meal draft on navigation or failure in the actual application; decide the supported local durability and sync behavior with Architecture. “Added,” “Saved on this device,” and “Synced” must follow real acknowledgments. The prototype intentionally only says “Meal added to this preview.”

Nutrition is a proposed design expansion authorized by the latest design request. It does not change the current Engineering assignment or authorize nutrition backend/API/schema implementation. HQ owns feature scope and acceptance; Architecture owns data and recovery contracts. No new roadmap or release prerequisite is introduced.

## Reusable direction and accessibility

`tokens.json` records colors, spacing, type sizes, radii, contrast checks and the small component family. Use the native system font. Keep primary controls at 52 pt and effective touch targets at least 44 pt. Repeated rows are full-width targets. Preserve Dynamic Type and native keyboard behavior rather than forcing text into fixed heights. Large text may scroll vertically; no essential labels should truncate.

Each macro is named and has a printed gram value; color is supplementary. The partial-day pattern and future-day dash have explanatory text. A data table supplies the chart's text alternative. Body/secondary/action colors pass 4.5:1 on white in the calculated palette. Native VoiceOver, real keyboard, Dynamic Type, reduced motion, dark-mode adaptations and physical-device performance remain unverified. The browser mockup's system bars are illustrations.

## Verification

`qa.json` records focused checks: eight primary screens render without runtime errors or external requests; seven saved days stay visible; review hides workout detail; acceptance reveals saved detail; manual meal entry updates totals; missing nutrients remain explicit; five-question progression works; eight screens fit 320 px at 125% text without horizontal overflow. Training and nutrition boards were visually inspected and corrected after rendering. No local server was started; the isolated screenshot browser closes in `finally`.

Owner review requested on visual direction and the three nutrition concepts. These are mockups, not a claim of production implementation or phone acceptance. No Figma or other external design file was modified.

## Onboarding addition

The missing onboarding screens are now included in `onboarding.html`. See `ONBOARDING.md`, `onboarding-qa.json`, and the three `previews/onboarding-*-board.png` review boards. This extends the same visual direction without changing the training or nutrition screens.

## Bounded gap addendum

See `addendum/README.md` and `addendum/index.html` for account/profile access, training recovery, conversational consumed-food entry, saved meals/recipes, diary edits/deletion/Undo and explicit day-completion averages. Its resolved interaction rules supersede the earlier open nutrition defaults where they overlap. Navigation is consistently Today / Week / Nutrition; the core-release preview has Today / Week only until nutrition works. Local HTML only, with synthetic content and no production changes.
