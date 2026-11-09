# Notifications and reminders

## Status and scope

The in-app notification and shared-reminder behavior below was approved by [Issue #403](https://github.com/ehuerta6/cappy-hub/issues/403) and implemented in the repository by [PR #405](https://github.com/ehuerta6/cappy-hub/pull/405). Production deployment and configuration are tracked separately. This contract supersedes earlier unapproved planning language that no notification subsystem was approved.

Notifications are personal history. The signed-in Officer can see only their own inbox, including read and unread entries. The header bell shows recent entries and links to the full inbox. Opening an entry marks it read and opens the related Event, Task, Points transaction, or Warning when that record is available. Important updates stay on the Dashboard action list until the Officer opens the related record; the notification remains in inbox history. Low-priority signup and departure confirmations stay in the inbox and do not become action items.

Notifications never create Event or Task obligations, change a signup, award or remove Points, or create or remove Warnings. Audience selection controls who receives a notice only. In-app notices are always stored. Push belongs to [Issue #404](https://github.com/ehuerta6/cappy-hub/issues/404); email is out of scope.

## Recipients and triggers

Event creators can notify all active Officers, one or more Branches, one or more Positions, or a combination of Branches and Positions. By default, a Branch-scoped Event targets those Branches; a global Event targets all active Officers. The President, both Vice Presidents, and active accounts with the existing Admin role receive notices for new Events and important Event changes across Branches. They receive no notice for another Officer's signup or departure.

Creating an Event notifies its selected audience. Changes to its date, time, or location, and cancellation, notify its signed-up Volunteers and Attendees. A description-only change does not send an Event update notice. An Officer receives a low-priority confirmation for their own signup or departure.

Task creators can choose the same audience dimensions. By default, a Task targets its assignees. Assignment and Task updates notify the selected audience and always notify direct assignees, with overlapping recipients deduplicated. Completion notifies the Lead for the Task's Branch.

Officers receive personal notices when their Points or Warnings are assigned, changed, or removed. Reaching three active Warnings notifies all Leads, Vice Presidents, and the President. Threshold leadership notices are separate from the Officer's personal Warning notice.

## Reminders

Event reminders default to one day and one hour before the Event. Task reminders default to one day before the due date/time. Defaults are shared across Officers; changing one item's offsets does not change another item's settings. Event reminders go to all current signups, both Volunteers and Attendees. Task reminders go to all assignees.

Tasks require a due date and may have a due time. A date-only Task uses noon in America/Denver on its due date as the reminder reference time, so the default one-day reminder is sent at noon on the preceding day. When a due time is set, reminder offsets are relative to that time. A reminder is not sent after its Event starts or Task is due. Due reminders create in-app notification history through the existing Supabase Cron path. Delivery must be idempotent and must not add Vercel Cron or a separate scheduler.

Editing reminders on a recurring Event or Task follows the existing edit scopes: This occurrence, This and following occurrences, or All occurrences. Each occurrence retains its own reminder state and can be corrected independently.

## Dashboard

The personal action list includes assigned incomplete Tasks, upcoming Events the Officer signed up for as Volunteer or Attendee, due reminders attached to their related Event or Task row, and important Event, Task, Points, or Warning updates not yet reviewed. A Task stays until completed or no longer assigned. A signed-up Event stays until it starts. Opening the related record clears an important update from the attention list without deleting inbox history.

The Upcoming Events area remains a discovery list for Events the Officer has not joined. “View events” continues to open the complete Events view.

## Data and security

Recipients and read/review state are stored per Officer. Database policies expose only the signed-in Officer's notifications; trusted database functions create notices and update acknowledgements. Audience selections and reminders do not use signup, assignment, Points, or Warning relations as a side channel. `supabase/seed.sql` includes synthetic inbox examples for creation, change, signup, departure, assignment, completion, Points, Warning, threshold, and reminder notifications; read/unread state; global, Branch, Position, and combined audiences; custom and default offsets; due-time and date-only Tasks; and recurring Event settings.
