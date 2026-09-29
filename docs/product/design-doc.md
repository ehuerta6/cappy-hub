# **Cappy Hub**

## **1\. Product Purpose**

Cappy Hub is an internal administrative web application for the Coding Interview Club.

Its purpose is to centralize the club’s core structured administrative workflows in one place:

* Officer management.

* Event management.

* Officer participation points.

Cappy Hub provides a simple internal interface for maintaining this information without relying on disconnected spreadsheet layouts or manually calculated totals.

Google Drive continues to serve as the club’s collaborative file system, while Discord remains the club’s primary communication platform.

---

# **2\. Product Structure**

Cappy Hub contains four main areas:

* Dashboard

* Events

* Officers

* Points

The interface prioritizes clarity and functionality.

Admins also have access to a System Log showing actions performed in Cappy Hub.

The visual design should remain simple. Basic tabs, tables, forms, buttons, dialogs, inputs, selects, and status labels are sufficient.

The system should be easy to understand, easy to maintain, and fast to use during normal club operations.

---

# **3\. Dashboard**

The Dashboard is the main landing page.

Its purpose is to provide a quick overview of current club activity using information already stored in Cappy Hub.

The Dashboard may display:

* Number of active officers.

* Number of upcoming events.

* Total active points awarded during the current half-year period (January–June or July–December in the official America/Denver timezone), updated from current records.

* Upcoming events.

* Recent point activity.

Example:

Cappy Hub

Dashboard | Events | Officers | Points | System Log (admins only)

18 Active Officers

6 Upcoming Events

245 Points This Half-Year

Upcoming Events: In an officer-specific view, show all events and clearly mark whether that officer has signed up (for example, with a star or check).

Intro: Arrays & Hash Maps

Sep 29 — 5:00 PM

4 officers

Career Fair

Oct 3 — 10:00 AM

7 officers

Dashboard values should be calculated from existing officer, event, and point records rather than stored separately.

---

# **4\. Officer Management**

Cappy Hub maintains a structured directory of CIC officers. Officer records remain available after deactivation so event, point, and audit history remains valid.

Each officer has one controlled club position, one application role, and zero or more branch memberships. Position describes organizational function, branch describes an area of CIC, and application role controls Cappy Hub permissions. These are separate concepts.

The documented officer fields are:

- id
- name
- utep_email
- personal_email
- At least one of utep_email or personal_email is required
- auth_user_id (nullable, unique FK to auth.users.id; links at most one account to one officer)
- position_id (FK to positions)
- application_role (admin or officer)
- classification (nullable; freshman, sophomore, junior, senior, or graduate; descriptive only)
- status (active or inactive)
- created_at
- Branch memberships through officer_branches

Values in utep_email and personal_email are globally unique across both fields, case-insensitively; the same address cannot appear in either field for another officer. Google first-login matching checks both fields.

Club positions are controlled data managed by admins. The current position catalog is:

- President
- Vice President of Operations
- Vice President of Academics
- Secretary
- Lead
- Officer

Position is an organizational function; branch-specific titles are represented by position plus branch memberships. Examples: ICPC Lead = Lead + icpc; Intro Lead = Lead + intro; Social Media Lead = Lead + social; Chief Outreach = Lead + outreach; Intro Academic Officer = Officer + intro; CIC Academic Officer = Officer + general; ICPC Officer = Officer + icpc; Social Media Officer = Officer + social; Outreach Officer = Officer + outreach; ICPC/CIC Academic Officer = Officer + multiple branches. Academic Officer and Officer are not distinct application positions.

Current branch records are general, intro, icpc, social, and outreach. Officers may belong to zero or more branches; global positions such as President, Vice President, and Secretary may have no branch. Branches are controlled database records managed by admins, not hardcoded authorization rules. The general branch serves the general CIC audience across experience levels; intro is oriented toward beginners.

Classification is optional and descriptive. It does not affect access or business logic. New officers are created as active; the create-officer form does not ask for status. Status is active or inactive.

# **5\. Application Access**

