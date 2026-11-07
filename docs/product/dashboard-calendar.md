# Dashboard and internal Calendar

## Dashboard and internal Calendar

### Dashboard — current / shipped

The Dashboard's approved personal action surface is defined by [Notifications and reminders](notifications.md). The current implementation has included incomplete assigned Tasks; [Issue #403](https://github.com/ehuerta6/cappy-hub/issues/403) extends it to signed-up upcoming Events, attached reminders, and unreviewed important updates while retaining the current period summaries, upcoming Event discovery list, and recent Point activity described below. Implementation and deployment status remain separate.

For a selected past or future academic period, the Dashboard shows that period's active Event count, active Task count, net Points, and ranking. Past-period views are read-only. A date gap shows “No current period” and keeps the normal unfiltered workflows available.

### Calendar — current / shipped

The internal Calendar is a read-only combined view of non-cancelled, non-removed Event occurrences and non-removed Task due dates from their source records. A selected academic period filters Events by Event date and Tasks by due date. Selecting an item opens its canonical Event or Task. Display filters change only what is shown. Calendar is not a second source of scheduling truth and does not synchronize to Google Calendar.
