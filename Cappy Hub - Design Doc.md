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

* Total points awarded during the current half-year period (January–June or July–December), updated from current records.

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

Cappy Hub maintains a structured directory of CIC officers.

Each officer has a stable record that can be referenced by events and point transactions.

The system should support:

* Viewing all officers.

* Adding an officer.

* Editing officer information.

* Deactivating an officer.

* Reactivating an officer.

* Viewing an officer profile.

* Viewing the events associated with an officer.

* Viewing an officer’s point history.

* Viewing an officer’s total points.

Officer records should remain available after deactivation so that historical event and point records remain valid.

Suggested officer fields:

id

name

email

position_id (references the positions table; one controlled position per officer)

branch memberships (via officer\_branches)

classification

status

Created\_at

Club positions are controlled selectable values stored as data, like branches, so values can be added or removed without a schema change. An officer has one position. Current position values (duplicates in the roster consolidated):

* President
* Vice President of Operations
* Vice President of Academics
* Secretary
* ICPC Lead
* Intro Lead
* Chief Outreach
* Social Media Lead
* ICPC/Academic Officer
* Intro/CIC Academic Officer
* ICPC Officer
* Intro Academic Officer
* CIC Academic Officer
* Outreach Officer
* Social Media Officer

**DECISION NEEDED:** What responsibilities distinguish a regular officer (such as an ICPC Officer or Social Media Officer) from an Academic Officer (such as an ICPC/Academic Officer, Intro Academic Officer, or CIC Academic Officer)? Should the titles carry different application permissions, or describe club duties only?

Suggested branch values (multiple allowed; examples only): Branches are stored as data through branches and officer\_branches, not hardcoded database CHECK values, so branches can be added or removed without schema changes.

intro

social

icpc

general

Suggested classification values:

freshman

sophomore

junior

senior

masters

phd

Classification values represent the officer's current academic classification. Graduate classifications are normalized as `masters` and `phd`.

Suggested status values:

active

inactive

An officer has one club position and may belong to multiple branches. Position, branch membership, and application permissions are separate concepts.

For example, an officer may hold the position of Academic Officer within the Intro branch while their application access level is Administrator.

---

# **5\. Application Access**

Cappy Hub is an internal tool intended for approved CIC users. Authentication may use a simple approved-user login flow such as Google sign-in or email authentication. The exact sign-in and account-to-officer linking rules remain to be decided.

Application permissions should be enforced by the backend rather than only through the user interface. Application roles are `admin` and `officer`, and they are separate from club position and branch membership.

The President, every Vice President, the application owner, and other designated administrators may hold the `admin` role. Multiple people may be admins. Existing admins and the application owner may add or remove admins. Admins can manage all operational data, including any event or officer, and are the only users who may create, remove, or correct point transactions.

An officer whose selected position is designated as a branch-lead position may create and manage events, assign officers, and manage event participation only for branches they belong to. Events may be associated with multiple branches. The position catalog identifies which positions have this permission; branch scope comes from the officer’s branch memberships. Other officers may view permitted data and sign up for or out of events; they may not manage other officers’ event participation.

# **6\. Event Management**

Cappy Hub maintains structured records for CIC events.

The system should support:

* Viewing events.

* Creating an event.

* Editing an event.

* Cancelling an event.

* Viewing event details.

* Associating officers with an event.

* Removing officers from an event.

* Viewing all officers associated with an event.

* Awarding points related to an event.

Suggested event fields:

id

name

description

type

location (optional; may be updated later)

starts\_at

ends\_at

status

slides\_url (optional)

meeting\_notes\_url (optional)

flyer\_status (not\_started, in\_progress, done; Social events)

flyer\_assigned\_to (officer)

created\_at

Event states:

upcoming

happening

past (completed)

cancelled

Each scheduled event should include a start time and an end time. As a data-integrity requirement, ends\_at must occur after starts\_at.

Upcoming, happening, and past event states are determined from the scheduled times; cancellation is set explicitly. An event lead for an associated branch or an admin may cancel an event or mark it completed early. Participation points still use the originally scheduled duration. Officers may sign up for or out of events through the Events page. A Google Calendar invite with event details is a post-MVP enhancement.

Event creation may generate a recurring schedule spanning up to 15 weeks. Each occurrence is created as an independent event, limited to the current January–June or July–December period. Occurrences may be edited or cancelled individually; future occurrences may be deleted individually, but deleting past events is unavailable in the UI. Copied occurrences do not inherit officer signups.

Participation points are calculated from scheduled event duration (`ends_at` minus `starts_at`) using the club’s configured points-per-hour rate, including fractional points. When an event ends, create one participation award for each signed-up officer. An admin may remove an award when needed; separate awards for distinct reasons are allowed.

---

# **7\. Event Types**

Events may be categorized using simple event types.

Examples include (not a closed list):

General

Intro

ICPC

Meeting (mandatory meetings)

Social

Workshop