Cappy Hub uses Google Sign-In through Supabase Auth. Email magic links and other email sign-in flows are not part of the MVP.

Every authenticated account must link to an existing officer. On the first successful Google login, the application reads the verified Google email and compares it case-insensitively against both officers.utep_email and officers.personal_email. Linking succeeds only when exactly one matching officer is active and has no auth_user_id; the application stores the authenticated auth.users.id on that officer. If there is no eligible match or the match is ambiguous, access is denied rather than guessed. Later requests resolve the officer through auth_user_id. Account unlinking and resetting are not an MVP Cappy Hub UI workflow; rare corrections may be handled directly in Supabase.

An approved user is an authenticated Google account linked to an active officer. Authentication by itself does not grant access. The application checks the linked officer's current status on requests; setting status = inactive immediately removes access, including read-only access, while preserving the officer's history.

officers.application_role contains admin or officer. Admin assignment is completely manual and independent from club position; President and Vice President positions do not automatically grant admin. The application owner is an officer with application_role = admin; there is no separate owner role. Any admin may promote or demote another admin. An admin may not demote themselves, and the last remaining admin may not be demoted. Normal officers cannot promote themselves or change another user's role.

Admins can manage all officers, events, signups, point transactions, configuration, warnings, and the System Log. Normal officers may read permitted application data, manage only their own event signups, and cannot perform admin operations.

A lead is an officer whose position is Lead. A lead may manage a branch-associated event when the lead and event share at least one branch. Formally, lead branches ∩ event branches must be non-empty; a lead need not belong to every branch on a multi-branch event. Events with no branch association are global and may be managed only by admins. These rules apply to event management and signup administration. Admins remain globally authorized. Branch selectors for officers and events include an All control to select or deselect all available branches; All is a UI control and is never stored as a branch.

Active approved officers and admins may view other officers' names, positions, branch memberships, UTEP and personal emails, points, point history, and event history. Warning visibility is separate: admins can administer warnings; an officer sees only approved warnings assigned to that officer and never other officers' warning records.

Backend authorization and Supabase RLS enforce these rules; hidden controls alone are not security.

# **6\. Event Management**

Cappy Hub supports timed events and untimed work events, event creation and editing, cancellation, details, optional branch associations, officer signups or assignments, related files, and point history. Admins may edit events after they are past. Editing a past event never silently recalculates or changes existing point transactions; any needed correction is made explicitly in the Points system. Events may be removed after they are past. If an event has signups, points, or other historical relationships, removal preserves those records and their history.

The final event fields include:

- id, name, description
- event_type_id (FK to event_types)
- location (optional)
- event_date (required; interpreted in America/Denver)
- starts_at, ends_at (timezone-aware timestamps; present for timed events and null for untimed events)
- fixed_points (required for untimed events; configurable per event; null for timed events)
- status
- participation_points_per_hour_at_end (nullable until timed-event processing)
- deleted_at, deleted_by (nullable; preserve event history when removing an event with related records)
- slides_url and meeting_notes_url (optional)
- created_at
- Branch associations through event_branches

Event names and required event-type references cannot be blank. Every event has one event_date. A timed event requires a start and end time on that same calendar day; it cannot start before 6:00 AM or end after 11:59 PM in America/Denver, and ends_at must be later than starts_at. Multi-day timed events are not supported. An untimed event has no start or end time and requires a configurable fixed_points amount. Untimed events are for dated CIC work such as preparing slides or creating flyers. Event types are selected from controlled records, not arbitrary text. Branch selection includes an All convenience control to select or deselect all available branches; All is a UI control, not a stored branch. Selecting All associates the event with each available branch.

The event create/edit form lets the user select one date, then a same-day time range for timed events (for example, 4:00–6:00 PM or 12:30–3:00 PM). The time controls offer only times from 6:00 AM through 11:59 PM. Choosing untimed hides start/end time inputs and requires fixed_points.

Cappy Hub's official user-facing timezone is El Paso, Texas: America/Denver. Timed event creation, editing, and display use El Paso local time. PostgreSQL stores timezone-aware timestamps and compares them using normal timezone-safe semantics.

