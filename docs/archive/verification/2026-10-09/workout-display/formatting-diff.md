# Batch 2 formatting-only change

The five-answer coaching request and Monday–Sunday date paragraph remain byte-for-byte unchanged. Initial and explicit-revision requests retain Sol 6.1 low reasoning, rates, token/time limits, one dispatch and the existing ledger. Only the final formatting paragraph and its response display schema change.

Before (`document-week-v1`):

```text
Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and the complete workout in workoutMarkdown. Rest days have empty session lists. Write clear, readable workout prescriptions with explicit units and recovery in Markdown. Use headings and lists where helpful. Return only the provided display schema.
```

After (`document-week-v2`):

```text
Return each day's sessions with a title, goal, timing if useful (otherwise null), approximate duration range in minutes, optionality, and ordered exercises. Rest days have empty session lists. Each exercise row has a free-text exercise name and a concise free-text prescription. Preserve essential sets, reps, load, time, distance, units, intervals, recovery, per-side/per-round meaning, effort and superset or mixed-work relationships as applicable. Keep essential execution and safety instructions in the relevant prescription. Use plain text, not Markdown, for rows. Do not repeat session goals or introductions in rows. Omit unrequested general weekly commentary; never attach a weekly approach to the first or any other session. Return only the provided display schema.
```

The session's `workoutMarkdown` string becomes ordered `exercises: [{exercise, prescription}]`. The five overview fields and seven dates are unchanged. No numeric targets, catalog IDs or programming taxonomy are introduced. Strings and arrays have display/content bounds; essential units, side/round meaning, mixed/superset relationships and recovery remain readable text. The model is asked to omit unrequested general weekly commentary; no prose is removed with regex and no weekly guidance panel is added.

The [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) was checked: object properties are required, objects reject additional properties, and nullable timing uses `anyOf`. Provider refusal/incomplete handling and paid retry rules are unchanged. Mock schema success does not establish live coaching quality.

Trace: the v1 generation prompt explicitly requested a complete Markdown workout, the store saved that document, and workout detail rendered its full Markdown plus its goal. No mapping code moved weekly commentary into Monday. The owner's specific example was removed by the standing reset, so its exact source cannot be reconstructed. Synthetic historical Markdown demonstrates the old reader's full-prose behavior. New explicit revisions receive that saved document intact and change version only after successful publication; existing rows/history are never converted automatically.
