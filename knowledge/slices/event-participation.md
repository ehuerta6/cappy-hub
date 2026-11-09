# Event participation

**Status:** Volunteer/Attend signup and participation Points are shipped on repository `main` (`fcf33a57cfe6b2573ee224889c73e7383a5d20fe`).
**Actors:** Officers selecting Volunteer or Attend; Event managers correcting rosters; trusted processing for awards.
**Aliases:** Event signup, Volunteer, Attend, participation credit.
**Slice boundary:** Follows the roster-to-Point lifecycle across Event and Points; Event record administration and general Point history/actions remain in their own slices.

## End-to-end shape

Participation starts with an Officer's confirmed Volunteer or Attend signup on a canonical Event occurrence. Volunteers receive 2 Points per eligible hour and Attendees receive 1; Time Slot signups are Volunteers and earn from selected slot duration. The award does not depend on attendance validation. The trusted database boundary handles signup eligibility, concurrent capacity checks, and manager roster corrections. Once an active timed Event ends, processing reconciles awards from the confirmed roster. Manual Point entries and corrections remain independent records and intentional removals are preserved. Event deletion suspends Event-linked active credit; restoration reconciles eligibility without restoring independently removed awards.

The signup roster and participation awards are connected, while signup-sheet URLs and historical Presenter rows are not participation sources. Time Slot registration is supported participation state, not a separate presenter workflow.

## Sources

- Canonical behavior: [Events and participation](../../docs/product/events.md), [Points](../../docs/product/points.md), [authorization](../../docs/product/authorization.md).
- Application: [Event actions](../../app/%28protected%29/events/actions.ts) (`changeSignup`, `selfSignup`, `bulkAddEventOfficers`), [Event Time Slot actions](../../app/%28protected%29/events/time-slot-actions.ts), [Point actions](../../app/%28protected%29/points/actions.ts).
- Database evidence: [20260928225832_automatic_participation.sql](../../supabase/migrations/20260928225832_automatic_participation.sql), [20261020120000_event_time_slots.sql](../../supabase/migrations/20261020120000_event_time_slots.sql), [20261030043612_reconcile_event_participation.sql](../../supabase/migrations/20261030043612_reconcile_event_participation.sql), [20261030165016_reconcile_legacy_event_participation.sql](../../supabase/migrations/20261030165016_reconcile_legacy_event_participation.sql), [20261031000000_event_delete_restore.sql](../../supabase/migrations/20261031000000_event_delete_restore.sql), [20261108000000_negative_points_automatic_warnings.sql](../../supabase/migrations/20261108000000_negative_points_automatic_warnings.sql).
- Checks: [events-actions.test.ts](../../tests/events-actions.test.ts), [event-time-slots.test.ts](../../tests/event-time-slots.test.ts), [point-actions.test.tsx](../../tests/point-actions.test.tsx), [database.test.ts](../../tests/database.test.ts).
- Related slices: [Events](events.md), [Points](points.md), [Warnings](warnings.md), [Notifications](notifications.md), [historical Event workflows](historical-event-workflows.md).
