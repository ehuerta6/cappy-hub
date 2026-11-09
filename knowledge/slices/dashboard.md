# Dashboard

**Status:** Shipped on repository `main` (`fcf33a57cfe6b2573ee224889c73e7383a5d20fe`), including personal notification review and action items.
**Actors:** Signed-in Officer viewing personal and period summaries.
**Aliases:** Home page, Dashboard summary, personal action items.
**Slice boundary:** Covers summary projections only; actions remain in Events, Tasks, Points, or administrative workflows.

## End-to-end shape

The Dashboard summarizes existing product records. Its current-period view combines the signed-in Officer's identity and Point totals, active Officer and upcoming Event counts, a personal action list of incomplete assigned Tasks, upcoming Events, and unreviewed important updates, plus recent active Point transactions. Period selection switches to a read-only period summary/ranking for past periods and an overview for future periods; a date gap is represented as no current period. Dashboard summaries are projections, not a separate data store or workflow. Notification inbox history and review state are owned by [Notifications](notifications.md).

Warning decisions are not a Dashboard workflow. Audit history remains a cross-cutting database capability and is not presented as an active System Log page. Use source workflows for action: [Events](events.md), [Tasks](tasks.md), [Points](points.md), and [Warnings](warnings.md).

## Sources

- Canonical behavior: [Dashboard and internal Calendar](../../docs/product/dashboard-calendar.md), [academic periods](../../docs/product/recurrence-lifecycles.md).
- Application: [Dashboard page](../../app/%28protected%29/page.tsx), [Dashboard action items](../../app/%28protected%29/dashboard-action-items.ts), [Dashboard limits](../../app/%28protected%29/dashboard-limits.ts).
- Database evidence: [20260927012410_dashboard_summary.sql](../../supabase/migrations/20260927012410_dashboard_summary.sql), [20261101000000_academic_periods.sql](../../supabase/migrations/20261101000000_academic_periods.sql), [20261102000000_secure_period_views.sql](../../supabase/migrations/20261102000000_secure_period_views.sql), and [20261107000000_in_app_notifications_reminders.sql](../../supabase/migrations/20261107000000_in_app_notifications_reminders.sql).
- Checks: [dashboard-action-items.test.tsx](../../tests/dashboard-action-items.test.tsx), [dashboard-events-layout.test.tsx](../../tests/dashboard-events-layout.test.tsx), and [notification delivery tests](../../supabase/tests/database/notification_trigger_delivery.test.sql).
- Related slices: [Points](points.md), [Tasks](tasks.md), [Events](events.md), [Notifications](notifications.md), and [internal Calendar](calendar.md).
