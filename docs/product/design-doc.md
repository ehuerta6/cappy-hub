# Cappy Hub Product & Technical Specification

This is the canonical specification for Cappy Hub product behavior, terminology, scope, and technical contracts. It records behavior implemented on the current `main` branch separately from accepted future decisions. Production deployment status is tracked independently.

The separate [`docs/design.md`](../design.md) is the authority for visual and interaction guidance. It does not replace this product specification, and this specification does not replace the visual design guide.

## 1. Product purpose and scope

Cappy Hub is Coding Interview Club's internal administrative application. It provides structured workflows for Officers, Events, Tasks, participation Points, Warnings, and related administration. The Dashboard summarizes those workflows; it is not an independent analytics or workflow system.

Cappy Hub serves fewer than 50 Officers. Prefer existing infrastructure and free-tier services; do not add paid services without explicit approval. Favor simple, maintainable solutions proportional to actual requirements. This scale informs architecture but never weakens security, authorization, or data integrity, and does not justify artificial limits on database records or future growth.

Google Drive remains CIC's collaborative file system. Discord remains its primary communication platform. Cappy Hub may store links to external files, but it does not copy or synchronize their contents. Native Cappy Hub records remain authoritative for the workflows represented in the application.

## 2. Product status convention

- **Current / shipped** describes behavior present on the current `main` branch at the time this document is maintained; this label alone does not attest to production deployment.
- **Planned / accepted** describes a product decision captured by an approved, open Issue. It is not shipped behavior and must not be presented as available in the application.
- An open Issue alone does not make unrelated ideas part of the roadmap. Work remains subject to its Issue scope and review.