For timed events, upcoming and happening status follow the scheduled times automatically; after ends_at the event is past. For untimed events, status becomes past after event_date has passed in America/Denver. Cancellation is explicit. There is no early-completion action. Timed-event signups close at the scheduled end or on cancellation. Untimed event assignments/signups close when the event date passes or on cancellation. Past events remain editable and removable under the history-preservation rules above.

Admins can manage any event, including global events with no branch. A lead can manage a branch-associated event only when the lead and event share at least one branch. Only admins can manage global events. Normal officers cannot manage arbitrary events. Officers may sign themselves up or out of timed events while signup remains open. Admins or authorized leads may assign officers to untimed work events within their event-management scope.



When a timed event ends, trusted processing snapshots the current application_config.participation_points_per_hour onto the event and creates one participation award per signup using the originally scheduled duration. Signup counts as participation. When an untimed event's date has passed in America/Denver, trusted processing awards that event's fixed_points to each assigned/signed-up officer. The transaction stores its final amount. Later changes to the event or rate do not silently change existing transactions. Admins may edit or logically remove automatic awards explicitly in the Points system; logically removed automatic awards are not regenerated. Flyers, slides, and similar work use this normal untimed event and points path, not a separate hardcoded flyer workflow.

# **7\. Event Types**

Event types are controlled records in the event_types table with id, unique name, and created_at. Activity categories may include Meeting, Workshop, and Social. Admins manage this catalog in Cappy Hub; they may add or rename types and physically delete a type only if it has never been referenced.

Each event stores event_type_id referencing event_types. Do not store an unrestricted type string on final-MVP events. A type referenced by an event cannot be physically deleted or cascade into event history; enforce referential integrity and reject deletion while referenced. Event types organize and filter events but do not grant permissions. Branch associations determine branch-lead scope.

# **8\. Officer Participation in Events**

Officers and events have a many-to-many relationship through event_officers. The same officer/event pair cannot occur more than once. For timed events, signup counts as participation and is available until the scheduled end or cancellation. For untimed events, an admin or authorized lead assigns officers to the work event; those assigned officers receive the event's fixed_points after its date passes.

Officers may manage only their own signups. Admins may manage any eligible signup. A lead may assign or remove officers only for a branch-associated event that shares at least one branch with the lead. Only admins may manage signups for global events with no branches. A lead need not belong to every branch associated with a multi-branch event. Backend authorization and RLS enforce the distinction; signup and removal actions are included in the System Log.

# **9\. Points System**

Points are individual transactions, not a stored officer total. A transaction records its final awarded amount and is not recalculated if configuration changes later.

The final point_transactions fields include:

- id, officer_id
- event_id (nullable)
- points, reason
- award_type (participation, manual, or correction)
- created_by (nullable FK to auth.users.id)
- created_at
- removed_at (nullable)
- removed_by (nullable FK to auth.users.id)

A transaction is active while removed_at IS NULL. Officer profile totals are all-time totals across active transactions. Dashboard half-year totals include active transactions whose point_transactions.created_at falls in the current January–June or July–December period in America/Denver. Normal point history shows active transactions. A removal is a logical void: retain the original transaction, set removal metadata, and record enough detail in the System Log to explain the action. This preserves history and unique-award/idempotency behavior.

Timed participation awards use scheduled duration and the rate snapshot captured when the event finishes. Untimed work-event awards use the event's fixed_points after its date passes. Point attribution to a half-year uses point_transactions.created_at. Flyers and slides use the normal untimed event and points model; there is no separate hardcoded flyer workflow.

Admins may create manual transactions and corrections. Admins may directly edit any point transaction, including automatic awards; the edit changes the amount counted in totals and the System Log records before/after values. Admins may logically remove transactions; a removed row no longer counts in totals and remains stored. For example, removing +10 lowers the total by 10, while removing -5 raises it by 5. The authenticated actor for transaction creation, editing, or removal is stored by its auth.users.id.

