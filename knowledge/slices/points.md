# Points

**Status:** Shipped on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`).
**Actors:** Officers view eligible history; Admins manage authorized manual entries, corrections, and removals; trusted processors reconcile source awards.
**Aliases:** Point ledger, awards, Point history.

## End-to-end shape

An Officer's total is derived from active signed Point transactions. Event participation and completed Task assignment awards are source-derived and reconciled by trusted database workflows. Admin-entered manual credit and corrections are independent transactions with reasons; logical removal preserves transaction and actor history. Source corrections update eligible automatic awards while explicit removals remain excluded. Event Delete/Restore suspends and reconciles linked awards; Task lifecycle operations do the equivalent for Task-derived awards.

The Points page brings together authorized transaction actions, period ranking, totals, and Point History. [PR #373](https://github.com/ehuerta6/cappy-hub/pull/373) implemented a unified signed adjustment form and simpler useful History filters without reducing historical access. Dashboard previews the signed-in Officer's lifetime/period totals and recent active transactions. These surfaces read the same transaction records; they are not separate ledgers.

**Slice boundary:** Points is distinct because Event and Task workflows create source-linked awards while administrators also manage independent adjustments and historical transactions. Cross-domain reconciliation is linked to those source slices rather than copied here.

## Sources

- Canonical behavior: [Points](../../docs/product/points.md), [Events](../../docs/product/events.md), [Tasks](../../docs/product/tasks.md), [recurrence/lifecycles](../../docs/product/recurrence-lifecycles.md).
- Application: `app/(protected)/points/actions.ts`, `app/(protected)/points/page.tsx`.
- Database evidence: `supabase/migrations/20261002205053_bulk_event_officers_points.sql`, `20261029233906_independent_manual_points.sql`, `20261030043612_reconcile_event_participation.sql`, `20261030173800_historical_task_corrections.sql`.
- Checks: `tests/point-actions.test.tsx`, `tests/point-history.test.ts`, `tests/point-transaction-form.test.tsx`, `tests/database.test.ts`.
- Related slices: [Event participation](event-participation.md), [Tasks](tasks.md), [Dashboard](dashboard.md).