Open accepted decisions, when present, are summarized in [Planned / accepted behavior](#15-planned--accepted-behavior). They do not change the shipped descriptions elsewhere in this document.

## 3. Users and authorization model

### Officer identity and access

An Officer is a durable club record with a stable identity, name, at least one contact email, one Position, optional descriptive classification, and zero or more Branch memberships. Classification does not control authorization or other business rules. An Officer may be linked to at most one authenticated account. An authenticated account gains application access only through its linked **active** Officer record. An inactive Officer cannot access protected application workflows even if the authentication link remains stored.

Officer lifecycle status, application role, Position, and Branch memberships are independent:

- **Status** is active or inactive and controls eligibility for application access and active workflows.
- **Application role** is `officer` or `admin` and is assigned explicitly. A leadership Position does not grant Admin privileges.
- **Position** describes the Officer's club role. Every Position has a stable database ID. The six required system Positions also have stable, non-null machine codes used by authorization; custom Positions have no machine code and cannot gain system privileges through their display names. Required system Positions cannot be renamed or deleted.
- **Branch membership** is a separate many-to-many relationship. It scopes branch work and may be empty for global Officers.

Deactivation does not silently change the Officer's Position, Branches, application role, or historical relationships. The last-active-Admin safeguard prevents removing the only active administrator through Officer deactivation or role changes.

### Management scope

Admin permissions are explicitly assigned and enforced at trusted server/database boundaries. Admins may perform application-wide administration. Event executives have the accepted global Event management scope. A Lead may manage a branch-associated Event only when the Lead and Event share at least one Branch; a global Event with no Branches is outside Lead scope. Task management follows its own branch authorization rule. Holding a Position, being assigned to a Task, signing up for an Event, or linking records does not itself grant broader permissions.

Officers may manage their own Event signup and Task self-assignment where those workflows permit it. Sensitive checks are performed by trusted mutations and Row Level Security (RLS), not only by whether a control appears in the interface.

## 4. Core domain model

| Record            | Meaning and relationship                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Officer           | Durable identity, status, one Position, optional Branch memberships, and optional unique authentication link.                                                       |
| Position          | Club title with a stable database ID. The six required system Positions have stable machine codes for authorization; custom Positions keep a null code.             |
| Branch            | Organizational scope used for Officer membership and branch-scoped Events and Tasks.                                                                                |
| Event             | Scheduled occurrence with one catalog Event Type, optional Branches, native Officer signups, ordered Presenter Slots for Session Events, resource links, and participation Point transactions. |
| Task              | Dated unit of Officer work with one Branch, zero or more Officer assignments, completion state per assignment, and optional Task Points.                            |
| Point transaction | Attributed signed transaction for Event participation, Task work, manual award, or correction. Removed transactions remain in history but are excluded from totals. |
| Warning           | Immutable-reason Officer record with a required leadership decision history.                                                                                        |
| Event/Task series | Recurrence definition that creates and relates real, independently addressable Event or Task occurrence rows.                                                       |
| Audit entry       | System Log record of a meaningful mutation, with actor, entity, time, and useful context.                                                                           |

Zero Event Branches means a global Event. Branches do not define Positions or application roles.

## 5. Officers

### Current / shipped

Admins create and edit Officer profiles, manage application roles through the access workflow, and can deactivate or reactivate Officers. Profiles expose Officer identity, Position, Branches, status, associated Event participation, warnings according to visibility rules, total Points, and Point history. The directory supports name/email search and status, Position, and Branch filters.

Deactivation preserves the Officer row, authentication link, and Event, Task, Warning, Point, and audit references, including existing Event signups. It is a lifecycle change, not routine hard deletion. Inactive Officers cannot access protected workflows or be newly signed up, assigned, or selected as a manual Point recipient through trusted mutations. The Officers directory defaults to Active and offers explicit Active, Inactive, and All views; routine Point totals and new recipient selectors include only active Officers. Point history and Officer profiles remain available for historical records. Position, Branches, and application role are not implicitly changed by deactivation or reactivation.

Position authorization uses stable, non-null machine codes only for the six required Positions: President, Vice President of Operations, Vice President of Academics, Secretary, Lead, and Officer. These codes are independent of display names, and the required Positions cannot be renamed, deleted, or retired. Every Position has a stable database ID; custom Positions intentionally retain `code = NULL`, so changing or copying a display name cannot grant system privileges. Admins may create and rename custom Positions, retire or reactivate them, and safely delete them only when unreferenced. Branches may be created, renamed, retired, or reactivated; safe deletion is restricted when historical records still reference them. Retired Branches and custom Positions remain readable through existing relationships but cannot be newly assigned. An existing relationship can remain during an unrelated edit or be removed.

### Planned / accepted

## 6. Events

### Current / shipped

An Event occurrence can be created, viewed, and edited within the caller's trusted management scope. Events use a catalog Event Type. Current available types include Meeting, Social, Workshop, and **Session**; historical types may remain readable without being offered for new Events. An Event Type is classification, not a separate workflow.

Events have an America/Denver local date and wall-clock schedule, a reusable location value, zero or more Branches, and optional Slides, Meeting notes, and Signup sheet URLs. The optional Signup sheet is an **external resource URL only**. Native Cappy Hub Event signup is the authoritative roster. No Sheet rows are imported, exported, synchronized, counted as participation, or used to award Points.

Officers sign themselves up or leave through the native signup workflow while signup is open. Each occurrence may have a positive Max volunteers limit; blank means unlimited. The confirmed participation roster remains `event_officers`. A full Event rejects additional signups; removing a confirmed signup or changing capacity never promotes anyone. Authorized managers may still edit a past Event's capacity within the existing management workflow; that edit does not change the historical confirmed roster or awards. Actual historical participation changes use the existing Point correction workflow. Only confirmed Officers qualify for participation Points. Authorized managers can add or remove multiple active Officers in bulk. Events with no Branches are global and managed only by Admins or Event executives.

Events may optionally contain occurrence-owned Time Slots. Managers can use equal or custom intervals, gaps are allowed, intervals cannot overlap, and each slot may have its own optional positive capacity. A slotted Event uses per-slot capacities only; its Event-wide Max volunteers limit is hidden and stored as null. Events without Time Slots retain the optional Event-wide Max volunteers limit. Slots may be enabled on a new Event or an existing Event with no confirmed signups; they cannot be enabled after signups exist. No signup or historical Point record is migrated to enable slots. Session Events use Presenter Slots and cannot contain volunteer Time Slots. Event schedule edits that would put a slot outside the new Event bounds fail without changing either schedule or slots. Officers can select one or more slots, all slots atomically, leave one, or leave all; the last selection also removes the canonical Event signup. Per-slot capacities and ordinary Event-wide capacities are enforced by trusted database mutations that serialize concurrent changes. Authenticated Officers can see the names registered for each slot under the existing Event roster visibility rules. Managers can correct slot assignments within their existing Event permissions.

Schedule determines whether an Event is upcoming, happening, or past. Cancellation is a separate state: authorized managers may cancel only when the Event is not ended or already processed. A cancelled Event can be restored through the existing restore-cancellation workflow; restoration recalculates its status from its schedule. Authorized managers can Archive and Restore an Event occurrence within their existing scope. Archiving preserves the Event row, signups, Branches, processing state, Points, recurrence identity, cancellation state, and audit history. Restore clears only the archive marker and never uncancels the Event. Managers can select an explicit Archived view; archived Events stay out of routine lists, Dashboard, Calendar, and new workflows.

The Events page defaults to current non-cancelled Events and can show Upcoming, Happening, Past, Cancelled, or (for authorized managers) Archived groups. Events are organized around the signed-in Officer's own signups and other Events; signups are offered only while the Event permits them. The Dashboard and Calendar omit cancelled and archived Events.

When a non-cancelled, active timed Event ends, trusted scheduled processing snapshots the current participation rate. An Event without Time Slots retains one full-schedule participation transaction per current signup. On a slotted Event, each selected Officer/slot pair receives a distinct transaction equal to that slot's duration multiplied by the captured rate; gaps earn no Points. Manager bulk-add and historical participation processing use the same selected slots and per-slot calculation. Reprocessing does not duplicate awards. Authorized corrections reconcile only affected slot transactions while preserving manual award precedence, independent corrections, intentional removals, and transaction history.

### Presenter Slots — current / shipped

Session-type Events can have any number of stable Presenter Slots, each with its own order. Three slots reflect a historical convention, not a limit; difficulty does not define or constrain slots, and one Officer may present in more than one slot. Active Officers can read Presenter Slots and can be newly assigned to or volunteer for an open slot. Authorized Event managers within their existing scope can add, reorder, assign, and unassign slots. A slot must be empty before a manager can remove it.

An active Officer can volunteer for an open slot or step down from their own slot. Claiming a slot also signs the Officer up for that Event as a confirmed participant. If the Event is full, an Officer who is not already confirmed cannot claim a slot. An Officer who is already confirmed may claim another open slot even when the Event has no remaining capacity. Stepping down releases the Presenter Slot but keeps the Event signup. Removing an Officer's Event signup releases all of that Officer's Presenter Slots for the Event in the same transaction.

Topic/title, resource link, difficulty, and preparation notes are optional. Difficulty is free text; Easy, Medium, and Hard are suggestions, not a fixed set of values. An assigned active Officer may edit their own slot's details without Event-management permission and may leave fields blank or return to edit them later. Event managers retain scoped control over slot details and slot administration. Direct table writes are not available to authenticated clients; trusted mutations enforce these permissions.

Presenter Slot changes and detail edits close when the Session starts, is cancelled, is archived, or has been processed. The slots and assignments remain available to read on the Event detail page. Deactivating an Officer releases that Officer's assignments on future Sessions but preserves their Event signups. An Event cannot be changed away from Session type, and the Session Event Type cannot be renamed, while it has Presenter Slots. Slot creation, removal, reordering, claims, releases, assignments, and detail edits are recorded in the System Log. Presenter Slot notifications are not shipped; notification channels, recipients, and hosting remain unresolved in Issue [#268](https://github.com/ehuerta6/cappy-hub/issues/268), with related future work tracked in Issues #271–#276.

## 7. Tasks

### Current / shipped

A Task has a title, description, Task type, one Branch, date-only due date, Point value, and recurrence metadata when applicable. Its assignments are stored in **`task_officer_assignments`**, the canonical assignment relation. One Task can have multiple Officers. Officers can self-assign when the Task is open to assignment; authorized managers can assign or remove one or multiple Officers.

Completion is tracked independently for each Task/Officer assignment. Only authorized managers change completion. A completed assignment earns the Task's fixed Point value after its due date has passed in America/Denver. A scheduled database processor handles due Tasks when the application is closed. If an authorized manager changes completion after the due date, the corresponding award is reconciled. Reversing completion logically removes the award; completing again reactivates the same Task/Officer transaction. Assignment or completion changes are not a separate Officer approval workflow.

Completed assignments and Task awards protect a Task from archival. Task Points cannot be changed after an assignment is completed or awarded. Due-date processing uses each assignment's current completion state. Historical approval fields or audit entries retained from an older workflow are historical compatibility only; the retired single-assignee projection and legacy completion/approval RPC workflow are not current product behavior.

Tasks may link to zero or more Events for context. Links do not change either record's authorization, workflow, or Point behavior. Existing links remain readable when an Event is cancelled or archived; cancelled and archived Events cannot be newly linked.

The Tasks page groups active Tasks into **Current** (due today or later) and **Past** (overdue), with status filters for Open, In progress, and Complete. Authorized managers can select an explicit Archived view. Assignment progress and the current Officer's relationship to each Task are visible in context. The Calendar shows each active Task due date and opens the canonical Task record.

Authorized managers can Archive and Restore an eligible Task within their existing branch scope. Archiving remains restricted by the Task's protected completion/award state and preserves the Task, assignment, Point, recurrence, and audit history. Restore updates the same Task occurrence without resetting its stored workflow state. Archived Tasks are excluded from normal lists, Dashboard action items, and Calendar.

## 8. Points

### Current / shipped

Point transactions are signed amounts, and an Officer's total is the sum of active transactions (`removed_at` is null). The supported types are participation, task, manual, and correction. Transactions may link to an Event or Task as appropriate and retain actor attribution. Event participation and Task completion awards are processed by trusted database workflows. For each Officer/Event pair, at most one active primary Event award may exist across participation and Event-linked manual awards; corrections may coexist, and Task awards are outside this rule. Admins may change the participation rate, create manual transactions/corrections, edit transaction amounts where authorized, and logically remove transactions.

Logical removal excludes a transaction from totals while preserving its row and history. Removing an automatic award does not cause its processor to recreate it. A correction is a separate signed transaction and does not erase the original. Event edits do not rewrite existing awards. Point History is searchable by Officer, reason, Event, or Task and filterable by award type, Officer, Event, and activity-date range. Admins can select Active, Removed, or All history and see actor/removal information; other Officers see active history. History is paginated 25 rows at a time.

The Points page shows the participation rate, ranked Officer totals, authorized transaction controls, and Point History. The Dashboard shows the signed-in Officer's total, net signed transactions created in the current half-year (January–June or July–December, America/Denver), and the latest five active transactions.

## 9. Warnings

### Current / shipped

Admins create a Warning for an Officer with a nonblank reason that cannot be edited afterward. Creation snapshots the current President and Vice Presidents as required approvers, excluding the warned Officer if they are among them. Required approvers must be active and have linked accounts. Every snapshotted approver must approve for the Warning to become approved; any rejection makes it rejected. Decisions are attributed to the deciding Officer and recorded in the System Log.

Pending and rejected Warnings are visible to Admins; an assigned approver can see and decide their pending decision. Officers see approved, non-voided Warnings on their own profile. Only active approved Warnings count toward the threshold. Three active approved Warnings flag the Officer for Admin review; they do not automatically deactivate the Officer. Admins void Warnings to remove them from active totals while preserving their reason, original status, approvers, decisions, and timestamps. Voided Warnings cannot receive decisions. Admins can deliberately inspect Voided or All history. Void is terminal; issuing a new Warning creates a new record. Voiding is audited, and historical `warning.deleted` entries remain unchanged.

## 10. Dashboard and internal Calendar

### Dashboard — current / shipped

The Dashboard is a current summary and personal action surface. It shows the signed-in Officer's name and Position, personal Point total/profile link, active Officer count, upcoming Event count, half-year signed Point total, up to five eligible personal action items, up to five eligible upcoming Events, and the latest five active Point transactions. Pending Warning decisions are prioritized ahead of incomplete assigned Tasks; Warning decisions are ordered oldest first, and Tasks are ordered by due date and ID. Upcoming Events are ordered by start time and ID and show signup state, signup counts, and an open Presenter Slot indicator when applicable. Recent Point transactions are ordered newest first by creation time and ID. Each preview may contain fewer than five items when fewer eligible records exist. The summaries derive from domain records; they are not separately maintained data or new workflows.

### Calendar — current / shipped

The internal Calendar is a read-only combined view of non-cancelled, non-removed Event occurrences and non-removed Task due dates from their source records. Selecting an item opens its canonical Event or Task. Display filters change only what is shown. Calendar is not a second source of scheduling truth and does not synchronize to Google Calendar.

## 11. Admin and System Log

### Current / shipped

The Admin landing page is an Admin-only directory to the existing workflows: Officer access and warning management, Position/Branch/reusable Event location catalogs, Point configuration and corrections, and System Log. It does not duplicate those workflows or provide a separate analytics area.

Catalog management supports creating and renaming values, safe deletion according to current reference restrictions, and retirement/reactivation of Branches and custom Positions. Retired values remain readable on existing records and are omitted from new relationship choices; existing relationships can remain during unrelated edits or be removed. The six required Positions are protected from renaming, deletion, and retirement. Reusable Event locations are suggested choices; a valid Event may use a new location. Destructive catalog actions use confirmation and trusted reference checks. Event Type availability is controlled through its catalog and old types may remain available for historical display.

System Log is Admin-only and records meaningful changes across Officers and access, catalogs, Events and recurrence, signups, Tasks and assignments/completion, Points, Warnings, configuration, and account linking. It is newest first, with search and filters for actor (including System), action, entity, and date. Six-row pages show readable actor/activity/record/details; before/after changes are human-readable, with technical identifiers and payload available when needed. Reads, page views, search, and navigation are not logged. Audit records retain actor, entity, timestamp, and relevant context; routine users cannot use the System Log as an editing surface.

## 12. Recurrence and materialized occurrences

### Current / shipped

Recurring Events and Tasks are represented by a series definition plus real materialized occurrence rows. Each occurrence has its own stable record ID and workflow state; the series does not replace the individual Events or Tasks. Creation supports daily or weekly schedules, an interval, weekly weekdays where relevant, and an ending count or date, with a read-only date preview. The trusted database independently validates the generated schedule. Recurring Event Time Slot configuration is copied into independently owned slot rows for each new occurrence; slot signups remain occurrence-specific. “This occurrence,” “This and following occurrences,” and “All occurrences” use the existing recurrence scopes. A scoped slot edit is applied only when it can preserve independent selections, capacity, Event bounds, and historical Point transactions; otherwise the operation fails atomically with a clear error.

Edits and removals for a recurring occurrence offer **This occurrence**, **This and following occurrences**, or **All occurrences**. Events also support cancellation at those scopes. Only fields changed in the form apply to the selected scope; per-occurrence overrides and independent signups, assignments, completion, awards, and audits are preserved. When a schedule edit creates new Event occurrences without changing Max volunteers, each new occurrence inherits the selected occurrence's capacity; existing occurrence capacities remain unchanged. A single occurrence date edit preserves its original recurrence key. Date or recurrence-definition edits create a replacement schedule segment and remap existing rows without replacing their stable IDs. Removed schedule slots are not silently recreated. No background job re-expands a series.

Each mutation checks authorization for the selected occurrence and every affected row. Archive restore is per occurrence and does not regenerate a removed schedule slot or restore following occurrences. Series revisions reject stale edits. Request keys make exact retries idempotent; reusing a key with different input or actor is rejected. Database mutations lock affected series/rows and commit row changes, series metadata, audit entries, and request receipts together. Event wall-clock times remain in America/Denver across daylight-saving changes; Task due dates are date-only.

## 13. Entity lifecycles and invariants

These are product lifecycle operations, not a promise that every entity supports generic create/read/update/delete. **Planned** entries are accepted future behavior from the cited Issue and are not available on current `main`.

| Entity            | Lifecycle                                                                                           | Lifecycle rules                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Officer           | Create / View / Edit / Deactivate / Reactivate                                                      | Current. No routine hard delete. History and relationships survive inactivity. Application access requires an active Officer.                                                                                                                                                                                                                                                                                  |
| Event             | Create / View / Edit / Cancel / Restore cancellation / Archive / Restore archive                    | Current. Authorized managers archive and restore a same-scope Event occurrence. Archive history survives; restoration does not itself uncancel an Event. Archived Events have an explicit manager view and stay out of routine workflows. |
| Task              | Create / View / Edit / Archive / Restore archive                                                     | Current. Authorized managers archive eligible Tasks and restore the same occurrence. Task, assignment, Point, and audit history are preserved; completed/awarded states remain protected from archival. Archived Tasks have an explicit manager view and stay out of routine workflows. |
| Point transaction | Create / View / Edit amount where authorized / Correction / Logical removal                         | Current. Totals derive from active transactions. Corrections are separate transactions; removal retains auditable history.                                                                                                                                                                                                                                                                                     |
| Warning           | Create / View / Approve / Reject / Void                                                             | Admins create and void; Officers see approved warnings and assigned approvers decide pending warnings. Void preserves decisions and is terminal. Reason is immutable.                                                                                                                                                                                                                                         |
| Catalog value     | Create / View / Rename / Retire / Reactivate where supported                                        | Current: create, view, rename, and reference-safe deletion for supported catalogs. Admins can retire/reactivate Branches and custom Positions; retired values remain valid on existing relationships but cannot be newly assigned. Required Positions cannot be renamed, deleted, or retired. |

## 14. Trusted database/server invariants

The following rules are enforced, or must be enforced where indicated, at a trusted database/server boundary. Hiding or disabling UI controls alone is not authorization or integrity enforcement.

| Invariant                          | Status and rule                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Officer email identity             | Current. At least one of UTEP or personal email is required. Addresses are normalized and unique case-insensitively across both fields and all Officers.                                                                                                                                                                                                                                 |
| Officer access                     | Current. A valid linked authentication identity must resolve to one active Officer. Inactive or unlinked accounts do not gain application access.                                                                                                                                                                                                                                        |
| Position, Branch, application role | Current. Each Officer has one Position; Branch membership is separate and many-to-many; `application_role` is separate from both. The six required Positions have stable, non-null machine codes used by authorization; custom Positions have stable database IDs but `code = NULL`, and display names never grant system privileges.                                                    |
| Branch authorization               | Current. Event Lead management requires a shared Branch and excludes global Events. Admin/global Event and Task scopes are checked by trusted mutations. Linking or assignment does not grant unrelated permissions.                                                                                                                                                                     |
| Event schedule and type            | Current. Event date and start/end timestamps must form a valid same-day America/Denver schedule between 06:00 and 23:59, with end later than start. Event Type must reference the canonical catalog; only available types may be selected for new Events, while historical references remain valid.                                                                                      |
| Recurrence identity                | Current. A series request key identifies the accepted request/input for idempotent retries. Occurrence rows have stable IDs and unique series/date identity. Mutations preserve history, reject stale revisions and incompatible identities, and do not silently recreate removed occurrences.                                                                                           |
| Native Event signup                | Current. The Event/Officer pair is unique, eligible signups reference active Officers, and only trusted authorized mutations alter signup relationships.                                                                                                                                                                                                                                 |
| Event capacity                     | Current. Events without Time Slots may have an optional positive per-occurrence Max volunteers limit; confirmed signups cannot exceed it, capacity changes serialize with signup mutations, and lowering below the confirmed count fails. Slotted Events use optional per-slot limits and have no Event-wide Max volunteers value. New unslotted occurrences created by a recurring schedule edit inherit the selected occurrence's limit when capacity is unchanged; existing occurrence overrides remain independent. |
| Event primary awards               | Current. Ordinary Event participation and Event-linked manual awards share one active primary award per Officer/Event; corrections may coexist. Slot-linked participation may have one active automatic award per Officer/slot, while an active Event-linked manual award still takes precedence. Removed transactions remain in history, and an intentionally removed automatic award is not regenerated. |
| Task assignments                   | Current. `task_officer_assignments` is canonical, with one assignment per Task/Officer pair. Assignment, completion, authorization, and history are occurrence-scoped.                                                                                                                                                                                                                   |
| Task awards                        | Current. Award state follows each assignment's completion, due date, and configured Task points. Reconciliation reuses the same Task/Officer transaction; protected completed/awarded states cannot be erased by removal or point edits.                                                                                                                                                 |
| Historical relationships           | Current. Officer references and logical Event, Task, and Point removal preserve historical relationships. Catalog deletion is restricted when referenced; Branch and custom Position retirement preserves existing references and catalog IDs.                                                                                                                                                            |
| Point totals                       | Current. Routine Officer totals include active Officers and sum active transactions only. Inactive Officers remain available in profiles and Point history; manual/correction transactions require an active recipient. Removed rows remain queryable by authorized audit/history workflows and do not count.                                                                                     |
| RLS and credentials                | Current. RLS and trusted server/database authorization enforce sensitive access. Privileged or service-role credentials never belong in browser code.                                                                                                                                                                                                                                    |

## 15. Planned / accepted behavior

### Google Calendar Event mirror — Issue #29

**Planned / accepted; not shipped on current `main`.** Cappy Hub is authoritative; the existing private CIC Google Calendar is a one-way mirror of every eligible Event occurrence, across types and Branches. Initial activation includes upcoming and happening Events through a one-time explicit activation procedure. Create, edit, cancellation/restoration, archive/restoration, and recurring occurrence changes update the same logical Google event. Cancelled Events remain visible and free; archived Events are removed. The mirror contains Event name, America/Denver date and time, location, the general Event description, and a protected Cappy Hub link. It never includes signups, attendees, other resource links, internal notes, Points, audit data, or Tasks. Signup and withdrawal do not synchronize. Google-side changes never edit Cappy Hub. Event mutations commit before direct server-side Google API calls. A Google failure leaves the Cappy Hub change saved and shows a warning; there is no automatic retry, and a later normal Event modification may update the mirror. Calendar sharing remains CIC's responsibility; production activation requires authorized server-side write access.

## 16. Audit and history expectations

Meaningful mutations should retain enough context to understand what changed, who acted, which record was affected, and when. The System Log is the human-readable administrative view over that audit history. Actor attribution should refer to the Officer identity where supported and retain system attribution for scheduled processing. Routine reads and navigation are not audit events.

Logical removal, deactivation, cancellation, correction, retirement, void, and restore transitions preserve prior history rather than rewriting unrelated relationships. A correction changes the current effective data through an explicit action; it does not make the original action disappear. Historical compatibility fields and older audit event names may remain in data without defining a current workflow.

## 17. Explicit non-goals and external systems

- Google Drive remains the external collaborative file system; Event resource fields store URLs only.
- The Event Signup sheet is an optional external resource URL. There is no Google Sheets OAuth, row synchronization, import, export, or roster reconciliation.
- Additional Officer profile fields have no approved allowlist; Issue [#140](https://github.com/ehuerta6/cappy-hub/issues/140) remains blocked pending field-specific purpose, visibility, editing, retention, and audit decisions. Candidate onboarding fields are not requirements.
- The internal Calendar is read-only and is not a second source of scheduling truth. The accepted Google Calendar mirror in [#29](https://github.com/ehuerta6/cappy-hub/issues/29) is separate, one-way Event synchronization; it does not include Task deadlines or calendar administration.
- Cappy Hub has no separate attendance/check-in subsystem. Confirmed native Event signups are the participation roster under current behavior.
- The Dashboard does not introduce speculative analytics, metrics, or duplicated workflows.
- The System Log does not provide a second mutation interface or log ordinary reads.
- Do not resurrect the retired single-assignee Task compatibility model or legacy Task completion/approval RPC workflow.

## 18. Technical architecture and sources of truth

The frontend uses Next.js, React, TypeScript, and Tailwind CSS. Supabase provides PostgreSQL, authentication, Row Level Security, and trusted database mutation boundaries. PostgreSQL migrations in `supabase/migrations/` are the source of truth for schema and reproducible database behavior. Generated database types describe the schema contract and should be regenerated when schema changes require it.

Browser code may use only client-safe credentials. Service-role and other privileged credentials stay server-side. Sensitive authorization belongs in trusted server/database logic and RLS, not solely in the interface.

Use this canonical authority order when maintaining product behavior:

1. Current Product & Technical Specification.
2. Newest explicit maintainer/user decision.
3. Approved feature specifications.
4. Active GitHub Issue and accepted clarifications.
5. Repository documentation and migrations.
6. Current implementation as evidence of what is shipped.

The active Issue defines implementation scope within this order. If sources materially conflict, record the discrepancy and resolve it using the higher-authority source. A new explicit decision may require this specification to be updated; update it so it remains the canonical product source. Repository documentation and migrations define reproducible technical behavior, while the current implementation is evidence of shipped behavior.