# **10\. Point Corrections**

Point transactions remain auditable records. Admins may correct a transaction either by editing its points amount directly or by adding a separate positive or negative correction transaction.

For example:

Original transaction

\+10

Correction

\-5

Effective result

\+5

This keeps changes understandable and traceable without requiring a separate complex history system.

---

# **11\. Awarding Points from an Event**

Supabase Cron (pg_cron) runs a private, trusted PostgreSQL database function approximately once per minute. Page loads are not the production processing trigger; no Vercel Cron or Edge Function is required for database-only processing.

For each eligible non-cancelled timed event whose scheduled end has passed, the processor snapshots the current application_config.participation_points_per_hour and creates at most one participation transaction per signup. Points equal the originally scheduled duration in hours multiplied by the snapshotted rate. For each eligible non-cancelled untimed event whose event_date has passed in America/Denver, the processor creates at most one fixed-points transaction per assigned/signed-up officer using the event's fixed_points. Timed signup or untimed assignment counts for the corresponding award. Transactions permanently store the awarded amount. Editing a past event does not recalculate existing transactions; corrections are explicit Points-system actions. Point attribution to a half-year uses point_transactions.created_at.

Processing is safe to run repeatedly. Existing automatic event-award transactions, including logically removed ones, prevent recreation. Later rate or event edits do not alter existing transaction amounts. The processor records required audit entries and is not executable by anon or ordinary authenticated users as an unrestricted RPC; revoke public/client grants and keep its execution private to the trusted scheduled path.



# **12\. Manual Point Transactions**

Administrators may also create point transactions independently of an event.

A manual transaction should require:

Officer

Points

Reason

An event may optionally be attached. The event selector initially shows “No event” and the five most recent events, with search/select available for older events.

Both positive and negative values are supported.

---

# **13\. Points Page**

The Points page provides a system-wide view of officer points.

It should support:

* Viewing recent point transactions.

* Viewing officer point totals.

* Viewing transactions associated with events.

* Adding a manual transaction.

* Editing or removing a point transaction (admins only).

* Filtering or searching transactions.

Example:

| Officer | Event | Reason | Points | Date |
| ----- | ----- | ----- | ----- | ----- |
| Emi | Intro Arrays | Participation | \+5 | Sep 29 |
| Alex | Career Fair | Organizer | \+10 | Oct 3 |
| Sarah | — | Manual correction | \-5 | Oct 4 |

The page may also display a simple officer totals table.

Example:

| Officer | Total Points |
| ----- | ----- |
| Emi | 85 |
| Alex | 70 |
| Sarah | 55 |

---

# **14\. Officer Profile**

Each officer has a detail view. Active approved officers and admins may view other officers' name, position, branch memberships, UTEP and personal email, all-time total points, point history, and event participation/history. Deactivated officers cannot access Cappy Hub, but their profile and relationships remain available to authorized active users and admins.

Warnings follow separate visibility rules. Admins can view and administer warning records. An officer sees only approved warnings assigned to that officer; normal officers cannot view pending/rejected warnings or other officers' warning records. Only approved warnings count toward warning totals. Three approved warnings flag an officer for admin review; deactivation remains a manual admin decision. When a warning is created, snapshot the current President and Vice Presidents as required approvers, excluding the officer receiving the warning if they are in that set. Every snapshotted approver must approve for the warning to become approved; a rejection keeps it rejected and otherwise it remains pending.

The profile shows:

- Name, position, status, and branch memberships.
- UTEP email and personal email.
- Total points and point transaction history.
- Event participation/history.
- The warning information permitted by the rules above.

# **15\. Event Detail View**

An event detail view shows its name, description, related event-type name, location, date and timed schedule in America/Denver when applicable, fixed points for untimed events, status, branches, signup/assignment information, associated officers, related files, rate snapshot when useful, and point transactions. An event with no branches is global. Admins may edit or remove past events; changes never silently recalculate existing awards. Removal preserves historical relationships when they exist.

