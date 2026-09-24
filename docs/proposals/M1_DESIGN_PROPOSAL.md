# FitQuest — M1 Design Proposal (Source Snapshot)

Captured by Project HQ: 2026-09-23. Source: task **Design M1 sign-in and profile**, ID `01a0d101-4c19-7b63-8d49-5fa0e5f70129`, completed turn `01a0d101-5bba-7f72-972b-157c8d38fd71`.

Status: **Initial UX direction approved by the owner on 2026-09-23; visual direction provisional for the first implementation.** The owner also approved continued local logging for a previously verified account during ordinary offline credential expiry, with valid authorization required to resume synchronization and locked access after explicit logout or confirmed revocation. See [HQ review and scope](../reviews/M1_DESIGN_REVIEW.md), [DECISIONS.md](../DECISIONS.md), and [M1a Engineering handoff](../ENGINEERING_M1A_HANDOFF.md). The original response below remains unchanged. Its references to awaiting approval are historical; its full proposal is not blanket permission to implement every screen or a live timer. No depicted behavior is runtime evidence.

## Original Design response

**Recommend a Sessions-first M1:** brief account setup, a resumable session editor, and visible save status throughout training. Use a separate review screen when recovery requires an athlete’s decision.

This is a proposal for HQ/owner review. I read the handoff, all required references, and the mobile foundation/package configuration. The [accepted recovery addendum](M1_RECOVERY_ADDENDUM.md) governs recovery behavior. No files, dependencies, services, or design assets were changed; no runtime tests were run.

**1. Screen and navigation flow**

```text
Sign-in entry
  → Finish secure sign-in
  → Required minimal setup, when incomplete
  → Sessions
      → Start session / Resume session
          → Add activity
          → Strength or timed entry
          → Finish review → Session summary
      → Earlier sessions → View / Correct
      → Save status → Details / Resolve issue
      → Account → Edit profile / Sign out / Switch account
```

Use one navigation stack, with Sessions as the home screen and a labeled Account button. Avoid empty Coach, Nutrition, or Progress tabs. This navigation can expand when those capabilities arrive.

- **Sign-in entry:** “Record your training. Pick up where you left off.” Native Sign in with Apple button. Supporting copy: “This first version supports activity logging. Adaptive coaching and goal setup come later.”
- **Initial sign-in requires connectivity.** Cancellation returns to entry without an error alert. Interrupted sign-in preserves existing local records.
- **Secure sign-in progress:** “Finishing sign-in…” remains visible until credentials are stored and activation succeeds. Apple authorization alone does not lead to a signed-in success screen.
- **Required setup:** editable timezone, load units, distance units, optional nickname. Device timezone is a suggestion; pounds/miles are defaults. No biometric, goal, schedule, or equipment questionnaire.
- **Returning accounts:** complete profiles go directly to Sessions; incomplete profiles return to setup. Preserve an existing local setup draft.
- **Locally completed setup:** after an authenticated account is established, successful local setup permits logging offline. Display “Setup saved on this device · Waiting to sync.” Initial profile confirmation precedes session synchronization.
- **Sessions:** show unfinished sessions first, then sessions grouped by their recorded local day. Always allow another session. When one is unfinished, offer “Resume session” and “Start another”; neither silently ends the other.

Broader onboarding is deferred. Its absence here does not redefine FitQuest’s long-term coaching model.

**2. Textual wireframes and training interactions**

These layouts contain placeholders, not personal records or runtime seed data.

```text
SET UP FITQUEST

A few details for your training records.
You can change these later.

Nickname                         Optional
[                                      ]

Timezone
[ Device-suggested zone               > ]

Load units
[ Pounds ✓ ] [ Kilograms ]

Distance units
[ Miles ✓ ] [ Kilometers ]

Activity-specific units appear where needed.

[ Continue ]
```

Timezone selection should be searchable and show a readable location plus its current offset. Validate against supported timezone identifiers. Keep entries on error, explain the problem beside the field, and focus the first invalid field.

Profile edits must not relabel historical session dates or silently reinterpret previously entered quantities.

```text
SESSIONS                            Account

[ Save-status message, when needed      > ]

Unfinished
[ Session title or “Untitled session”     ]
[ Recorded day · Start time              ]
[ In progress · Saved on this device     ]
[ Resume                                 ]

[ Start session ]

Today
[ Session title · Start–end time          ]
[ Finished · Synced                      ]

[ Earlier sessions ]
```

Empty copy: **“No sessions recorded for this day.”** Action: **“Start session.”** Do not infer a rest day, missed workout, or zero activity.

Offline, distinguish “No cached sessions for this day” from a verified empty history. A loading failure must not render as an empty history.

