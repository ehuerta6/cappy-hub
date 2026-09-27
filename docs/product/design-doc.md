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

Each officer has one controlled club position, one application role, and one or more branch memberships. These are separate concepts: position describes club duties, application role controls Cappy Hub permissions, and branch memberships scope branch-lead event access.

The documented officer fields are:

- id
- name
- utep_email (optional)
- personal_email (optional)
- auth_user_id (nullable, unique FK to auth.users.id; links at most one account to one officer)
- position_id (FK to positions)
- application_role (admin or officer)
- classification (nullable; freshman, sophomore, junior, senior, or graduate; descriptive only)
- status (active or inactive)
- created_at
- Branch memberships through officer_branches

UTEP and personal emails are independently case-insensitive unique when present. They are also the only email fields used for first-login officer matching.

Club positions are controlled data. The current catalog is:

- President
- Vice President of Operations
- Vice President of Academics
- Secretary
- ICPC Lead
- Intro Lead
- Chief Outreach
- Social Media Lead
- ICPC/Academic Officer
- Intro/CIC Academic Officer
- ICPC Officer
- Intro Academic Officer
- CIC Academic Officer
- Outreach Officer
- Social Media Officer

Only ICPC Lead, Intro Lead, and Social Media Lead have can_manage_branch_events = true. Other positions have no branch-management permission based solely on their title. Titles containing Academic Officer describe club duties and do not grant Cappy Hub permissions.

An officer may belong to multiple branches and must belong to at least one. Current branch records include intro, social, icpc, and general. The general branch serves the general CIC audience across experience levels; intro is oriented toward beginners. Branches are controlled database records rather than hardcoded authorization rules.

Classification is optional and descriptive. It does not affect access or business logic. Status is active or inactive.

# **5\. Application Access**

Cappy Hub uses Google Sign-In through Supabase Auth. Email magic links and other email sign-in flows are not part of the MVP.

Every authenticated account must link to an existing officer. On the first successful Google login, the application reads the verified Google email and compares it case-insensitively with officers.utep_email and officers.personal_email. Linking succeeds only when exactly one matching officer is active and has no auth_user_id; the application stores the authenticated auth.users.id on that officer. If there is no eligible match or the match is ambiguous, access is denied rather than guessed. Later requests resolve the officer through auth_user_id.

An approved user is an authenticated Google account linked to an active officer. Authentication by itself does not grant access. The application checks the linked officer's current status on requests; setting status = inactive immediately removes access, including read-only access, while preserving the officer's history.

officers.application_role contains admin or officer. It is independent from club position and branch membership. The application owner is an officer with application_role = admin; there is no separate owner role. Existing admins may manage admin assignments under the documented admin-management rules. Normal officers cannot promote themselves or change another user's role.

Admins can manage all officers, events, signups, point transactions, configuration, warnings, and the System Log. Normal officers may read permitted application data, manage only their own event signups, and cannot perform admin operations.

The only positions with branch-event capability are ICPC Lead, Intro Lead, and Social Media Lead. A lead may manage an event when at least one of the event's branches also belongs to the lead. Formally, lead branches ∩ event branches must be non-empty. A lead does not need to belong to every branch on a multi-branch event. For example, an Intro Lead in intro may manage an event associated with both intro and general. This scope applies to event creation/management, signup assignment/removal, cancellation, early completion, and flyer work. Admins remain globally authorized.

Active approved officers and admins may view other officers' names, positions, branch memberships, UTEP and personal emails, points, point history, and event history. Warning visibility is separate: admins can administer warnings; an officer sees only approved warnings assigned to that officer and never other officers' warning records.

Backend authorization and Supabase RLS enforce these rules; hidden controls alone are not security.

# **6\. Event Management**

Cappy Hub supports event creation, editing, cancellation, early completion, details, branch associations, officer signups, related files, flyer work, and point history.

The final event fields include:

- id, name, description
- event_type_id (FK to event_types)
- location (optional)
- starts_at, ends_at (timezone-aware timestamps)
- status
- participation_points_per_hour_at_end (nullable until scheduled-end processing)
- slides_url and meeting_notes_url (optional)
- flyer_status and flyer_assigned_to (optional; used for Social events)
- created_at
- Branch associations through event_branches

Event names and required event-type references cannot be blank. ends_at must be later than starts_at. Event types are selected from controlled records, not arbitrary text.

Cappy Hub's official user-facing timezone is El Paso, Texas: America/Denver. Event creation, editing, recurrence, and display use El Paso local time and handle daylight-saving-time transitions. PostgreSQL stores timezone-aware timestamps and compares them using normal timezone-safe semantics.

