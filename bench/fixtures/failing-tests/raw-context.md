# Failing Tests Session

The agent was asked to fix failing billing tests. It touched `src/billing/invoice.ts`, `src/billing/tax.ts`, and `tests/billing/invoice.test.ts`.

Current task: Fix invoice total regression.
Decision: Keep rounding behavior compatible with existing invoices.
Constraint: Do not change persisted invoice schema.

Known failure: invoice.test.ts expects total 1099 but received 1100.
Known failure: Tax calculation rounds per line item instead of invoice total.

Commands:
- pnpm test tests/billing/invoice.test.ts
- pnpm test tests/billing/tax.test.ts

Next step: Move rounding to final invoice total calculation.

Raw terminal noise:

The session included full Jest output, repeated assertion diffs, unchanged invoice fixture JSON, package manager timing lines, and several repeated reads of the same billing modules. The noisy transcript was useful during debugging but should become compact state for the next agent.

Repeated assertion:
Expected total: 1099
Received total: 1100
Difference caused by per-line rounding before invoice aggregation.
Expected total: 1099
Received total: 1100
Difference caused by per-line rounding before invoice aggregation.
Expected total: 1099
Received total: 1100
Difference caused by per-line rounding before invoice aggregation.
Expected total: 1099
Received total: 1100
Difference caused by per-line rounding before invoice aggregation.
Expected total: 1099
Received total: 1100
Difference caused by per-line rounding before invoice aggregation.
