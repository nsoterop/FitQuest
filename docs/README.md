# Documentation

Start with the [project README](../README.md) for current implemented capabilities and release state. The standalone preview is delivered and feature work is frozen for personal testing. Current guides are separate from dated verification evidence; repository documentation changes do not update the installed app.

| Need | Read |
| --- | --- |
| Understand the product and run it | [Project README](../README.md), [API setup](../backend/README.md), [database tooling](../database/README.md), [mobile setup](../mobile/README.md) |
| Find code or decide where a file belongs | [Repository layout](guides/repository-layout.md) |
| Run tests, lint and CI checks | [Development checks](guides/development.md) |
| Publish source or deliver an assigned release | [Release procedure and boundaries](guides/release.md) |
| Install the personal iPhone preview without Metro | [Standalone phone preview](guides/phone-preview.md) |
| Publish compatible changes to an installed preview | [Mobile updates](guides/mobile-updates.md) |
| Review the planned seven day expiry and Face ID sign in | [Session expiry and Face ID plan](reference/session-expiry-and-face-id.md); planning only |
| Understand data, planning and scheduling boundaries | [Architecture](reference/architecture.md) |
| Understand branding and UI icons | [Mobile branding and icons](reference/icons.md) |
| Understand the illustrative screenshots | [Screenshot provenance](reference/screenshots.md) |
| Investigate private plan-validation failures | [Diagnostic reference](reference/plan-validation-diagnostics.md) |
| Read long-term product aspirations | [Product goals](reference/product-goals.md); not an implementation checklist |
| Inspect previous releases, audits or native checks | [Archive index](archive/README.md); historical evidence only |

[Flow simplification](reference/flow-simplification.md) and [security implementation](reference/security.md) retain completed, dated implementation checkpoints. They are not pending batches or active assignments. Current data/delivery boundaries are in [architecture](reference/architecture.md); exact releases are in the archive.

Keep everyday instructions in `guides/`, explanations in `reference/`, and dated evidence in `archive/`. Do not add another release history to the root, backend or mobile README. Superseded prototypes and duplicated records can be recovered from Git; they do not need permanent copies in the working tree.