Upcoming and happening status normally follow the scheduled times. Cancellation is explicit. An authorized admin or branch lead may mark a running event completed early by setting its existing status to past; do not add an actual-completion timestamp. The scheduled starts_at and ends_at remain unchanged, and early completion closes signup/signout and displays the event as completed. Automatic participation processing still waits until the originally scheduled ends_at and uses the full scheduled duration.

Admins can manage any event. A branch lead can manage an event only when at least one branch is shared between the event and the lead. Normal officers cannot manage arbitrary events. Officers may sign themselves up or out while signup remains open. Signups close at the scheduled end, on cancellation, or when an event is explicitly completed early.

Event creation may generate independent recurring event rows for up to 15 weeks. Occurrences stay within the current January–June or July–December half-year, calculated in America/Denver local time. Each occurrence has its own schedule and state; signups are not copied. The schedule must remain correct across daylight-saving-time transitions. Occurrences can be edited or cancelled individually; eligible future occurrences may be deleted, but past events are not deleted through the UI.

At the scheduled end, trusted processing snapshots the current application_config.participation_points_per_hour onto the event and creates one participation award per signup using the originally scheduled duration. The transaction stores the awarded amount. Later rate changes do not alter snapshots or existing transactions. Admins may logically remove an incorrect award; the original transaction remains to preserve history and prevent regeneration.

# **7\. Event Types**

Event types are controlled records in the event_types table with id, unique name, and created_at. Seed/default names are General, Intro, ICPC, Meeting, Social, and Workshop; this is not a closed list. Admins may add types and delete types that are unused.

Each event stores event_type_id referencing event_types. Do not store an unrestricted type string on final-MVP events. A type referenced by an event cannot be physically deleted or cascade into event history; enforce referential integrity and reject deletion while referenced. Event types organize and filter events but do not grant permissions. Branch associations determine branch-lead scope.

# **8\. Officer Participation in Events**

Officers and events have a many-to-many relationship through event_officers. The same officer/event pair cannot occur more than once. Signup is available until the scheduled end, cancellation, or explicit early completion.

Officers may manage only their own signups. Admins may manage any eligible signup. A branch lead may assign or remove officers only for an event that shares at least one branch with the lead. A lead need not belong to every branch associated with a multi-branch event. Backend authorization and RLS enforce the distinction; signup and removal actions are included in the System Log.

# **9\. Points System**

Points are individual transactions, not a stored officer total. A transaction records its final awarded amount and is not recalculated if configuration changes later.

The final point_transactions fields include:

- id, officer_id
- event_id (nullable)
- points, reason
- award_type (participation, flyer, manual, or correction)
- created_by (nullable FK to auth.users.id)
- created_at
- removed_at (nullable)
- removed_by (nullable FK to auth.users.id)

A transaction is active while removed_at IS NULL. Officer totals, Dashboard totals, and normal point history count active transactions only. A removal is a logical void: retain the original transaction, set removal metadata, and record enough detail in the System Log to explain the action. This preserves history and unique-award/idempotency behavior.

Participation awards use the scheduled event duration and the rate snapshot captured at scheduled end. Flyer awards use the configured application_config.flyer_completion_points and go to the event's flyer_assigned_to officer. The awarded amount is stored in each transaction. At most one participation award per officer/event and one flyer award per event may ever be created, including when a prior award was logically removed.

Admins may create manual transactions and corrections. Corrections are additional transactions; the original record remains unchanged. The authenticated actor for point creation/removal is stored by its auth.users.id.

# **10\. Point Corrections**

Existing point transactions should remain part of the historical record.

When a point total needs to be corrected, the system should create a new positive or negative transaction.

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

For each eligible non-cancelled event whose scheduled ends_at has passed, the processor skips events already processed, reads the current application_config.participation_points_per_hour, stores the rate in events.participation_points_per_hour_at_end, and creates at most one participation transaction per signed-up officer. The points equal the originally scheduled duration in hours multiplied by the snapshotted rate. The transaction permanently stores the resulting amount.

Processing is safe to run repeatedly. Existing participation transactions, including logically removed ones, prevent recreation. Later rate changes do not alter event snapshots or transaction amounts. The processor records required audit entries and is not executable by anon or ordinary authenticated users as an unrestricted RPC; revoke public/client grants and keep its execution private to the trusted scheduled path.

Flyer completion reads application_config.flyer_completion_points at completion time and creates one flyer award for the event's flyer_assigned_to officer. The transaction stores the final amount. Later configuration changes do not alter it. A logically removed flyer award remains in history and is not recreated. Point awards and removals are logged.

# **12\. Manual Point Transactions**

Administrators may also create point transactions independently of an event.

