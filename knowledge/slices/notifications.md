# Notifications and reminders

**Status:** In-app notifications and shared Event/Task reminders are shipped on repository `main` (`fcf33a57cfe6b2573ee224889c73e7383a5d20fe`); production deployment is separate.
**Actors:** Officers receive and review personal notices; Event and Task creators select audiences and reminder offsets; trusted database functions deliver notifications.
**Aliases:** Inbox, notices, important updates, Event reminders, Task reminders.
**Slice boundary:** Connects Event, Task, Point, and Warning changes to personal notification history. It does not own or replace those business workflows.

## End-to-end shape

Notifications are stored per Officer. The header bell opens recent notices and the inbox provides paginated history; opening a notice marks it read, and reviewing an important update clears it from the Dashboard action list without deleting its inbox history. Notifications do not create Event or Task obligations or change signup, assignment, Points, or Warnings.

Event and Task creators can select audiences using active Officers, Branches, and Positions. Signup, departure, assignment, completion, important business changes, Points, Warnings, and due reminders create the approved notice types. Event and Task reminder settings are shared defaults with per-record offsets; recurring edits follow the existing occurrence scopes. Trusted database delivery is idempotent, and notification visibility is scoped to the signed-in Officer.

## Sources

- Canonical behavior: [Notifications and reminders](../../docs/product/notifications.md), [Events](../../docs/product/events.md), [Tasks](../../docs/product/tasks.md), [Points](../../docs/product/points.md), and [Warnings](../../docs/product/warnings.md).
- Approved scope: [Issue #403](https://github.com/ehuerta6/cappy-hub/issues/403); implemented in [PR #405](https://github.com/ehuerta6/cappy-hub/pull/405). Push notifications are a separate scope in [Issue #404](https://github.com/ehuerta6/cappy-hub/issues/404).
- Application: [Notifications page](../../app/%28protected%29/notifications/page.tsx), [Notification actions](../../app/%28protected%29/notifications/actions.ts), and [Dashboard action items](../../app/%28protected%29/dashboard-action-items.ts).
- Database evidence: [notification and reminder migration](../../supabase/migrations/20261107000000_in_app_notifications_reminders.sql), [notification database tests](../../supabase/tests/database/notifications.test.sql), [delivery tests](../../supabase/tests/database/notification_trigger_delivery.test.sql), and [reminder delivery tests](../../supabase/tests/database/notification_reminder_delivery.test.sql).
- Related slices: [Events](events.md), [Event participation](event-participation.md), [Tasks](tasks.md), [Points](points.md), [Warnings](warnings.md), and [Dashboard](dashboard.md).
