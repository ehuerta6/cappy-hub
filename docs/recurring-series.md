# Maintaining recurring Events and Tasks

Every occurrence remains a real Event or Task row. Authorized managers can edit standalone Tasks directly and logically remove eligible standalone Tasks. Recurring records offer **This occurrence**, **This and following occurrences**, and **All occurrences** for editing and removal; Events also offer cancellation. Restoration remains an individual Event workflow.

Only changed form fields apply to the selected scope. Existing per-occurrence overrides in other fields remain intact. Assignments, signups, completion, historical approval fields, cancellation, awards and audit history are never copied or reset. Completed or awarded Tasks cannot have their points changed. Their other recurring details can be edited without recalculating awards.

Task assignments belong to one materialized occurrence. A Task can have multiple Officers, each with independent Completed / Not completed state. Only authorized managers change completion. Each Completed assignment earns the configured Task points after its due date has passed in America/Denver; a scheduled database processor handles due Tasks even when the application is closed. Changing completion after the due date reconciles that Officer's award immediately. Reversing completion logically removes the award, and completing again reactivates the same Task/Officer transaction.

## Schedule segments and identity

A series stores its canonical RRULE, inclusive `starts_on` / `ends_on` bounds, revision and retirement flag. Its real rows supply the occurrence schedule and Event local clock times. A single date edit is an exception: the row retains its original `recurrence_key` even when its actual date changes. Cancellation and logical removal are explicit exceptions on their existing rows.

Metadata or clock-time edits update existing rows without splitting. A date or recurrence edit creates a replacement segment, links it to the previous segment, and maps existing rows to the new ordered dates. Real row IDs stay unchanged; recurrence keys become dates within the replacement segment. Removed slots remain removed and keep their historical details even if their key moves. An expanded schedule creates only additional rows, with fresh independent workflow state. It rejects dates that would recreate removed tail occurrences from an ancestor segment.

For **This and following occurrences**, the selected recurrence key is the inclusive boundary. Earlier rows stay attached to the original segment and its rule is truncated with an inclusive UNTIL at the last earlier key. The replacement segment starts at the selected boundary (or its explicitly shifted date). For **All occurrences**, the current segment is replaced and the original segment is retired. After a split, scopes apply to the segment containing the selected occurrence.

The repeating-schedule count applies to the chosen scope. A date change shifts the scope's canonical starting date by the selected occurrence's date difference. Weekly edits must include that new first weekday. Changing an interval, weekdays, COUNT or UNTIL uses the existing recurrence expander; the database independently cross-checks the resulting dates. The schedule may contain one remaining occurrence after maintenance, while creation still requires two.

The shared Event and Task forms label the interval unit in days or weeks and distinguish that interval from the number of records generated. Before creation or a supported series edit, a read-only preview shows the first five dates, total count and final date. It uses the same date expansion and scope start-date rules as submission. Incomplete or invalid inputs suppress the schedule until it can be generated safely; server and database validation remain authoritative.

Shortening a schedule logically removes its surplus rows. Those rows remain attached to the historical segment outside its new bounds. They retain all relationships and history, and do not participate in later edits of that active segment. Following removal truncates the original rule and bounds; full removal retires it. No scheduler re-expands these definitions.

## Protected state and transactions

Event removal remains logical, including for processed past Events: signups, saved processing rates and point history remain stored. Editing never recalculates their points. Event cancellation follows the existing protection against ended or processed Events. Already cancelled or removed siblings require no cancellation change.

Task removal follows the existing unfinished/unawarded rule. If any selected Task is protected, the whole operation fails, including schedule shortening that would remove that Task. Completed assignments and any Task Point transaction protect a Task from removal; managers can correct completion before removing an unawarded assignment. Removed siblings stay removed and keep their details during edit operations; the series audit explicitly lists their IDs. No operation physically deletes occurrences or history.

Trusted mutations lock the series and all its rows before applying changes. Workflow RPCs lock those same rows. Revisions reject stale submissions, and private request receipts allow an exact retry to return its original result without repeating the split, expansion or audit. A reused request key with different input or actor is rejected. All row changes, series metadata, audits and receipts commit or roll back together.

Authorization is checked for the selected occurrence and every affected row. Event Leads require at least one shared branch; global Events remain restricted to admins and Event executives. Tasks retain their single-branch authorization. Destination branches are independently checked.

## Time and audit

Event clock edits resolve each row's local date and clock time in America/Denver. Schedule expansion uses the shared recurrence module, and trusted SQL resolves each new wall time with `AT TIME ZONE 'America/Denver'`, preserving local clocks across DST. Task schedules use PostgreSQL dates and Temporal PlainDate calendar arithmetic; they have no timestamp or timezone conversion.

Series audits record actor, operation, scope, selected occurrence and boundary, before/after definitions, original and replacement series, affected IDs, preserved removed IDs, changed fields and request key. Existing occurrence edit, cancellation, creation and removal audits remain available.