A manual transaction should require:

Officer

Points

Reason

An event may optionally be attached.

Both positive and negative values are supported.

---

# **13\. Points Page**

The Points page provides a system-wide view of officer points.

It should support:

* Viewing recent point transactions.

* Viewing officer point totals.

* Viewing transactions associated with events.

* Adding a manual transaction.

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

Each officer has a detail view. Active approved officers and admins may view other officers' name, position, branch memberships, UTEP and personal email, total points, point history, and event participation/history. Deactivated officers cannot access Cappy Hub, but their profile and relationships remain available to authorized active users and admins.

Warnings follow separate visibility rules. Admins can view and administer warning records. An officer sees only approved warnings assigned to that officer; normal officers cannot view pending/rejected warnings or other officers' warning records. Only approved warnings count toward warning totals. Three approved warnings flag an officer for admin review; deactivation remains a manual admin decision.

The profile shows:

- Name, position, status, and branch memberships.
- UTEP email and personal email.
- Total points and point transaction history.
- Event participation/history.
- The warning information permitted by the rules above.

# **15\. Event Detail View**

An event detail view shows its name, description, related event-type name, location, schedule in America/Denver, status, branches, signup information, associated officers, related files, flyer work, rate snapshot when useful, and point transactions.

For Social events, authorized users may assign flyer work and update its status. Admins may do so globally; a branch lead may do so only when at least one event branch matches the lead's membership. Flyer completion creates one award for the event's assigned officer using the current configured flyer amount. The transaction stores the final amount. Completion and award creation/removal appear in the System Log.

Meeting notes and presentation files remain in Google Drive; Cappy Hub stores optional URLs only. Past events are not deleted through the UI.

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

officers: id, name, nullable utep_email, nullable personal_email, nullable unique auth_user_id referencing auth.users.id, position_id, application_role (admin or officer), nullable classification, status, and created_at. UTEP and personal email uniqueness is case-insensitive within each field. Every officer has at least one officer_branches row.

## Positions and branches

positions: id, unique name, can_manage_branch_events, created_at. Only ICPC Lead, Intro Lead, and Social Media Lead have the flag set true. Academic Officer titles do not confer this capability.

branches: id, unique name, created_at.

officer_branches: officer_id, branch_id, composite primary key.

## Warnings

officer_warnings: id, officer_id, reason, status (pending, approved, rejected), created_at.

warning_approvals: warning_id, approver_id (authenticated account FK to auth.users.id), approver_role (President or Vice President), decision (pending, approved, rejected), nullable decided_at. Each required approver has one record per warning.

## Event types and events

event_types: id, unique name, created_at. Seed General, Intro, ICPC, Meeting, Social, and Workshop; admins may add types and delete only unused types.

events: id, name, description, event_type_id (FK to event_types), optional location, timezone-aware starts_at and ends_at, status (upcoming, happening, past, cancelled), nullable participation_points_per_hour_at_end, optional slides_url and meeting_notes_url, optional flyer_status and flyer_assigned_to, and created_at. Do not add completed_at or an actual-end-time column. An early-completed event uses status = past while preserving its scheduled timestamps.

event_branches: event_id, branch_id, composite primary key. event_officers: event_id, officer_id, composite primary key.

## Point transactions

point_transactions: id, officer_id, nullable event_id, points, reason, award_type (participation, flyer, manual, correction), nullable created_by referencing auth.users.id, created_at, nullable removed_at, nullable removed_by referencing auth.users.id. Logical removal preserves the row and award uniqueness.

## Application configuration and audit

application_config is a single-row table with id, participation_points_per_hour, flyer_completion_points, and updated_at. Both amounts are configurable by admins only.

audit_logs: id, nullable actor_id referencing auth.users.id, action, entity_type, entity_id, details, and created_at. Details preserve relevant before/after or deletion snapshots. Only admins can read the System Log.

# **17\. Data Relationships**

Each officer references one position and may link to at most one authenticated account through unique officers.auth_user_id → auth.users.id. Position and application role are separate. Officers and branches have a many-to-many relationship through officer_branches.

Each event references one event_types row through event_type_id. Event-type deletion is restricted while referenced; deleting a type never cascades into event history. Events and branches have a many-to-many relationship through event_branches; officers and events have a many-to-many relationship through event_officers.

point_transactions.officer_id references an officer; its optional event_id references an event. created_by, removed_by, warning_approvals.approver_id, and audit_logs.actor_id reference authenticated accounts in auth.users. When the application needs an officer for one of these actors, it resolves the account using officers.auth_user_id.