Untimed work events have a required date and configurable fixed_points. When that date passes in America/Denver, assigned/signed-up officers receive those points automatically. Flyers, slides, and similar work use this normal event/points model. Linking a work event such as a flyer or slide task to a related meeting, workshop, or session is post-MVP and optional if implemented.

Meeting notes and presentation files remain in Google Drive; Cappy Hub stores optional URLs only. Past events remain editable and have an admin remove action. When history exists, event removal preserves related records.

# **16\. Database Structure**

The MVP contains 13 application tables. Supabase Auth's auth.users is a Supabase-managed table, not an additional Cappy Hub application table. audit_logs powers the admin-only System Log.

The 13 application tables are:

1. officers
2. positions
3. officer_warnings
4. warning_approvals
5. branches
6. officer_branches
7. event_types
8. events
9. event_branches
10. event_officers
11. point_transactions
12. application_config
13. audit_logs

## Officers

officers: id, name, nullable utep_email, nullable personal_email, nullable unique auth_user_id referencing auth.users.id, position_id, application_role (admin or officer), nullable classification, status (new officers default to active), and created_at. At least one email is required. Email values are globally unique across both fields, case-insensitively. Officers have zero or more officer_branches rows.

## Positions and branches

positions: id, unique name, created_at. The current position catalog is President, Vice President of Operations, Vice President of Academics, Secretary, Lead, and Officer. Branch-event permission follows position = Lead and the officer's branch memberships; no title-specific permission flag is stored.

branches: id, unique name, created_at. Current branches are general, intro, icpc, social, and outreach.

officer_branches: officer_id, branch_id, composite primary key. Zero or more branch rows are allowed per officer.

## Warnings

officer_warnings: id, officer_id, reason, status (pending, approved, rejected), created_at.

warning_approvals: warning_id, approver_id (authenticated account FK to auth.users.id), approver_role (President or Vice President), decision (pending, approved, rejected), nullable decided_at. On warning creation, snapshot the current President and Vice Presidents as required approvers, excluding the officer receiving the warning if they are in that set. Each snapshotted approver has one record per warning. All must approve; any rejection keeps the existing rejected semantics, otherwise the warning remains pending until all required approvals are recorded.

## Event types and events

event_types: id, unique name, created_at. Activity-category examples include Meeting, Workshop, and Social. Admins may add or rename types; physical deletion is allowed only if never referenced.

events: id, name, description, event_type_id (FK to event_types), event_date (required), optional location, nullable timezone-aware starts_at and ends_at (both present for timed events and both null for untimed events), fixed_points (required for untimed events and null for timed events), status (upcoming, happening, past, cancelled), nullable participation_points_per_hour_at_end (timed-event snapshot), optional slides_url and meeting_notes_url, created_at, nullable deleted_at and deleted_by. Timed events use one calendar date with start/end times between 6:00 AM and 11:59 PM America/Denver; multi-day timed events are not supported. Untimed events have a date and fixed_points. State follows schedule/date automatically unless cancelled. Events remain editable after becoming past; editing never silently changes existing transactions. Removal preserves historical relationships.

event_branches: event_id, branch_id, composite primary key; each event may have zero or more branches, and zero branches means global. The UI's All branch selector selects or deselects all available branches; it is not stored as a branch. event_officers: event_id, officer_id, composite primary key.

## Point transactions

point_transactions: id, officer_id, nullable event_id, points, reason, award_type (participation, fixed_event, manual, correction), nullable created_by referencing auth.users.id, created_at, nullable updated_at, nullable updated_by referencing auth.users.id, nullable removed_at, nullable removed_by referencing auth.users.id. Admin edits change the amount counted in totals and preserve before/after details in audit_logs. Logical removal preserves the row, excludes it from totals, and prevents automatic regeneration. Half-year attribution uses created_at; officer profile totals are all-time.

## Application configuration and audit

application_config is a single-row table with id, participation_points_per_hour, and updated_at. The participation rate is configurable by admins only.

