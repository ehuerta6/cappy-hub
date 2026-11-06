# Google Calendar Event mirror and recovery

**Status:** Shipped on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`); external calendar access depends on environment configuration and grants. Code presence does not establish that Production integration is configured or currently healthy.
**Actors:** Event managers trigger saves or recovery; server-side integration identity writes to the external calendar.
**Aliases:** Google Calendar sync, Event mirror, external Calendar.
**Slice boundary:** Covers the post-commit, one-way Event mirror; it is separate from the read-only internal Calendar and excludes Task or participation synchronization.

## End-to-end shape

Cappy Hub remains the Event source of truth. After an Event mutation commits, the server loads canonical state and directly mirrors eligible Event occurrences to the configured private CIC Google Calendar using a stable Google event ID. The mirror is one-way: Google edits never update Cappy Hub. Signup, roster, Task, and Point operations do not sync. Cancellation remains visible as cancelled; Cappy Hub deletion removes the mirrored event; restoration may publish it again.

The post-commit integration can fail after the Cappy Hub operation has succeeded. Current recovery records sync results and allows a manager to retry from current Event state; this is not a general queue or periodic retry system. Production activation requires configured server-side credentials and calendar access. Preview skips synchronization; ordinary local/CI tests mock the external API. The opt-in test calendar procedure can write real events and is documented separately.

This external mirror is separate from the [read-only internal Calendar](calendar.md).

## Sources

- Operational contract and activation: [Google Calendar operations](../../docs/google-calendar.md), [Event Delete/Restore journey](../../docs/user-journeys/event-delete-restore.md).
- Application: [Event actions](../../app/%28protected%29/events/actions.ts) (`syncGoogleCalendarEvents`, `retryGoogleCalendarSync`), [Google Calendar sync](../../lib/google-calendar-sync.ts), [Google event mapping](../../lib/google-calendar-event.ts), [Google Calendar auth](../../lib/google-calendar-auth.ts).
- Database evidence: [Google Calendar recovery migration](../../supabase/migrations/20261031150000_google_calendar_recovery.sql).
- Checks: [google-calendar-event.test.ts](../../tests/google-calendar-event.test.ts), [google-calendar-sync.test.ts](../../tests/google-calendar-sync.test.ts), [google-calendar-test-calendar.integration.test.ts](../../tests/google-calendar-test-calendar.integration.test.ts) (external writes are opt-in).
- Related slices: [Events](events.md), [internal Calendar](calendar.md).