application_config stores the two current point values. Each event snapshots the participation rate used at scheduled end. Point transactions store the final awarded amount and, when removed, retain removed_at and removed_by. Audit entries record actor, action, affected entity, timestamp, and useful details.

# **18\. Database Constraints**

The database enforces these rules wherever practical:

- UTEP emails and personal emails are separately case-insensitive unique when provided.
- officers.auth_user_id is nullable, unique, and references auth.users.id. application_role is admin or officer; classification is nullable and restricted to freshman, sophomore, junior, senior, or graduate; status is active or inactive.
- Officer position, event type, event/officer, event/branch, officer/branch, warning, approval, and point references use valid foreign keys. Every officer must have at least one branch membership.
- Position and branch names are unique. Exactly ICPC Lead, Intro Lead, and Social Media Lead have branch-event capability in the current catalog.
- event_types.name is unique. events.event_type_id is required and references event_types; deletion of a referenced type is rejected and never cascades into events.
- Event ends_at is later than starts_at; timestamps are timezone-aware. status supports upcoming, happening, past, and cancelled. Early completion sets past without changing scheduled timestamps or adding an actual-end-time field.
- application_config has one row with valid participation_points_per_hour and flyer_completion_points; only admins may change the values.
- Participation award uniqueness is enforced per officer/event, and flyer award uniqueness per event persists even after logical removal.
- Logical removal sets point_transactions.removed_at and removed_by without deleting the transaction. Derived totals and ordinary history include only rows with removed_at IS NULL.
- created_by, removed_by, warning_approvals.approver_id, and audit_logs.actor_id reference auth.users.id.
- Deactivation and cancellation preserve officer, branch, event, and point history. Audit logs retain the details needed to understand deleted/removed records.

# **19\. Supabase**

Supabase provides PostgreSQL, Google Sign-In through Supabase Auth, relational constraints, Row Level Security, and server-enforced authorization. The first-login link uses the verified Google email to match exactly one active, unlinked officer by UTEP or personal email; all later requests resolve through officers.auth_user_id and check current officer status.

Only client-safe Supabase credentials may be used in browser code. Service-role and other administrative credentials remain server-side.

Supabase Cron (pg_cron) invokes a private PostgreSQL database function approximately once per minute to process due events. This database-only workflow does not require Vercel Cron or an Edge Function. Revoke function execution from public, anon, and ordinary authenticated users; keep the scheduled execution path private and trusted.

# **20\. Row Level Security**

RLS and backend authorization enforce the same application access model. Authentication without a linked active officer is insufficient; inactive officers have no application access, including read-only access.

- Active approved officers may read names, positions, branch memberships, UTEP/personal emails, points, point history, and event history for other officers.
- Warning records are separate: admins administer warnings; an officer sees only their own approved warnings.
- Admins may manage officers, events, event types, signups, points, both configuration values, warnings, and System Log records.
- Branch leads may manage events, signups, and flyer work only when the event shares at least one branch with their own memberships. Leads need not belong to every branch on a multi-branch event.
- Normal officers may manage only their own event signups and cannot create manual/correction points, remove awards, alter roles, or manage events.
- Point processing and other trusted operations cannot be invoked by anon or normal authenticated accounts as unrestricted privileged functions.
- Only admins may read audit logs/System Log. Normal application workflows cannot modify audit records.

Frontend controls reflect these permissions but never substitute for backend checks. Tests must also cover direct Supabase/API access and branch-scope boundaries.

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

A sidebar is not required. Basic black-and-white styling and components such as buttons, inputs, selects, tables, dialogs, tabs, badges, and forms are sufficient. Prioritize speed and readability over visual complexity.

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

Event                    Date        Type       Officers    My signup

Intro: Arrays            Sep 29      Intro      4           ✓

Career Fair              Oct 3       Social       7           —

ICPC Practice            Oct 5       ICPC       3           ✓

Selecting an event opens its detail view.

---

# **27\. Officers Page Example**

Officers

\[ \+ Add Officer \]

\------------------------------------------------

Officer           Position             Points    Status

Emi               Technical Officer    85        Active

Sarah             Treasurer            72        Active

Alex              Officer              55        Active

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

---

# **29\. Core Administrative Flow**

A normal Cappy Hub workflow may look like:

Approved CIC officer signs in with Google

        ↓

Cappy Hub links the verified account to exactly one active officer

        ↓

An admin creates or updates officers and controlled event types

        ↓

An admin or authorized branch lead creates an event and assigns its branches

        ↓

Officers sign themselves up; admins/leads manage signups within their permissions

        ↓

At scheduled event end, trusted Supabase Cron processing snapshots the current rate and awards points

        ↓

Authorized users may complete flyer work or logically remove an incorrect award; actions are logged

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