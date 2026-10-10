# Mobile branding and icons

The owner's selected artwork is preserved under [mobile/assets/branding](../../mobile/assets/branding/README.md). Design's transparent blue-and-lime mark supplies the untinted 36-point shared header; the opaque v3 artwork supplies the 1024px home-screen icon. Each export preserves its complete source square. The existing wordmark remains alongside the header mark; the group exposes one accessible “FitQuest” label. Back destinations and account controls keep their existing meanings. The [standalone preview](../guides/phone-preview.md) includes the home-screen icon, transparent header and control assets; Metro remains available for development.

Design's UI-icon proposal uses exact Lucide paths, retained in [mobile/assets/icons](../../mobile/assets/icons/README.md) with the complete upstream license. Local 1x/2x/3x PNG masks use a normalized 1.8 stroke and React Native Image; no native/runtime dependency was added. Navigation uses 24-point images, supporting controls 20-point images, existing graphite/muted/cobalt colors and the existing action-wash selection backing.

| Location | Icon |
| --- | --- |
| Today / Week / Nutrition / Progress | Sun / CalendarDays / Utensils / ChartColumn |
| Account | UserRound |
| Back / details and View workout | ChevronLeft / ChevronRight, with visible destination labels |
| Birthday / gender | ChevronDown |
| Earlier answers | ChevronDown / ChevronUp from actual expanded state |
| Conversation / exercise options | Horizontal Ellipsis |
| Journal completion | Square / SquareCheck from explicit controlled completion state |
| Diary date | CalendarDays and ChevronDown on the existing date control |

Images are decorative and excluded from independent accessibility focus; parent controls retain labels and selected/checked/expanded/disabled state. Touch targets remain at least 44 points. Branding and fixed tab labels scale up to 1.3× to remain legible together at narrow widths; page text keeps normal accessibility scaling. No extra icon is added to ordinary Add, Save, Continue or confirmation buttons. No generation, completion, routing, consent or persistence behavior changes.

See [synthetic rendered checks](../archive/verification/2026-10-10/branding/README.md) and [release evidence](../archive/releases/2026-10-10.md). These checks establish rendering and wiring; physical-phone acceptance is separate.