Event types are managed by admins and are intended primarily for organization and filtering. They do not determine branch-lead permissions; those depend on the event’s associated branches.

---

# **8\. Officer Participation in Events**

Officers and events have a many-to-many relationship.

An officer may be associated with multiple events.

An event may have multiple officers associated with it.

The event\_officers relationship records an officer’s signup for an event. Officers may manage their own signups; admins and leads of a branch associated with the event may manage signups for that event.

Suggested structure:

event\_officers

event\_id

officer\_id

Events may be associated with one or more branches through `event\_branches`. A branch lead’s event permissions are limited to events associated with their branch membership.

The same officer should not be associated with the same event more than once. Branch membership is also unique per officer/branch pair.

This should be enforced with a database uniqueness constraint.

---

# **9\. Points System**

Cappy Hub maintains a transaction-based points system.

Points should be recorded as individual transactions rather than stored only as a total value on an officer record. Each event participation award is generated from scheduled event duration and signup, with no more than one participation award per officer per event. Separate awards for distinct reasons are allowed. Point totals are calculated from current transactions.

Suggested structure:

point\_transactions

id

officer\_id

event\_id

points

reason

created\_by (exact foreign-key relationship pending authentication design)

created\_at

The `event_id` field may be empty when the transaction is not associated with a specific event.

Examples:

Emi

\+5

Intro: Arrays & Hash Maps

Session participation

Alex

\+10

Career Fair

Helped organize event

Sarah

\-5

No event

Manual correction

An officer’s total points are calculated from their transactions.

Conceptually:

total\_points \= SUM(point\_transactions.points)

This allows the system to preserve a complete point history while still displaying a current total.

---

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

At the event’s scheduled end, the system automatically creates one participation point transaction for each signed-up officer. The points equal the scheduled duration multiplied by the club’s configured points-per-hour rate, including fractional points.

Admins may remove an award when an officer did not attend. Separate awards with distinct reasons may be entered as separate transactions by an admin. Each award or removal is recorded in the System Log.


---

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

Each officer should have a detail view.

Admins may create warnings and assign them to a specific officer. A warning is approved only after the President and every Vice President approve it. If any required approver rejects it, the warning becomes rejected; otherwise it remains pending. Warnings cannot be edited after creation. Admins may physically delete a warning. The System Log records warning creation, each approval or rejection, and deletion, including enough warning details to explain a deleted record.

Admins can view all warnings in a warnings component, filtered by pending, rejected, or approved status. Pending and rejected warnings are visible to admins; assigned officers see approved warnings on their profiles. Only approved warnings count toward the officer’s warning total. Three approved warnings flag an officer for admin review; an admin manually deactivates or reactivates the officer.

* Name.

* Position.

* Email.

* Warnings and approval status.

* Total points.

* Event participation.

* Point transaction history.

Example:

Emi

Technical Officer

Active

Total Points

85

Events

Intro: Arrays & Hash Maps

Career Fair

ICPC Practice

Point History

\+5  Intro participation

\+10 Career Fair organization

\-5  Manual correction

---

# **15\. Event Detail View**

Each event should have a detail view with its name, description, type, location, schedule, signup information, associated officers, related files, flyer work, and point transactions.

Optional presentation or slides link.

For Social events, show flyer status (Not started, In progress, Done) and the assigned officer. The admin or lead for the event’s associated branch may mark the flyer done. Completing flyer work creates no more than one flyer award for that event. The award amount is **DECISION NEEDED** pending President review. Record flyer completion and its award in the System Log.

Deleting a past event is not available in the UI; only the database owner may delete historical events.

Meeting and weekly session events may also link to their meeting notes and presentation files.

* Event name.

* Description.

* Type.

* Location.

* Start and end times.

* Status.

* Associated officers.

* Point transactions associated with the event.

Example:

Intro: Arrays & Hash Maps

Type: Intro

September 29

5:00 PM – 6:00 PM

CCSB G.0208

Officers

Emi

Alex

Sarah

\[ Add Officer \]

Points

Emi      \+5

Alex     \+5

Sarah    \+5

\[ Award Points \]

---

# **16\. Database Structure**

The core application data consists of eleven MVP tables. The System Log records actions performed by users throughout the application, including event creation and changes, signup and sign-out, officer assignments, warning creation/deletion and approval votes, and point awards/removals. Each record identifies the actor, action, affected record, and time; deletion entries preserve enough details to understand what was removed. Only admins can view the log.

Tables:

officers

positions

officer\_warnings

warning\_approvals

branches

officer\_branches

events

event\_branches

event\_officers

point\_transactions

audit\_logs

## **Officers**

officers

──────────────

id

name

email

position\_id (references positions)

classification

status

created\_at

## **Positions**

positions

──────────────

id

name (unique)

can\_manage\_branch\_events (boolean)

created\_at

## **Officer Warnings**

officer\_warnings

──────────────

id

officer\_id

reason

status (pending, approved, rejected)

