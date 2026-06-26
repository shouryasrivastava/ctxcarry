# Budget Pressure Session

Current task: Reduce dashboard query latency.

This fixture simulates a session with too many notes for a small handoff budget. Handoff must keep task, constraints, active failures, touched files, and next step while shrinking old commands and stale attempts.

Touched files:
- app/dashboard/page.tsx
- lib/db/dashboard-query.ts
- lib/cache/dashboard-cache.ts
- tests/dashboard/query.test.ts

Decision: Keep the existing dashboard route.
Decision: Do not add Redis for v0.1.
Decision: Reuse the existing in-memory cache helper.
Constraint: Preserve tenant isolation.
Constraint: Do not change analytics event names.
Constraint: Keep the query API return shape stable.
Failure: query.test.ts fails because tenant filter is missing from cached query key.
Command: pnpm test tests/dashboard/query.test.ts
Next step: Include tenant id in dashboard cache key.

Stale notes that should be compressed or omitted under budget:
Attempted to memoize the React component.
Attempted to add a database index without migration.
Attempted to prefetch all dashboard widgets.
Read app/dashboard/page.tsx repeatedly.
Read lib/db/dashboard-query.ts repeatedly.
Read lib/cache/dashboard-cache.ts repeatedly.
Build output repeated many progress lines.
Build output repeated many progress lines.
Build output repeated many progress lines.
Build output repeated many progress lines.
Build output repeated many progress lines.
Build output repeated many progress lines.
Build output repeated many progress lines.
Build output repeated many progress lines.
