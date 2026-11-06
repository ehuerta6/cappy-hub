# Recurrence and materialized occurrences

**Status:** Shipped on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`).
**Actors:** Event and Task managers applying scoped series changes; trusted database mutations enforcing consistency.
**Aliases:** Recurring Events, recurring Tasks, series, occurrence scopes.
**Slice boundary:** Covers series expansion and cross-occurrence operations; each materialized occurrence's domain workflow remains in the Event or Task slice.

## End-to-end shape

Recurring Events and Tasks are series definitions plus real, independently identified occurrence rows. Creation expands a validated schedule into rows; subsequent scoped edits and lifecycle actions operate on materialized occurrences while preserving independent rosters, assignments, completion, awards, and audit history. Supported scopes are “This occurrence,” “This and following occurrences,” and “All occurrences.” Trusted mutations protect consistency with authorization checks, row/series locks, revisions, request receipts, and atomic audit/Point updates. There is no background series re-expansion.

Event occurrences retain local wall-clock schedules in America/Denver; Task occurrences use date-only due dates. Event recurrence also copies configured Time Slot structure into separate occurrence-owned slots; selections are not transferred between occurrences. Each occurrence then follows the regular [Event](events.md) or [Task](tasks.md) workflow.

## Sources

- Canonical behavior: [recurrence/lifecycles](../../docs/product/recurrence-lifecycles.md), [recurring series operations](../../docs/recurring-series.md), [Events](../../docs/product/events.md), [Tasks](../../docs/product/tasks.md).
- Application: [Event actions](../../app/%28protected%29/events/actions.ts), [Task actions](../../app/%28protected%29/tasks/actions.ts), [Recurrence rules](../../lib/recurrence.ts), [Recurrence mutations](../../lib/recurrence-mutation.ts).
- Database evidence: [20261003013000_recurring_event_task_occurrences.sql](../../supabase/migrations/20261003013000_recurring_event_task_occurrences.sql), [20261003042248_recurring_series_scopes.sql](../../supabase/migrations/20261003042248_recurring_series_scopes.sql), [20261031120000_recurrence_delete_restore.sql](../../supabase/migrations/20261031120000_recurrence_delete_restore.sql).
- Checks: [recurrence.test.ts](../../tests/recurrence.test.ts), [recurrence-scopes.test.ts](../../tests/recurrence-scopes.test.ts), [recurrence-fields.test.tsx](../../tests/recurrence-fields.test.tsx).
- Related slices: [Events](events.md), [Tasks](tasks.md), [Calendar](calendar.md).