audit_logs: id, nullable actor_id referencing auth.users.id, action, entity_type, entity_id, details, and created_at. Only admins can read the System Log. Log meaningful mutations, including officer create/edit/deactivate/reactivate; position, branch, event-type and admin-role changes; event create/edit/cancel/delete including past-event changes; signup/signout/assignment; point creation/edit with before/after values/correction/automatic award/logical removal; warning creation/approval/rejection/deletion; configuration changes; catalog create/rename/delete; and auth-link changes performed through the application. Preserve actor, action, entity type/id, timestamp, and useful before/after or deletion details. Do not log reads, page views, searches, filters, or ordinary navigation.

# **17\. Data Relationships**

Each officer references one position and may link to at most one authenticated account through unique officers.auth_user_id → auth.users.id. Position, application role, and branch are separate; application role is assigned manually and independently from position. Officers and branches have a many-to-many relationship through officer_branches, with zero or more branch memberships per officer.

Each event references one event_types row through event_type_id. Event-type deletion is restricted while referenced; deleting a type never cascades into event history. Events and branches have a many-to-many relationship through event_branches; an event with zero branches is global and admin-managed. Officers and events have a many-to-many relationship through event_officers.

point_transactions.officer_id references an officer; its optional event_id references an event. created_by, removed_by, warning_approvals.approver_id, and audit_logs.actor_id reference authenticated accounts in auth.users. When the application needs an officer for one of these actors, it resolves the account using officers.auth_user_id.

application_config stores the current timed-event participation rate. Timed events snapshot the rate used when they finish; untimed events store their own fixed_points. Point transactions store the final awarded amount and, when edited or removed, retain updater/removal metadata. Half-year totals use transaction created_at; officer profile totals are all-time. Audit entries record meaningful mutations with actor, action, affected entity, timestamp, and useful details.

# **18\. Database Constraints**

The database enforces these rules wherever practical:

- At least one of utep_email or personal_email is required. Email values are globally unique across both fields, case-insensitively. A Google account matches against either field using the documented first-login flow.
- officers.auth_user_id is nullable, unique, and references auth.users.id. application_role is admin or officer and is independent from position; classification is nullable and restricted to freshman, sophomore, junior, senior, or graduate; status is active or inactive. New officers default to active and the create form does not ask for status. Any admin may promote or demote another admin; self-demotion and demotion of the last remaining admin are prohibited.
- Officer position, event type, event/officer, event/branch, officer/branch, warning, approval, and point references use valid foreign keys. Officers may have zero or more branch memberships.
- Position, branch, and event-type names are unique. Admins may manage and rename these catalogs in Cappy Hub. A catalog record may be physically deleted only if it has never been used or referenced; preserve historical relationships for used records. Branch-event capability follows position = Lead and matching officer/event branch membership. Admin role assignment is manual and independent from position; President and Vice President positions do not grant admin automatically. Admins may change another admin's role but may not demote themselves or the last remaining admin.
- event_types.name is unique. events.event_type_id is required and references event_types; deletion of a referenced type is rejected and never cascades into events. Each event has zero or more branch associations; an event with zero branches is global and admin-only for management.
- Every event has event_date. Timed events require same-day, timezone-aware starts_at and ends_at; the start cannot be before 6:00 AM and the end cannot be after 11:59 PM America/Denver; ends_at must be later than starts_at. Untimed events require null start/end times and a valid fixed_points value. Timed awards use duration × snapshotted participation rate; untimed awards use fixed_points after event_date passes in America/Denver. Event state follows scheduled time/date automatically unless cancelled; there is no early-completion action. Past events remain editable and removable. Editing never silently recalculates transactions. Removing an event with historical relationships preserves those records. No recurring-event feature or recurrence rules are part of the MVP. Use America/Denver for user-facing times. The All branch selector selects/deselects current branches and is never stored. Events with no event_branches rows are global and may be managed only by admins.
- application_config has one row with a valid participation_points_per_hour; only admins may change it. Rate changes are logged.
- Automatic participation and fixed-event award uniqueness is enforced per officer/event, including logically removed awards, so removed automatic awards are never regenerated. Signup counts as participation for timed events; admins or authorized leads assign officers to untimed work events.
- Admins may edit point_transactions.points directly; totals reflect the edited value and before/after values are logged. Logical removal sets point_transactions.removed_at and removed_by without deleting the transaction. Removed transactions no longer count toward totals; ordinary history shows active transactions. Automatic awards may also be edited or removed.
- created_by, removed_by, warning_approvals.approver_id, and audit_logs.actor_id reference auth.users.id.
- Deactivation removes the officer's signups from future events and immediately removes application access while preserving historical participation, points, and audit history. Cancellation preserves event and point history. Warning approvers are snapshotted at creation; exclude the warned officer from that set, and require every remaining snapshotted approver to approve. Meaningful data mutations are logged with actor, action, entity, timestamp, and useful details; reads and navigation are not logged.