created\_at

## **Warning Approvals**

warning\_approvals

──────────────

warning\_id

approver\_id (authentication relationship pending)

approver\_role (President or Vice President)

decision (pending, approved, rejected)

decided\_at nullable

## **Branches**

branches

──────────────

id

name

created\_at

## **Officer Branches**

officer\_branches

──────────────

officer\_id

branch\_id

## **Event Branches**

event\_branches

──────────────

event\_id

branch\_id

## **Events**

events

──────────────

id

name

description

type

location (optional; may be updated later)

starts\_at

ends\_at

status

slides\_url nullable

meeting\_notes\_url nullable

flyer\_status nullable (Social events)

flyer\_assigned\_to nullable (officer)

created\_at

## **Event Officers**

event\_officers

──────────────

event\_id

officer\_id

## **Point Transactions**

point\_transactions

──────────────

id

officer\_id

event\_id nullable

points (supports fractional values)

reason

award\_type (participation, flyer, manual, correction)

created\_by (exact foreign-key relationship pending authentication design)

created\_at

## **Audit Logs**

audit\_logs

──────────────

id

actor\_id (authentication relationship pending)

action

entity\_type

entity\_id

details (including before/after data or a deletion snapshot when needed)

created\_at

---

# **17\. Data Relationships**

The core relationships are: each officer references one position from positions; positions are maintained as controlled data; officers and branches have a many-to-many relationship through officer\_branches; events and branches have a many-to-many relationship through event\_branches; officers and events have a many-to-many relationship through event\_officers; each warning has approval records for the President and every Vice President; each officer may have many warning and point transaction records; and each event may have many point transactions, while the event reference on a point transaction is optional. Audit log entries record actions across the system.

Officer

   │ participates in

   │

   ▼

Event

and:

Officer

   │

   │ receives

   │

   ▼

Point Transaction

A point transaction may optionally reference an event.

Conceptually:

Officer ─────\< Officer Branch \>───── Branch

Officer ─────\< Event Officer \>───── Event

Officer ─────\< Point Transaction \>───── Event

                         │

                         └── Event is optional

---

# **18\. Database Constraints**

The database should enforce important data rules wherever practical:

* Officer email addresses must be unique.

* Each officer must reference one valid position; position names must be unique.

* Branch names must be unique.

* Each officer/branch pair in `officer\_branches` must be unique.

* Each officer/event pair in `event\_officers` must be unique.

* Each event/branch pair in `event\_branches` must be unique.

* Each warning/approver pair in `warning\_approvals` must be unique.

* An event may have no more than one flyer award; an officer may have no more than one participation award per event.

* Foreign keys must keep `officer\_branches`, `event\_branches`, `event\_officers`, `warning\_approvals`, `officer\_warnings`, point transaction references, and `flyer\_assigned\_to` valid when provided. Warning decisions must be `pending`, `approved`, or `rejected`.

* Officer classification must be one of `freshman`, `sophomore`, `junior`, `senior`, `masters`, or `phd`; officer status must be `active` or `inactive`.

* Event `ends\_at` must occur after `starts\_at`.

* Deactivation or cancellation must preserve historical officer, branch, event, and point relationships.

* The exact actor and `created\_by` foreign-key relationships are pending the authentication design.

* Admins may view the System Log. Log records are retained when a warning or point award is deleted; warning-deletion entries preserve the warning reason and approval decisions.

---

# **19\. Supabase**

Supabase serves as the primary backend for Cappy Hub.

It provides:

* PostgreSQL database.

* Authentication.

* Relational constraints.

* Row Level Security.

* Server-enforced authorization.

The frontend should only use credentials intended for client-side access.

Administrative or service credentials must remain server-side.

Sensitive credentials should never be included in frontend source code.

---

# **20\. Row Level Security**

Database access should use Supabase Row Level Security where appropriate.

Authorization rules should reflect the application’s access model.

For example:

* Approved users may read permitted application data.

* Administrators may create and modify officers.

* Administrators may create and modify events.

* Administrators may create, remove, and correct point transactions.

* Branch leads may manage events and signups only for their associated branches. Officers may manage only their own signups.

* Only admins may view the System Log.

The application should not rely exclusively on frontend controls for security.

---

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

The primary navigation should remain simple:

Cappy Hub

Dashboard | Events | Officers | Points | System Log (admins only)

A sidebar is not required.

The application may use basic black-and-white styling.

Core components include:

Button

Input

Select

Table

Dialog

Tabs

Badge

Form

The UI should prioritize speed and readability over visual complexity.

---

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

A normal workflow through Cappy Hub may look like:

Administrator signs in

        ↓

Creates or updates officers

        ↓

Creates an event

        ↓

Adds participating officers

        ↓

Event ends

        ↓

Participation points are awarded from scheduled duration and signups

        ↓

Admins may remove an incorrect award; actions are logged

        ↓

Officer totals update automatically and history remains auditable

---

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