```text
‹ Sessions                    Session details

[ Editable optional session title        ]
Started [time] · [recorded timezone]
[ Saved on this device · Waiting to sync > ]

[ Activity name                          ]
[ Variation · Equipment, if supplied     ]
[ In progress                            ]
[ Entered results, with units and basis   ]
[ Add set / Add time entry                ]

[ Add activity ]

[ Finish session ]
Leave unfinished
```

**Starting and leaving.** Starting captures the session start time and timezone. After the local write succeeds, show the editor. Back navigation or “Leave unfinished” preserves the session as in progress; it does not create an end time. Returning restores the latest durable fields and results.

A failed local write keeps the athlete on the affected screen with their input retained in memory. Do not navigate away while implying the newest change is durable.

**Add activity.** Ask for an activity name and an entry method: **Strength** or **Time**. These describe the available editors, not an exhaustive activity taxonomy. Offer variation and equipment details without requiring an equipment inventory. Unknown equipment identity remains unknown.

**Strength entry:**

```text
SET [number]

Repetitions
[ blank ]        Count: [movement cycles >]

Side
[ Both / Left / Right / Alternating / N/A ]

Load
[ Not entered / External / Bodyweight / Assisted ]

When External:
[ blank ] [lb >]  [Total / Per dumbbell / Per implement]
Number of implements [optional]

When Assisted:
Method [                           ]
Assistance [optional] [lb >]

More details: Effort · Notes · Performance time

[ Save set ]
```

- Keep reps and actual load blank initially. A new set may retain explicitly chosen units, side, and equipment context; it must not copy performed reps or load.
- Always display load meaning alongside the value: “lb per dumbbell,” “lb total,” or “Bodyweight.”
- Require a clear repetition basis for alternating work. Left/right results remain separately editable.
- Blank means **Not entered**. Explicit zero remains zero. Selecting bodyweight does not require a fabricated mass.
- Optional RPE/RIR fields expand under More details. Validation follows the contract; no arbitrary UI-only ranges.
- Each set is directly editable. Corrections retain its identity and history.
- If every actual field is blank, clarify: **“Save this entry with actuals not entered?”** Do not present it as measured work or include invented totals.

**Timed entry:** default to manual elapsed time, with labeled minutes/seconds inputs. Offer **Use timer** as a secondary method with Start, Pause, Resume, and Review time.

Stopping a timer opens confirmation: **“What time should be recorded?”** The athlete may accept the elapsed time, correct it, or leave duration unknown. Restored timer time remains a draft until confirmed; time passing while the app is closed does not prove activity occurred.

Distance preferences belong in the profile, but the [M1 contract](M1_ARCHITECTURE_PROPOSAL.md) does not yet provide distance or interval result editors. Do not offer controls that cannot save their meaning.

**Finishing:**

```text
FINISH SESSION

[ Activity ]     [Choose outcome >]
                 Completed / Partial / Skipped

[ Explain any unfinished activity or blank actual ]

End time [editable]

[ Finish session ]
[ End early ]
[ Keep logging ]
```

Completion never fills missing results or completes child activities automatically. Started activities need an explicit outcome. An activity with recorded results cannot become skipped through silent removal of those results. An empty session remains unfinished rather than being counted as completed exercise.

“Finish session” maps to completed; “End early” maps to ended early. Both preserve partial/skipped activity outcomes. The summary shows save status separately from session outcome.

Show recorded times and timezone in session details. Crossing midnight does not split a session. Travel does not move old records between days. Reject end-before-start and ask for confirmation when the clock appears to have changed unexpectedly.

**3. Proposed visual direction and reusable set**

Use a calm, high-legibility training notebook: warm neutral background, white input surfaces, dark text, restrained teal actions, and limited decoration. Prioritize entered actuals and the next action. Avoid rings, readiness scores, decorative charts, or motivational metrics without supporting data.

These choices are provisional, not an approved app-wide system.

| Token | Proposed value/use |
|---|---|
| Canvas / surface | `#F5F7F6` / `#FFFFFF` |
| Primary / secondary text | `#142A2A` / `#526363` |
| Primary action | `#17685E`, with white text |
| Attention / error | `#805000` / `#AF303C` on white |
| Control outline | `#798989` |
| Type | System font; 28 title, 22 section, 17 body/input, 15 supporting text |
| Spacing | 4, 8, 12, 16, 24, 32 |
| Shape | 12-point card/control corners |
| Targets | Prefer 48 × 48 logical units or larger |

Calculated contrast on white is approximately 15.1:1 for primary text, 6.3:1 for secondary text, 6.6:1 for teal, and above 6:1 for attention/error text. Control outlines are approximately 3.7:1. These calculations do not replace rendered accessibility testing.