# **19\. Supabase**

Supabase provides PostgreSQL, Google Sign-In through Supabase Auth, relational constraints, Row Level Security, and server-enforced authorization. The first-login link uses the verified Google email to match exactly one active, unlinked officer against either required UTEP or personal email field, case-insensitively across both fields; all later requests resolve through officers.auth_user_id and check current officer status. Account unlinking or resetting is not an MVP application workflow; rare corrections may be handled directly in Supabase.

Only client-safe Supabase credentials may be used in browser code. Service-role and other administrative credentials remain server-side.

Supabase Cron (pg_cron) invokes a private PostgreSQL database function approximately once per minute to process due events. This database-only workflow does not require Vercel Cron or an Edge Function. Revoke function execution from public, anon, and ordinary authenticated users; keep the scheduled execution path private and trusted.

# **20\. Row Level Security**

RLS and backend authorization enforce the same application access model. Authentication without a linked active officer is insufficient; inactive officers have no application access, including read-only access.

- Active approved officers may read names, positions, branch memberships, UTEP/personal emails, points, point history, and event history for other officers.
- Warning records are separate: admins administer warnings; an officer sees only their own approved warnings.
- Admins may manage officers (including after related activity is past), positions, branches, events (including past events), event types, signups/assignments, points (including editing and logically removing any transaction), the participation-rate configuration, warnings, admin roles subject to self/last-admin protections, and System Log records.
- Officers with position = Lead may manage branch-associated events and signups only when at least one event branch matches their own memberships. They need not belong to every branch on a multi-branch event. Only admins may manage global events with no branches.
- Normal officers may manage only their own event signups and cannot create manual/correction points, remove awards, alter roles, or manage events.
- Point processing and other trusted operations cannot be invoked by anon or normal authenticated accounts as unrestricted privileged functions.
- Only admins may read audit logs/System Log. Normal application workflows cannot modify audit records. Log meaningful data mutations; do not log reads or navigation.

Frontend controls reflect these permissions but never substitute for backend checks.

# **21\. Google Drive**

Google Drive remains the primary location for CIC collaborative files.

Examples include:

* Presentations.

* Meeting notes.

* Policies.

* Promotional material.

* Curriculum.

* Historical club documents.

Cappy Hub should reference Drive files when necessary instead of duplicating their contents into the application database.

---

# **22\. Google Sheets**

Existing Google Sheets may continue to be used while Cappy Hub is developed and introduced into club operations.

Structured information can be moved into Cappy Hub as the system becomes ready to serve as the primary source for officers, events, and points.

Historical imports should preserve stable relationships between records whenever data is migrated.

---

# **23\. Discord**

Discord remains the primary communication platform for CIC.

Cappy Hub stores structured administrative information while Discord is used for communication between members and officers.

The two systems do not need to share ownership of the same operational records.

---

# **24\. UI Structure**

The primary navigation remains simple:

Cappy Hub

Dashboard | Events | Officers | Points | System Log (admins only)

Google Sign-In is handled through Supabase Auth. Show the signed-in identity and role where useful; hide admin-only controls from officers while enforcing all access on the backend. Officer directory/profile views may show the permitted officer contact, branch, point, and event-history data. Warning visibility remains restricted to admins and the assigned officer's approved warnings.

