# Workout table and synced units — verification

The owner assigned the table layout, removal of row unit/Done/restore-set controls, short recommendation lines, inline completion-only instructions and a cross-device account weight-unit preference. Source publication and hosted migration/API/OTA delivery are recorded separately from implementation. [Implementation and rollout boundary](../../../../reference/workout-logging-implementation.md#table-layout-and-account-wide-weight-units).

Local checks passed: 201 mobile tests, 351 backend tests with isolated disposable PostgreSQL, five installer checks, seven repository checks, format/lint/types, Expo compatibility and the dependency advisory gate. Existing reviewed node-forge exception remains unchanged; no dependency was added. Private scoped secret scans and exact-source CI are checked at publication; scanners are not exhaustive security clearance.

Normal-text native checks used a finite offline bundle of the actual components, a copied cached Release simulator host (`com.fitquest.rebuild`) and a disposable iPhone 17 Pro/iOS 26.4 simulator. Synthetic-only exercises, account and fetch responses were used; no real Auth, hosted records or AI were involved. The final fixture uses the production Page/SafeArea geometry; an earlier extra test banner was removed from above the keyboard-adjusted container to avoid a fixture-only occlusion. No production scrolling behavior was changed to compensate for that banner. The host differs from device-signed build 5.

- [Compact table, editable blue suggestions and retained input](compact-table.png)
- [Focused weight input above the software keyboard, without Done](table-weight-keyboard.png)
- [Short recommendations and complete warmup instructions](workout-recommendations-warmup.png)
- [Largest-standard-text table](large-table.png)
- [Largest-standard-text focused input above keyboard](large-table-keyboard.png)

Native actions verified 20 → 25 input editing, tapping the exercise title to dismiss the keyboard, minus/plus without restore buttons, unknown load remaining blank, and account-setting conversion of a 20 lb recommendation to 9.07 kg. A fresh server/client and lost-response readback are covered by component/database tests, not by real-device synchronization. After unlocking the Mac, the largest standard Dynamic Type check verified all three columns, focused input above the software keyboard and tap-outside dismissal. A focused regression reserves horizontal scrolling for larger accessibility text; full accessibility-size coverage remains unverified. Actual phone OTA launch and comprehensive VoiceOver/accessibility-size acceptance remain unverified.

The EAS preview-environment native fingerprint remains `3500763d3c624db350764adaff2dac94a933129f`, matching existing build 5. No native build, paid AI or development server was started. The additive migration is tested locally but requires the release plan's separate hosted approval before API/OTA rollout. Existing user records, saved plans, Auth, consent, source snapshots, receipts and accounting remain intact.

The disposable simulator was stopped and deleted, and the ignored entry was removed. No development server or owner process was changed. Native fixture restarts reset the synthetic server; no real-server persistence claim is made from those restarts.
