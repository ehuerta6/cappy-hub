# Points

**Status:** Shipped on audited repository `main` (`fcf33a57cfe6b2573ee224889c73e7383a5d20fe`).
**Actors:** Officers view eligible history; Admins manage authorized manual entries, corrections, and removals; trusted processors reconcile source awards.
**Aliases:** Point ledger, awards, Point history.

## End-to-end shape

An Officer's total is derived from active signed Point transactions. Event participation and completed Task assignment awards are source-derived and reconciled by trusted database workflows. Admin-entered manual credit and corrections are independent transactions with reasons; Negative Points are fixed at -1 and may link to an Event or Task. Logical removal preserves transaction and actor history. Source corrections update eligible automatic awards while explicit removals remain excluded. Event Delete/Restore suspends and reconciles linked awards; Task lifecycle operations do the equivalent for Task-derived awards.

The Points page brings together authorized transaction actions, period ranking, positive/negative/net totals, and Point History. Volunteers earn 2 Points per eligible hour and Attendees earn 1; changes to the new rates do not reprice existing awards. Groups of three active Negative Points can create an Automatic Warning. Dashboard previews the signed-in Officer's lifetime/period totals and recent active transactions. These surfaces read the same transaction records; they are not separate ledgers.

**Slice boundary:** Points is distinct because Event and Task workflows create source-linked awards while administrators also manage independent adjustments and historical transactions. Cross-domain reconciliation is linked to those source slices rather than copied here.

## Sources

- Canonical behavior: [Points](../../docs/product/points.md), [Events](../../docs/product/events.md), [Tasks](../../docs/product/tasks.md), [recurrence/lifecycles](../../docs/product/recurrence-lifecycles.md).
- Application: [Point actions](../../app/%28protected%29/points/actions.ts), [Points page](../../app/%28protected%29/points/page.tsx).
- Database evidence: [20261002205053_bulk_event_officers_points.sql](../../supabase/migrations/20261002205053_bulk_event_officers_points.sql), [20261029233906_independent_manual_points.sql](../../supabase/migrations/20261029233906_independent_manual_points.sql), [20261030043612_reconcile_event_participation.sql](../../supabase/migrations/20261030043612_reconcile_event_participation.sql), [20261030173800_historical_task_corrections.sql](../../supabase/migrations/20261030173800_historical_task_corrections.sql), and [20261108000000_negative_points_automatic_warnings.sql](../../supabase/migrations/20261108000000_negative_points_automatic_warnings.sql).
- Checks: [point-actions.test.tsx](../../tests/point-actions.test.tsx), [point-history.test.ts](../../tests/point-history.test.ts), [point-transaction-form.test.tsx](../../tests/point-transaction-form.test.tsx), [database.test.ts](../../tests/database.test.ts).
- Related slices: [Event participation](event-participation.md), [Tasks](tasks.md), [Warnings](warnings.md), [Dashboard](dashboard.md), and [Notifications](notifications.md).
