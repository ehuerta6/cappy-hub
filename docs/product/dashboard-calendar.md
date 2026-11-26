# Dashboard and internal Calendar

## Dashboard and internal Calendar

### Dashboard — current / shipped

The Dashboard's approved personal action surface is defined by [Notifications and reminders](notifications.md). It includes incomplete assigned Tasks (with inline **Mark complete** / **Awaiting approval** controls backed by the existing Task completion workflow), signed-up upcoming Events, attached reminders, unreviewed important Event or Task updates, and leadership Warning-threshold notices that request review of an Officer record, alongside a **Needs your review** queue for Leads and Admins with pending Task completion approvals, the current-period summaries, upcoming Event discovery list, and recent Point activity described below. Informational Point and personal Warning notices stay in the inbox and do not require Dashboard follow-up. Inbox read status does not change Dashboard action items. This behavior shipped in [PR #405](https://github.com/ehuerta6/cappy-hub/pull/405); production deployment status is tracked separately.

For a selected past or future academic period, the Dashboard shows that period's active Event count, active Task count, net Points, and ranking. Past-period views are read-only. A date gap shows “No current period” and keeps the normal unfiltered workflows available.

### Calendar — current / shipped

The internal Calendar is a read-only combined view of non-cancelled, non-removed Event occurrences and non-removed Task due dates from their source records. It supports **Month** and **Agenda** layouts, quick-view scopes (`All club`, `My schedule`, and `My branch`/`My branches`), and Event/Task visibility filters. A selected academic period filters Events by Event date and Tasks by due date. Selecting an item opens its canonical Event or Task. Display filters change only what is shown. Calendar is not a second source of scheduling truth and does not synchronize to Google Calendar.