Keep the reusable set small:

- Screen shell with safe-area and keyboard handling.
- Primary, secondary, and text buttons.
- Labeled text/quantity fields, including units, basis, helper text, and errors.
- Choice control that can expand from a horizontal group into a vertical list.
- Session/activity cards and editable result rows.
- Status strip with icon, text, and optional action.
- Recovery comparison panel and explicit confirmation dialog.

Accessibility requirements:

- Respect text scaling without clipping, fixed-height text containers, or truncated activity names.
- At large text sizes, stack fields and comparison values vertically.
- Label inputs fully for screen readers: “Set 2, load, pounds per dumbbell,” rather than “Weight.”
- Announce local-save completion politely; announce actionable failures promptly without repeating every keystroke.
- Keep keyboard focus predictable, provide Next/Done for numeric entry, and move focus to validation errors.
- Use visible labels rather than placeholder-only instructions. Never use color, haptics, gestures, or icon shape alone to communicate state.
- Keep the active input and its error above the keyboard. No swipe-only edit or removal controls.
- Respect reduced motion. Do not animate save indicators continuously once attention is required.
- Long loading states offer a truthful explanation and available recovery action; they do not clear existing content.

Shared React Native controls should carry these behaviors. Apple authentication is the iOS-specific surface; future Android authentication needs its own approved adapter and equivalent flow.

**4. Save and recovery copy**

Show two independent facts: whether the latest input is durable locally, and whether that version is confirmed by the server. Session outcome—In progress, Finished, Ended early—is separate again.

| State | User-facing copy | Interaction |
|---|---|---|
| Editing | “Unsaved changes” | Preserve draft input; do not imply durability. |
| Local write in progress | “Saving on this device…” | Keep input visible. |
| Local-write failure | “Couldn’t save your latest changes on this device. Keep this screen open and try again.” | **Retry local save**. Explain that closing may lose these changes. |
| Durable, waiting | “Saved on this device · Waiting to sync” | Status details; logging continues. |
| Offline | “Saved on this device · Offline” | “We’ll sync when a connection is available.” |
| Sending | “Saved on this device · Syncing…” | Logging continues. |
| Latest version confirmed | “Synced” | Details: “Latest changes confirmed by FitQuest.” |
| Older version confirmed | “Earlier changes synced · Latest changes pending” | Never show overall Synced. |
| Receipt uncertain | “Saved on this device · Checking sync status” | “FitQuest may already have received this change.” **Check status** retries safely. |
| Definite rejection | “Saved on this device · Changes need attention” | **Review issue** with field-level explanation. |
| Conflict | “Saved on this device · Review another version” | **Review versions** or **Later**. |
| Sign-in needed | “Saved on this device · Sign in to sync” | **Sign in**; no repeated failing saves. |
| Service unavailable | “Saved on this device · Sync unavailable” | Automatic bounded retry; optional **Try again**. |

Only use “Saved on this device” after successful local persistence. If a durable draft contains invalid text, say **“Draft saved on this device · Check highlighted fields”**; do not imply a valid synchronized result.

**Conflict review** is a full screen with readable, stacked comparisons:

```text
REVIEW SESSION CHANGES

Your latest changes remain saved on this device.

[Activity / set / field]
Previously synced: [value]
On this device:    [value]
On FitQuest:       [value]

[ Keep this-device value ]
[ Use FitQuest value ]
[ Enter corrected value ]

[ Review resulting session ]
[ Save reviewed changes ]
```

Show additions, outcome changes, and removed/voided entries as well as numeric differences. Require explicit decisions for differences; do not silently merge the whole session.

“Use FitQuest version” requires a preview and explanation that local changes remain in retained history. There is no force-save button.

If local input changes during review: **“This session changed while you were reviewing it. Review the latest changes before saving.”** Preserve the newer input and reopen the updated comparison. A later server change may require another review.

For uncertain receipt, never offer replacement or “Submit as new.” Recover a definite outcome first. If an earlier save fails, its dependent saves remain paused; recovery must include the latest local work, not just the first failed edit.

**Authentication and account switching:**

- Credential storage failure: **“Couldn’t finish secure sign-in on this device. Try again.”**
- Unrecoverable sign-in interruption: **“Sign-in wasn’t completed. Sign in again to continue.”**
- Stored credentials awaiting activation: **“Finishing sign-in…”**, with safe activation retry.
- Local-store/key recovery failure: **“Your saved records couldn’t be opened. They haven’t been removed.”** Do not offer a reset that overwrites pending records.

Before switching an account with pending work:

