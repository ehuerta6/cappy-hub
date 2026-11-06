# Event participation

**Status:** Shipped on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`).
**Actors:** Officers signing up; Event managers correcting rosters; trusted processing for awards.
**Aliases:** Event signup, attendance, participation credit.
**Slice boundary:** Follows the roster-to-Point lifecycle across Event and Points; Event record administration and general Point history/actions remain in their own slices.

## End-to-end shape

Participation starts with an Officer's confirmed signup on a canonical Event occurrence. The trusted database boundary handles signup eligibility, concurrent capacity checks, and manager roster corrections. Once an active timed Event ends, processing reconciles participation Points from the confirmed roster; an Event with Volunteer Time Slots derives fractional credit from each Officer/slot assignment. Manual Point entries and corrections remain independent records and intentional removals are preserved. Event deletion suspends Event-linked active credit; restoration reconciles eligibility without restoring independently removed awards.

The signup roster and participation awards are connected, while signup-sheet URLs and historical Presenter rows are not participation sources. Time Slot registration is supported participation state, not a separate presenter workflow.

## Sources

- Canonical behavior: [Events and participation](../../docs/product/events.md), [Points](../../docs/product/points.md), [authorization](../../docs/product/authorization.md).
- Application: `app/(protected)/events/actions.ts` (`changeSignup`, `selfSignup`, `bulkAddEventOfficers`), `app/(protected)/events/time-slot-actions.ts`, `app/(protected)/points/actions.ts`.
- Database evidence: `supabase/migrations/20260928225832_automatic_participation.sql`, `20261020120000_event_time_slots.sql`, `20261030043612_reconcile_event_participation.sql`, `20261030165016_reconcile_legacy_event_participation.sql`, `20261031000000_event_delete_restore.sql`.
- Checks: `tests/events-actions.test.ts`, `tests/event-time-slots.test.ts`, `tests/point-actions.test.tsx`, `tests/database.test.ts`.
- Related slices: [Events](events.md), [Points](points.md), [historical Event workflows](historical-event-workflows.md).