A sidebar is not required. Include Back and Forward navigation controls on each page using browser history; disable each control when no corresponding history entry exists. Improve usability with clear primary actions, consistent Edit/Remove actions, confirmation before destructive actions, clear success/error feedback, readable forms and labels, disabled buttons while actions are processing, useful empty states, and easy-to-scan tables. Basic black-and-white styling and components such as buttons, inputs, selects, tables, dialogs, tabs, badges, and forms are sufficient. Avoid unnecessary animations or elaborate visual systems.

# **25\. Dashboard Example**

\------------------------------------------------

CAPPY HUB

Dashboard | Events | Officers | Points | System Log (admins only)

\------------------------------------------------

18 Active Officers

6 Upcoming Events

245 Points This Half-Year

Upcoming Events

Intro: Arrays & Hash Maps

Sep 29, 5:00 PM

4 officers

\[ View \]

Career Fair

Oct 3, 10:00 AM

7 officers

\[ View \]

Recent Points

Emi       \+5    Intro Arrays

Alex      \+10   Career Fair

Sarah     \+5    ICPC Practice

---

# **26\. Events Page Example**

Events

\[ \+ New Event \]

\------------------------------------------------

Event                    Date        Type          Branches   Officers    My signup

Intro: Arrays            Sep 29      Workshop      intro      4           ✓

Career Fair              Oct 3       Social        outreach   7           —

ICPC Practice            Oct 5       Workshop      icpc       3           ✓

Branch selection includes an All control for selecting or deselecting all branches.

Past events retain Edit and Remove actions for admins. Editing does not silently recalculate existing point transactions; removal preserves historical relationships.

Selecting an event opens its detail view.

---

# **27\. Officers Page Example**

Officers

\[ \+ Add Officer \]

\------------------------------------------------

Officer           Position     Branches    Points    Status

Emi               Officer      intro       85        Active

Sarah             Secretary    —           72        Active

Alex              Officer      icpc        55        Active

The Add Officer form requires at least one of UTEP email or personal email, creates the officer as active, and does not ask for status. Officers and other records remain editable even when related activity is past.

Selecting an officer opens their profile.

---

# **28\. Points Page Example**

Points

\[ \+ Add Transaction \]

\------------------------------------------------

Officer    Event            Reason             Points

Emi        Intro Arrays     Participation      \+5

Alex       Career Fair      Organizer          \+10

Sarah      —                Correction         \-5

Admins can edit a transaction's points amount directly; totals immediately reflect the edited amount and the System Log records before/after values. Admins can also remove a transaction logically. A removed transaction remains in history and no longer counts toward totals. Automatic participation and fixed-event transactions may also be edited or removed, and removed automatic awards are never regenerated.

---

# **29\. Core Administrative Flow**

A normal Cappy Hub workflow may look like:

Approved CIC officer signs in with Google

        ↓

Cappy Hub links the verified account to exactly one active officer

        ↓

An admin creates or updates officers, manually assigns application roles, and manages positions, branches, and event types

        ↓

An admin or Lead who shares a branch with the event creates a branch-associated event; only admins create or manage global events

        ↓

Officers sign themselves up; admins/leads manage signups within their permissions

        ↓

When a timed event finishes, trusted Supabase Cron processing snapshots the current rate and awards points to signups

        ↓

Admins may logically remove an incorrect participation award; meaningful mutations are logged

        ↓

Active point totals and Dashboard summaries update from non-removed transactions

An inactive officer loses application access immediately, while officer, event, point, and audit history remains preserved.

# **30\. System Goals**

Cappy Hub should make the following tasks simple:

* Finding an officer.

* Seeing whether an officer is active.

* Seeing which events an officer has participated in.

* Creating an event.

* Seeing who participated in an event.

* Awarding participation points.

* Correcting points.

* Seeing an officer’s current point total.

* Understanding where an officer’s points came from.

* Viewing upcoming club events from one place.

The application should remain focused on these workflows and keep its data model easy to understand and maintain.
