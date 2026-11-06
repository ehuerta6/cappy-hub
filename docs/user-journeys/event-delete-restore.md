# Event Delete/Restore and Points

**Actor:** an authorized Event manager (Admin, Event executive, or a Lead within the permitted shared-Branch scope). **Entry:** the Event detail or manager Events view.

1. The manager deletes one Event occurrence. The trusted mutation checks scope and records the lifecycle change.
2. The Event leaves routine lists and Calendar views. Its row, signups, Time Slots, recurrence identity, and audit history remain. Event-linked Point transactions are suspended from active totals according to the lifecycle contract.
3. If Google Calendar synchronization fails after the Cappy Hub change, the failure is visible to an authorized manager and can be retried from current Cappy Hub state.
4. A manager restores the deleted Event from the Deleted view. Only transactions suspended by that deletion are reactivated; eligible source-derived participation is reconciled. Independently removed awards are not restored.

**Important boundaries:** historical Cancelled and archived Event states retain their own behavior; restoring one occurrence does not restore unrelated series occurrences. Calendar sync is one-way and post-commit.

**Sources:** [Event contract](../product/events.md), [authorization](../product/authorization.md), [lifecycle and recurrence](../product/recurrence-lifecycles.md), [Google Calendar operations](../google-calendar.md), `app/(protected)/events/actions.ts` (`deleteEvent`, `restoreEvent`, `retryGoogleCalendarSync`), migrations `20261031120000_recurrence_delete_restore.sql` and `20261031150000_google_calendar_recovery.sql`.