> **Some records haven’t synced.**\
> They’ll stay locked on this device for this account. Sign back into the same account to continue syncing.

Actions: **Stay signed in** / **Sign out and keep records**.

After offline logout:

> **Signed out on this device. Server sign-out is pending until a connection is available.**

Do not claim global revocation. Work accepted immediately before logout may still appear when the athlete returns.

Switching clears the old account’s screens and stops its work before another account opens. Signed-out entry and account B expose no account A titles, values, counts, or recovery previews. Returning to A requires verified identity, not a nickname or cached account selection.

**Destructive actions are a separate proposal:** omit discard-pending-data and delete-account controls from this slice. If HQ later authorizes removal/voiding, use an explicit target preview and consequence statement, with history-preserving correction where supported. No swipe-to-delete shortcut.

**5. Acceptance walkthroughs**

These describe intended behavior and future evidence. They are not passing tests.

| Scenario | Expected walkthrough and observable result | Criteria |
|---|---|---|
| New profile | Finish verified sign-in; confirm timezone and units; leave nickname blank; Continue. Enter Sessions only after local setup persists. If offline, show setup pending and hold dependent session synchronization. | AC-01/05/10 |
| Mixed session | Start an unplanned session; add strength and timed activities; enter actuals; correct one result; explicitly finish or end early. Start another session on the same day without altering the first. | AC-04/10 |
| Blank actual | Leave reps, assistance, or time unknown. Reopen the result and see Not entered, never zero or a copied target. Finishing does not populate blanks. | AC-04/10 |
| Local-write failure | Inject failure after editing. Show failure, retain visible input, and avoid success navigation. Retry successfully before claiming device durability. Restart can recover only previously committed data. | AC-05/11 |
| Offline save/restart | Save offline, terminate, reopen the same account, and resume the durable session/draft. A restored timer requires confirmation. Reconnection sends pending changes in order. | AC-05/10/11 |
| Lost server response | Server commits, response disappears. Show Checking sync status. Retry the identical operation; produce one effect. Hold successors until durable acknowledgement. Newer edits remain pending. | AC-05/11 |
| Conflict plus another edit | Create a definite conflict; open comparison; edit locally again. The old resolution cannot commit. Re-review includes the newest work, and history remains preserved. | AC-05 |
| Rejected initial setup | Show the profile issue while sessions remain saved locally. Correct and confirm setup before dependent sessions resume against their actual server versions. A failed later profile edit does not block unrelated established-session logging. | AC-05/11 |
| Expired credentials | Attempt the permitted recovery once. If fresh sign-in is required, stop sync and retain records. Resume only after storage, activation, and verification of the original account. | AC-01/05/11 |
| A → B → A | A saves pending work, chooses retention, and signs out. B sees only B’s records; late A responses cannot alter B. Verified return to A restores pending work and resolves uncertain outcomes before continuing. | AC-01/05/10 |

Engineering verification must exercise actual local storage, restart, credential storage, and API failure boundaries. Include large text, screen-reader navigation, midnight/DST, travel, and offline uncached-history checks. Physical-device Apple authentication remains a separate gate.

This slice provides only partial coverage of these ACs. It cannot verify future AI-context isolation, prescriptions, plan publication, or AI/budget failure behavior.

**6. Handoff to HQ**

Recommended defaults for review:

| Decision | Recommendation |
|---|---|
| Navigation | Sessions home, one stack, Account entry; no future-feature tabs. |
| Logging | Explicit Save set/Save time actions; durable draft recovery; no copied actuals. |
| Multiple sessions | Permit multiple unfinished sessions, with a resume suggestion. |
| Timed work | Manual time first; timer results always confirmed. |
| Recovery | Persistent inline status; dedicated comparison for definite conflicts; no replacement while receipt is uncertain. |
| Sign-out | Retain pending records locked to their owner; no discard option in M1. |
| Visual direction | Neutral surfaces, teal actions, system typography, large controls. |

One user-facing policy needs explicit HQ confirmation before implementation: **local access when credentials expire**. Recommend continuing local capture for the already-open, previously verified account during ordinary offline expiry, while disabling synchronization. Explicit logout, account switch, or confirmed revocation should lock access until verification. Missing or inconsistent credential/store ownership state must not unlock records. Architecture should confirm this boundary in the implementation handoff.

Existing technical gates—credential lifetimes, storage/encryption configuration, supported OS policy, and physical authentication verification—remain with HQ, Architecture, and Engineering. No additional product decision blocks review of this proposal.

All screens and behaviors above are **depicted, not implemented**. The accepted foundation remains the only working UI inspected. This completes the read-only Design assignment; implementation awaits HQ and owner review.
