# Dashboard

**Status:** Shipped on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`).
**Actors:** Signed-in Officer viewing personal and period summaries.
**Aliases:** Home page, Dashboard summary, personal action items.
**Slice boundary:** Covers summary projections only; actions remain in Events, Tasks, Points, or administrative workflows.

## End-to-end shape

The Dashboard summarizes existing product records. Its current-period view combines the signed-in Officer's identity and Point totals, active Officer and upcoming Event counts, a small personal action list of incomplete assigned Tasks, upcoming Events, and recent active Point transactions. Period selection switches to a read-only period summary/ranking for past periods and an overview for future periods; a date gap is represented as no current period. Dashboard summaries are projections, not a separate data store or workflow.

Warning decisions are not a Dashboard workflow. Audit history remains a cross-cutting database capability and is not presented as an active System Log page. Use source workflows for action: [Events](events.md), [Tasks](tasks.md), [Points](points.md), and [Warnings](warnings.md).

## Sources

- Canonical behavior: [Dashboard and internal Calendar](../../docs/product/dashboard-calendar.md), [academic periods](../../docs/product/recurrence-lifecycles.md).
- Application: `app/(protected)/page.tsx`, `app/(protected)/dashboard-action-items.ts`, `app/(protected)/dashboard-limits.ts`.
- Database evidence: `supabase/migrations/20260927012410_dashboard_summary.sql`, `20261101000000_academic_periods.sql`, `20261102000000_secure_period_views.sql`.
- Checks: `tests/dashboard-action-items.test.tsx`, `tests/dashboard-events-layout.test.tsx`.
- Related slices: [Points](points.md), [Tasks](tasks.md), [Events](events.md), [internal Calendar](calendar.md).
