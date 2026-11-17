# Notifications and reminders

## Status and scope

The in-app notification and shared-reminder behavior below was approved by [Issue #403](https://github.com/ehuerta6/cappy-hub/issues/403) and implemented in the repository by [PR #405](https://github.com/ehuerta6/cappy-hub/pull/405). Production deployment and configuration are tracked separately. This contract supersedes earlier unapproved planning language that no notification subsystem was approved.

Notifications are personal history. The signed-in Officer can see only their own inbox, including read and unread entries. The header bell shows recent entries and links to the full inbox. Opening an entry marks it read and opens the related Event, Task, Points transaction, or Warning when that record is available. Important updates stay on the Dashboard action list until the Officer opens the related record; the notification remains in inbox history. Low-priority signup and departure confirmations stay in the inbox and do not become action items.

Each inbox entry can be marked read or unread without opening its destination. This changes only inbox read status; it does not change whether an important update has been reviewed for the Dashboard action list.

When any unread notices exist, the full inbox and header preview offer **Mark all as read**. This applies to all unread notices for the signed-in Officer, including notices outside the header's recent preview, and changes only `read_at`; it preserves `reviewed_at` and notification history. Opening the full inbox alone does not mark notices read. If the update fails, the prior visible read state remains and an error is shown.

Notifications never create Event or Task obligations, change a signup, award or remove Points, or create or remove Warnings. Audience selection controls who receives a notice only. In-app notices are always stored. Push belongs to [Issue #404](https://github.com/ehuerta6/cappy-hub/issues/404); email is out of scope.

## Recipients and triggers

Event creators can notify all active Officers, one or more Branches, one or more Positions, or a combination of Branches and Positions. By default, a Branch-scoped Event targets those Branches; a global Event targets all active Officers. The President, both Vice Presidents, and active accounts with the existing Admin role receive notices for new Events and important Event changes across Branches. They receive no notice for another Officer's signup or departure.

Creating an Event notifies its selected audience. Changes to its date, time, or location, and cancellation, notify its signed-up Volunteers and Attendees. A description-only change does not send an Event update notice. An Officer receives a low-priority confirmation for their own signup or departure.

Task creators can choose the same audience dimensions. By default, a Task targets its assignees. Assignment and Task updates notify the selected audience and always notify current direct assignees, with overlapping recipients deduplicated. A removed assignment no longer makes that Officer a direct recipient; they still receive updates if they match the Task's selected audience. A self-reported Task completion notifies the Lead for the Task's Branch. When a manager rejects a pending completion, the assigned Officer receives an in-app notice that the report was not approved and can be submitted again.

Officers receive personal notices when their Points or Warnings are assigned, changed, or removed. Point notices show the signed change to the Officer's active Point balance: awards and edits show the resulting delta, removing a positive Point shows a negative delta, and removing a negative Point shows a positive delta. Reaching three active Warnings notifies all Leads, Vice Presidents, and the President. Threshold leadership notices are separate from the Officer's personal Warning notice.

## Reminders

Event reminders default to one day and one hour before the Event. Task reminders default to one day before the due date/time. Defaults are shared across Officers; changing one item's offsets does not change another item's settings. Event reminders go to all current signups, both Volunteers and Attendees. Task reminders go to all current assignees who have not completed the Task. Removing an assignment stops its future reminders, even if the Officer matches the selected audience, and does not change their existing inbox history.

Tasks require a due date and may have a due time. A date-only Task uses noon in America/Denver on its due date as the reminder reference time, so the default one-day reminder is sent at noon on the preceding day. When a due time is set, reminder offsets are relative to that time. A reminder is not sent after its Event starts or Task is due. Due reminders create in-app notification history through the existing Supabase Cron path. Delivery must be idempotent and must not add Vercel Cron or a separate scheduler.

Editing reminders on a recurring Event or Task follows the existing edit scopes: This occurrence, This and following occurrences, or All occurrences. Each occurrence retains its own reminder state and can be corrected independently.

## Dashboard

The personal action list includes assigned incomplete Tasks, upcoming Events the Officer signed up for as Volunteer or Attendee, due reminders attached to their related Event or Task row, important Event or Task updates not yet reviewed, and leadership Warning-threshold notices that request review of an Officer record. Informational Point and personal Warning notices do not require Dashboard follow-up and never appear as action items solely because they are unread or unreviewed; they remain in inbox history, and Point activity remains on its existing Dashboard and Points surfaces. A Task stays until completed or no longer assigned. A signed-up Event stays until it starts. Opening the related record clears an important Event or Task update from the attention list without deleting inbox history. Inbox read status remains separate from Dashboard review status.

The Upcoming Events area remains a discovery list for Events the Officer has not joined. “View events” continues to open the complete Events view.

## Data and security

Recipients and read/review state are stored per Officer. Database policies expose only the signed-in Officer's notifications; trusted database functions create notices and update acknowledgements. Audience selections and reminders do not use signup, assignment, Points, or Warning relations as a side channel. `supabase/seed.sql` includes synthetic inbox examples for creation, change, signup, departure, assignment, completion, Points, Warning, threshold, and reminder notifications; read/unread state; global, Branch, Position, and combined audiences; custom and default offsets; due-time and date-only Tasks; and recurring Event settings.
