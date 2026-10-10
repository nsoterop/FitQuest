# Release 3 native verification — October 9, 2026

> Historical implementation and synthetic verification evidence from October 9, 2026. Later releases may supersede behavior described here. See the [current overview](../../README.md) and [release archive](../history/README.md); these results were not rerun during documentation cleanup.

Production components ran in an isolated Expo Go preview on the existing disposable iOS 26.4 simulator. Synthetic in-process responses had no production credentials, food records or AI dispatch. No native build or dependency was added.

- Library list and recipe detail: [library](library.png).
- Half serving: 240 kcal from a 1,920-kcal batch yielding four servings; 1.5 servings showed 720 kcal before explicit consumption confirmation: [half serving](half-serving.png).
- Native ingredient amount editing with the software keyboard: [keyboard](ingredient-keyboard.png). Changing oil from two base portions to one made the new recipe 440 kcal per serving.
- Earlier 480- and 720-kcal diary entries still totaled 1,200 after the recipe edit. The original entry retained version 1, yield 4 and original ingredient factors: [history](historical-entry.png). Base portion labels distinguish ingredient reference amounts from consumed servings.
- Saving that consumed meal added a separate reusable library item with a no-additional-food receipt: [saved meal](saved-meal.png).

The owned preview on port 8082, isolated PostgreSQL and disposable simulator were stopped after checks. Owner Metro PID 91062 was left untouched. Rendered flow tests additionally cover account draft cleanup, fractional log requests and unknown-result/reopen recovery.

Phone acceptance remains unverified. Reload FitQuest, open Nutrition → Saved meals & recipes, create a recipe with ingredient base portions and batch yield, review half or multiple servings and explicitly confirm consumption. Editing the saved recipe should leave prior diary entries unchanged. VoiceOver and additional text sizes were not newly verified in this release. No live nutrition-estimation accuracy claim is made.
