# Workout table and synced units — verification

The owner assigned the table layout, removal of row unit/Done/restore-set controls, short recommendation lines, inline completion-only instructions and a cross-device account weight-unit preference. Source `33423d1` passed [exact-source CI](https://github.com/nsoterop/FitQuest/actions/runs/40383950916). [Release record](../../../releases/2026-10-26.md#table-layout-and-synced-weight-units) records the applied migration, Live API and compatible preview OTA. [Implementation and rollout boundary](../../../../reference/workout-logging-implementation.md#table-layout-and-account-wide-weight-units).

Local checks passed: 201 mobile tests, 351 backend tests with isolated disposable PostgreSQL, five installer checks, seven repository checks, format/lint/types, Expo compatibility and the dependency advisory gate. Existing reviewed node-forge exception remains unchanged; no dependency was added. Private scoped/committed and full-history CI secret scans passed; scanners are not exhaustive security clearance.

Normal-text native checks used a finite offline bundle of the actual components, a copied cached Release simulator host (`com.fitquest.rebuild`) and a disposable iPhone 17 Pro/iOS 26.4 simulator. Synthetic-only exercises, account and fetch responses were used; no real Auth, hosted records or AI were involved. The final fixture uses the production Page/SafeArea geometry; an earlier extra test banner was removed from above the keyboard-adjusted container to avoid a fixture-only occlusion. No production scrolling behavior was changed to compensate for that banner. The host differs from device-signed build 5.

- [Compact table, editable blue suggestions and retained input](compact-table.png)
- [Focused weight input above the software keyboard, without Done](table-weight-keyboard.png)
- [Short recommendations and complete warmup instructions](workout-recommendations-warmup.png)
- [Largest-standard-text table](large-table.png)
- [Largest-standard-text focused input above keyboard](large-table-keyboard.png)

Native actions verified 20 → 25 input editing, tapping the exercise title to dismiss the keyboard, minus/plus without restore buttons, unknown load remaining blank, and account-setting conversion of a 20 lb recommendation to 9.07 kg. A fresh server/client and lost-response readback are covered by component/database tests, not by real-device synchronization. After unlocking the Mac, the largest standard Dynamic Type check verified all three columns, focused input above the software keyboard and tap-outside dismissal. A focused regression reserves horizontal scrolling for larger accessibility text; full accessibility-size coverage remains unverified. Actual phone OTA launch and comprehensive VoiceOver/accessibility-size acceptance remain unverified.

The EAS preview-environment native fingerprint remains `3500763d3c624db350764adaff2dac94a933129f`, matching existing build 5. No native build, paid AI or development server was started. The owner separately approved the additive migration and rollout. Hosted `20261026182728` has matching recorded source SQL, forced RLS and owner-only policies; a restricted TLS transaction verified privileges and zero-row access without returning user records. API source `33423d1` is Live and public health/auth/no-store checks passed. OTA group `70c30c7b-9228-4702-b8aa-eb9ef0de2236` / update `01a179a7-ea6b-7ce7-9d01-4ff137deffc9` returned for build 5's runtime/channel. All 76 files (2,180,634 bytes) matched manifest hashes; launch SHA-256 `2b4bb35d81b8ae86205c9c79aa26f38958459d185e06cfdd357683a001a3f7e5` matches the locally verified export. Private generated asset authorization and environment values are excluded. EAS reported usage within included limits and zero overage cost. Existing user records, saved plans, Auth, consent, source snapshots, receipts and accounting remain intact.

The disposable simulator was stopped and deleted, and the ignored entry was removed. No development server or owner process was changed. Native fixture restarts reset the synthetic server; no real-server persistence claim is made from those restarts.

- [Live API at the verified source](render-live.png)
- [Sanitized counts, migration and artifact checks](checks.json)
