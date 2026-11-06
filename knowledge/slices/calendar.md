# Internal Calendar

**Status:** Shipped on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`).
**Actors:** Authenticated Officers viewing schedules and opening canonical records.
**Aliases:** Internal Calendar, combined Event/Task calendar.
**Slice boundary:** Covers the read-only in-app projection; Event/Task mutations belong to source workflows and Google Calendar mirroring is separate.

## End-to-end shape

The authenticated internal Calendar is a read-only combined projection of active, non-cancelled Event occurrences and active Task due dates. A selected academic period filters Events by Event date and Tasks by due date. Display filters affect only the view; choosing an entry opens its canonical Event or Task record. The Calendar is not a second scheduling source and has no Google synchronization behavior.

Google Calendar is a distinct, one-way Event mirror with separate recovery behavior; see [Google Calendar integration](google-calendar-integration.md).

## Sources

- Canonical behavior: [Dashboard and internal Calendar](../../docs/product/dashboard-calendar.md), [academic period lifecycle](../../docs/product/recurrence-lifecycles.md).
- Application: [Calendar page](../../app/%28protected%29/calendar/page.tsx), [Calendar query](../../app/%28protected%29/calendar/calendar-query.ts), [Calendar events](../../app/%28protected%29/calendar/calendar-events.ts), [Calendar view](../../app/%28protected%29/calendar/calendar-view.tsx).
- Checks: [calendar-page.test.tsx](../../tests/calendar-page.test.tsx), [calendar-events.test.ts](../../tests/calendar-events.test.ts), [calendar-query.test.ts](../../tests/calendar-query.test.ts), [calendar-view.test.tsx](../../tests/calendar-view.test.tsx), [calendar-postgrest.integration.test.ts](../../tests/calendar-postgrest.integration.test.ts).
- Related slices: [Events](events.md), [Tasks](tasks.md), [recurrence](recurrence.md), [Dashboard](dashboard.md), [Google Calendar integration](google-calendar-integration.md).
