# Workout logging verification — October 26, 2026

Application source `2b4f83b` passed [exact-source CI](https://github.com/nsoterop/FitQuest/actions/runs/40361888762). [Release record](../../../releases/2026-10-26.md) contains the API and preview OTA identities. [Sanitized checks](checks.json) contain counts and hashes only.

The native walkthrough used a copied cached Release simulator host (`com.fitquest.rebuild`), a finite offline bundle of the actual logging components, a fresh disposable iPhone 17 Pro/iOS 26.4 simulator and synthetic-only account/workout/fetch fixtures. It did not use real Auth, the hosted API or AI. This host differs from physical preview build 5; it demonstrates native layout/input behavior, not phone installation or OTA launch. The temporary entry was ignored and removed; the published bundle contains no synthetic entry or test sources. Both disposable simulators were stopped and removed. No development server was started.

Normal-size checks covered incomplete raw input across navigation, confirmation, notes, modal close, durable offline Finish and replay. Final source was checked at the largest standard Dynamic Type size for stacked fields, keyboard visibility, expanded nonempty notes after navigation, corrected set-3 Undo numbering, modal prescription/guidance/close and Finish leaving set 2 suggested/unrecorded. Native accessibility labels/close hooks were inspected; actual VoiceOver focus behavior and the full accessibility-size matrix remain unverified.

- [Large fields and software keyboard](large-fields-keyboard.png)
- [Large exercise notes and corrected Undo label](large-notes-keyboard.png)
- [Large prescription/guidance popup](large-exercise-info.png)
- [Exact source Live in Render](render-live.png)

The matching-runtime preview response returned the published update. All 76 files (launch bundle plus 75 assets; 2,157,750 bytes) were downloaded with protocol-required asset headers and matched manifest SHA-256 hashes. The served launch bundle exactly matches the locally verified preview artifact. Private generated asset authorization, environment values and signed URLs remain outside this record. No new native build or paid AI evaluation occurred. Physical-phone launch, real future coaching output, comprehensive VoiceOver and a Sunday dispatch remain owner acceptance.
