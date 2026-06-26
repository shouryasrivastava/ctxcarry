# Raw Transcript Baseline

Current task: Fix markdown export losing tables.

This fixture exists to compare raw transcript presence against ctxcarry ctxcarry presence. It includes a transcript-like narrative with all important facts plus repeated irrelevant reasoning.

User: Tables disappear from exported markdown reports.
Agent: I will inspect the report renderer, markdown serializer, and export tests.
Agent read `src/reports/render.ts`, `src/reports/markdown.ts`, and `tests/reports/export.test.ts`.
Decision: Keep HTML export behavior unchanged.
Constraint: Do not add a markdown dependency.
Failure: export.test.ts fails because pipe table rows are omitted.
Command: pnpm test tests/reports/export.test.ts
Next step: Serialize table rows in markdown.ts.

Repeated transcript baseline noise:
The agent debated whether to change the renderer or serializer.
The agent debated whether to change the renderer or serializer.
The agent debated whether to change the renderer or serializer.
The agent debated whether to change the renderer or serializer.
The agent pasted the full report renderer.
The agent pasted the full report renderer.
The agent pasted the full report renderer.
The agent pasted the full markdown serializer.
The agent pasted the full markdown serializer.
The agent pasted the full markdown serializer.
