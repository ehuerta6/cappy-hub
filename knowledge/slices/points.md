# Points

**Status:** Shipped on audited repository `main` (`fcf33a57cfe6b2573ee224889c73e7383a5d20fe`); `By branch` / `By position` ranking views, restrained top-three markers, and leaderboard/history CSV exports implemented on `feat/478-csv-exports` (`ab1e0fe`).
**Actors:** Officers view eligible history, rankings, and CSV exports; Admins manage authorized manual entries, corrections, and removals; trusted processors reconcile source awards.
**Aliases:** Point ledger, awards, Point history, period leaderboard, grouped ranking.

## End-to-end shape

An Officer's total is derived from active signed Point transactions. Event participation and completed Task assignment awards are source-derived and reconciled by trusted database workflows. Admin-entered manual credit and corrections are independent transactions with reasons; Negative Points are fixed at -1 and may link to an Event or Task. Logical removal preserves transaction and actor history. Source corrections update eligible automatic awards while explicit removals remain excluded. Event Delete/Restore suspends and reconciles linked awards; Task lifecycle operations do the equivalent for Task-derived awards.

The Points page brings together authorized transaction actions, selected-period ranking (**Overview**, **By branch**, and **By position** views with restrained top-three markers and per-group averages), positive/negative/net totals, Point History, and period-scoped CSV downloads (`/api/exports/points/leaderboard`, `/api/exports/points/history`). Volunteers earn 2 Points per eligible hour and Attendees earn 1; changes to the new rates do not reprice existing awards. Groups of three active Negative Points can create an Automatic Warning. Dashboard previews the signed-in Officer's lifetime/period totals and recent active transactions, and exposes the period leaderboard on non-current period views. These surfaces read the same transaction records; they are not separate ledgers.

**Slice boundary:** Points is distinct because Event and Task workflows create source-linked awards while administrators also manage independent adjustments and historical transactions. Cross-domain reconciliation is linked to those source slices rather than copied here.

## Sources

- Canonical behavior: [Points](../../docs/product/points.md), [Events](../../docs/product/events.md), [Tasks](../../docs/product/tasks.md), [recurrence/lifecycles](../../docs/product/recurrence-lifecycles.md).
- Application: [Point actions](../../app/%28protected%29/points/actions.ts), [Points page](../../app/%28protected%29/points/page.tsx), [grouped ranking view](../../app/%28protected%29/points/grouped-ranking-view.tsx), [ranking helpers](../../lib/points-ranking.ts), [ranking visuals](../../components/ranking-visuals.tsx).
- Database evidence: [20261002205053_bulk_event_officers_points.sql](../../supabase/migrations/20261002205053_bulk_event_officers_points.sql), [20261029233906_independent_manual_points.sql](../../supabase/migrations/20261029233906_independent_manual_points.sql), [20261030043612_reconcile_event_participation.sql](../../supabase/migrations/20261030043612_reconcile_event_participation.sql), [20261030173800_historical_task_corrections.sql](../../supabase/migrations/20261030173800_historical_task_corrections.sql), and [20261108000000_negative_points_automatic_warnings.sql](../../supabase/migrations/20261108000000_negative_points_automatic_warnings.sql).
- Checks: [point-actions.test.tsx](../../tests/point-actions.test.tsx), [point-history.test.ts](../../tests/point-history.test.ts), [point-transaction-form.test.tsx](../../tests/point-transaction-form.test.tsx), [points-ranking-visuals.test.tsx](../../tests/points-ranking-visuals.test.tsx), [database.test.ts](../../tests/database.test.ts).
- Related slices: [Event participation](event-participation.md), [Tasks](tasks.md), [Warnings](warnings.md), [Dashboard](dashboard.md), and [Notifications](notifications.md).
