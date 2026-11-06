# Events

**Status:** Shipped on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`).
**Actors:** Event managers; Officers using signup; trusted processing for participation.
**Aliases:** Event management, occurrence administration.
**Slice boundary:** Covers the canonical Event occurrence lifecycle; participation, Task workflows, series mechanics, internal Calendar, and the external mirror have dedicated slices.

## End-to-end shape

An Event is a materialized occurrence with its own schedule, Branch scope, signup roster, optional Volunteer Time Slots, and optional external resource links. Event managers create or edit it through `/events`; Officers use the same canonical Event record to sign up or leave while eligible. Trusted database processing derives participation Points from confirmed signups and the occurrence schedule. Reversible deletion suspends linked active credit while retaining history; restoration reconciles eligible credit. Recurring Events are still individual rows governed by a series definition (see [recurrence](recurrence.md)). A successful saved Event operation also mirrors its eligible state to Google Calendar (see [Google Calendar integration](google-calendar-integration.md)).

An Event's optional Signup sheet is only a URL. The native `event_officers` roster remains authoritative; there is no sheet import/export or roster synchronization.

## Boundaries and status

- **Current:** ordinary Event management, signups, capacities, volunteer Time Slots, participation processing/corrections, and Delete/Restore. Time Slot signups and capacity are occurrence-specific; they are not Presenter assignments.
- **Historical:** Presenter Slot and Event waitlist workflows are retired; retained rows and audit evidence do not turn them back into current Event behavior. See [historical Event workflows](historical-event-workflows.md).
- **Historical:** cancelled and archived states retain their distinct legacy meaning; they are not interchangeable with current reversible deletion.

## Sources

- Canonical behavior: [Events and participation](../../docs/product/events.md), [Points](../../docs/product/points.md), [recurrence/lifecycles](../../docs/product/recurrence-lifecycles.md).
- Application: [Event actions](../../app/%28protected%29/events/actions.ts), [Event application files](../../app/%28protected%29/events/), [Time Slot actions](../../app/%28protected%29/events/time-slot-actions.ts).
- Database evidence: [20261020120000_event_time_slots.sql](../../supabase/migrations/20261020120000_event_time_slots.sql), [20261030043612_reconcile_event_participation.sql](../../supabase/migrations/20261030043612_reconcile_event_participation.sql), [20261031000000_event_delete_restore.sql](../../supabase/migrations/20261031000000_event_delete_restore.sql), [20261019190000_remove_event_waitlist_contracts.sql](../../supabase/migrations/20261019190000_remove_event_waitlist_contracts.sql), [20261030220000_retire_presenter_slots.sql](../../supabase/migrations/20261030220000_retire_presenter_slots.sql).
- Checks: [events-actions.test.ts](../../tests/events-actions.test.ts), [event-roster-controls.test.tsx](../../tests/event-roster-controls.test.tsx), [event-time-slots.test.ts](../../tests/event-time-slots.test.ts), [google-calendar-sync.test.ts](../../tests/google-calendar-sync.test.ts).
- Related journey: [Event Delete/Restore and Points](../../docs/user-journeys/event-delete-restore.md).
