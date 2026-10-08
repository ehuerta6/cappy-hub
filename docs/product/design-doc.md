# Cappy Hub Product & Technical Specification

This is the canonical specification for Cappy Hub product behavior, terminology, scope, and technical contracts. It records behavior shipped on the current `main` branch separately from accepted future decisions.

The separate [`docs/design.md`](../design.md) is the authority for visual and interaction guidance. It does not replace this product specification, and this specification does not replace the visual design guide.

## 1. Product purpose and scope

Cappy Hub is Coding Interview Club's internal administrative application. It provides structured workflows for Officers, Events, Tasks, participation Points, Warnings, and related administration. The Dashboard summarizes those workflows; it is not an independent analytics or workflow system.

Google Drive remains CIC's collaborative file system. Discord remains its primary communication platform. Cappy Hub may store links to external files, but it does not copy or synchronize their contents. Native Cappy Hub records remain authoritative for the workflows represented in the application.

## 2. Product status convention

- **Current / shipped** describes behavior present on the current `main` branch at the time this document is maintained.
- **Planned / accepted** describes a product decision captured by an approved, open Issue. It is not shipped behavior and must not be presented as available in the application.
- An open Issue alone does not make unrelated ideas part of the roadmap. Work remains subject to its Issue scope and review.

The accepted future decisions relevant to current domain boundaries are summarized in [Planned / accepted behavior](#15-planned--accepted-behavior). They do not change the shipped descriptions elsewhere in this document.

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
| Event             | Scheduled occurrence with one catalog Event Type, optional Branches, native Officer signups, resource links, and participation Point transactions.                  |
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

Position authorization uses stable, non-null machine codes only for the six required Positions: President, Vice President of Operations, Vice President of Academics, Secretary, Lead, and Officer. These codes are independent of display names, and the required Positions cannot be renamed or deleted. Every Position has a stable database ID; custom Positions intentionally retain `code = NULL`, so changing or copying a display name cannot grant system privileges. Admins may create and rename custom Positions; safe deletion is allowed only when no Officer uses the Position. Branches may be created or renamed, and safe deletion is restricted when historical records still reference them.

### Planned / accepted

## 6. Events

### Current / shipped

An Event occurrence can be created, viewed, and edited within the caller's trusted management scope. Events use a catalog Event Type. Current available types include Meeting, Social, Workshop, and **Session**; historical types may remain readable without being offered for new Events. An Event Type is classification, not a separate workflow.

Events have an America/Denver local date and wall-clock schedule, a reusable location value, zero or more Branches, and optional Slides, Meeting notes, and Signup sheet URLs. The optional Signup sheet is an **external resource URL only**. Native Cappy Hub Event signup is the authoritative roster. No Sheet rows are imported, exported, synchronized, counted as participation, or used to award Points.

Officers sign themselves up or leave through the native signup workflow while signup is open. Authorized managers can add or remove multiple active Officers in bulk. A unique Event/Officer relationship represents the signup and participation roster. Events with no Branches are global and managed only by Admins or Event executives.

Schedule determines whether an Event is upcoming, happening, or past. Cancellation is a separate state: authorized managers may cancel only when the Event is not ended or already processed. A cancelled Event can be restored through the existing restore-cancellation workflow; restoration recalculates its status from its schedule. Logical removal (currently labeled Remove in the product) preserves the Event row, signups, Branches, processing state, Points, recurrence identity, and audit history. Removed Events are excluded from normal workflows and Calendar.

The Events page defaults to current non-cancelled Events and can show Upcoming, Happening, Past, or Cancelled groups. Events are organized around the signed-in Officer's own signups and other Events; signups are offered only while the Event permits them. The Dashboard and Calendar omit cancelled and removed Events.

When a non-cancelled, non-removed timed Event ends, trusted scheduled processing snapshots the current participation rate and awards scheduled duration multiplied by that rate to each current signup. Editing a past Event does not recalculate existing awards. Corrections are explicit Point transactions.

### Planned / accepted

Issue [#178](https://github.com/ehuerta6/cappy-hub/issues/178) accepts optional per-occurrence Max volunteers and a separate deterministic FIFO waitlist. Until implemented, all current native signups behave as they do on `main`; there is no capacity or waitlist state. When implemented, only confirmed native signups will count as participants and be eligible for Event participation awards. An external Signup sheet will remain a link and will not affect capacity or waitlist.

## 7. Tasks

### Current / shipped

A Task has a title, description, Task type, one Branch, date-only due date, Point value, and recurrence metadata when applicable. Its assignments are stored in **`task_officer_assignments`**, the canonical assignment relation. One Task can have multiple Officers. Officers can self-assign when the Task is open to assignment; authorized managers can assign or remove one or multiple Officers.

Completion is tracked independently for each Task/Officer assignment. Only authorized managers change completion. A completed assignment earns the Task's fixed Point value after its due date has passed in America/Denver. A scheduled database processor handles due Tasks when the application is closed. If an authorized manager changes completion after the due date, the corresponding award is reconciled. Reversing completion logically removes the award; completing again reactivates the same Task/Officer transaction. Assignment or completion changes are not a separate Officer approval workflow.

Completed assignments and active Task awards protect a Task from removal. Task Points cannot be changed after an assignment is completed or awarded. Due-date processing uses each assignment's current completion state. Historical approval fields or audit entries retained from an older workflow are historical compatibility only; the retired single-assignee projection and legacy completion/approval RPC workflow are not current product behavior.

The Tasks page groups non-removed Tasks into **Current** (due today or later) and **Past** (overdue), with status filters for Open, In progress, and Complete. Assignment progress and the current Officer's relationship to each Task are visible in context. The Calendar shows each Task due date and opens the canonical Task record.

Logical removal (currently labeled Remove in the product) is restricted by the Task's protected completion/award state and preserves the Task, assignment, Point, recurrence, and audit history. Removed Tasks are excluded from normal lists, Dashboard action items, and Calendar.

### Planned / accepted

Issue [#179](https://github.com/ehuerta6/cappy-hub/issues/179) accepts optional links between a Task and zero or more Events. Those links will provide context only: they do not merge Event and Task authorization, completion, signup, or Point workflows. Existing relationships must survive cancellation, archival, and historical state changes.

## 8. Points

### Current / shipped

Point transactions are signed amounts, and an Officer's total is the sum of active transactions (`removed_at` is null). The supported types are participation, task, manual, and correction. Transactions may link to an Event or Task as appropriate and retain actor attribution. Event participation and Task completion awards are processed by trusted database workflows. Admins may change the participation rate, create manual transactions/corrections, edit transaction amounts where authorized, and logically remove transactions.

Logical removal excludes a transaction from totals while preserving its row and history. Removing an automatic award does not cause its processor to recreate it. A correction is a separate signed transaction and does not erase the original. Event edits do not rewrite existing awards. Point History is searchable by Officer, reason, Event, or Task and filterable by award type, Officer, Event, and activity-date range. Admins can select Active, Removed, or All history and see actor/removal information; other Officers see active history. History is paginated 25 rows at a time.

The Points page shows the participation rate, ranked Officer totals, authorized transaction controls, and Point History. The Dashboard shows the signed-in Officer's total, net signed transactions created in the current half-year (January–June or July–December, America/Denver), and the latest 10 active transactions.

### Planned / accepted

Issue [#180](https://github.com/ehuerta6/cappy-hub/issues/180) accepts a database-enforced limit of one active primary Event award per Officer/Event pair, where primary awards are participation and Event-linked manual awards. Corrections may coexist, and Task awards are outside this invariant. Current processing prevents duplicate participation awards, including regeneration of a removed automatic award, but the broader active participation/manual uniqueness rule is not yet shipped.

## 9. Warnings

### Current / shipped

Admins create a Warning for an Officer with a nonblank reason that cannot be edited afterward. Creation snapshots the current President and Vice Presidents as required approvers, excluding the warned Officer if they are among them. Required approvers must be active and have linked accounts. Every snapshotted approver must approve for the Warning to become approved; any rejection makes it rejected. Decisions are attributed to the deciding Officer and recorded in the System Log.

Pending and rejected Warnings are visible to Admins; an assigned approver can see and decide their pending decision. Officers see approved Warnings on their own profile. Only approved Warnings count toward the threshold. Three approved Warnings flag the Officer for Admin review; they do not automatically deactivate the Officer. Admins can currently delete a Warning through the product workflow, with a deletion audit record.

### Planned / accepted

Issue [#186](https://github.com/ehuerta6/cappy-hub/issues/186) accepts replacing routine physical Warning deletion with **Void**. A voided Warning will retain its reason, original status, approvers, decisions, timestamps, and audit history; it will not count toward totals or accept new decisions. Admins will have a deliberate Voided/All history view. The accepted decision has no restore/unvoid transition; issuing a new Warning creates a new record.

## 10. Dashboard and internal Calendar

### Dashboard — current / shipped

The Dashboard is a current summary and personal action surface. It shows the signed-in Officer's name and Position, personal Point total/profile link, active Officer count, upcoming Event count, half-year signed Point total, up to five personal action items (pending Warning decisions are prioritized ahead of incomplete assigned Tasks), upcoming non-cancelled/non-removed Events with signup state, and the latest 10 active Point transactions. Its summaries derive from domain records; they are not separately maintained data or new workflows.

### Calendar — current / shipped

The internal Calendar is a read-only combined view of non-cancelled, non-removed Event occurrences and non-removed Task due dates from their source records. Selecting an item opens its canonical Event or Task. Display filters change only what is shown. Calendar is not a second source of scheduling truth and does not synchronize to Google Calendar.

## 11. Admin and System Log

### Current / shipped

The Admin landing page is an Admin-only directory to the existing workflows: Officer access and warning management, Position/Branch/reusable Event location catalogs, Point configuration and corrections, and System Log. It does not duplicate those workflows or provide a separate analytics area.

Catalog management supports creating, renaming, and safe deletion of values according to current reference restrictions. Required Positions are protected. Reusable Event locations are suggested choices; a valid Event may use a new location. Destructive catalog actions use confirmation and trusted reference checks. Event Type availability is controlled through its catalog and old types may remain available for historical display.

System Log is Admin-only and records meaningful changes across Officers and access, catalogs, Events and recurrence, signups, Tasks and assignments/completion, Points, Warnings, configuration, and account linking. It is newest first, with search and filters for actor (including System), action, entity, and date. The 50-row pages show readable actor/activity/record/details; before/after changes are human-readable, with technical identifiers and payload available when needed. Reads, page views, search, and navigation are not logged. Audit records retain actor, entity, timestamp, and relevant context; routine users cannot use the System Log as an editing surface.

### Planned / accepted

Issue [#185](https://github.com/ehuerta6/cappy-hub/issues/185) accepts retiring and reactivating Branches and custom Positions without deleting their IDs or historical references. Retired values will remain readable on existing records but will not be selectable for new relationships. The six required Positions remain protected and are not retireable under that decision. This lifecycle is not shipped on current `main`.

## 12. Recurrence and materialized occurrences

### Current / shipped

Recurring Events and Tasks are represented by a series definition plus real materialized occurrence rows. Each occurrence has its own stable record ID and workflow state; the series does not replace the individual Events or Tasks. Creation supports daily or weekly schedules, an interval, weekly weekdays where relevant, and an ending count or date, with a read-only date preview. The trusted database independently validates the generated schedule.

Edits and removals for a recurring occurrence offer **This occurrence**, **This and following occurrences**, or **All occurrences**. Events also support cancellation at those scopes. Only fields changed in the form apply to the selected scope; per-occurrence overrides and independent signups, assignments, completion, awards, and audits are preserved. A single occurrence date edit preserves its original recurrence key. Date or recurrence-definition edits create a replacement schedule segment and remap existing rows without replacing their stable IDs. Removed schedule slots are not silently recreated. No background job re-expands a series.

Each mutation checks authorization for the selected occurrence and every affected row. Series revisions reject stale edits. Request keys make exact retries idempotent; reusing a key with different input or actor is rejected. Database mutations lock affected series/rows and commit row changes, series metadata, audit entries, and request receipts together. Event wall-clock times remain in America/Denver across daylight-saving changes; Task due dates are date-only.

## 13. Entity lifecycles and invariants

These are product lifecycle operations, not a promise that every entity supports generic create/read/update/delete. **Planned** entries are accepted future behavior from the cited Issue and are not available on current `main`.

| Entity            | Lifecycle                                                                                           | Lifecycle rules                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Officer           | Create / View / Edit / Deactivate / Reactivate                                                      | Current. No routine hard delete. History and relationships survive inactivity. Application access requires an active Officer.                                                                                                                                                                                                                                                                                  |
| Event             | Create / View / Edit / Cancel / Restore cancellation / Remove (logical) / Archive / Restore archive | Create/view/edit/cancel, cancellation restoration, and logical removal (currently labeled Remove) are current. Archive/Restore terminology and archive restoration are planned by [#184](https://github.com/ehuerta6/cappy-hub/issues/184). Event history survives; temporal state follows the schedule when not cancelled. Planned restore updates the same occurrence and does not itself uncancel an Event. |
| Task              | Create / View / Edit / Remove (logical) / Archive / Restore archive                                 | Create/view/edit and logical removal (currently labeled Remove) are current. Archive/Restore terminology and archive restoration are planned by [#184](https://github.com/ehuerta6/cappy-hub/issues/184). Task, assignment, Point, and audit history are preserved; completed/awarded states remain protected. Planned restore updates the same materialized occurrence and preserves its workflow state.      |
| Point transaction | Create / View / Edit amount where authorized / Correction / Logical removal                         | Current. Totals derive from active transactions. Corrections are separate transactions; removal retains auditable history.                                                                                                                                                                                                                                                                                     |
| Warning           | Create / View / Approve / Reject / Void                                                             | Create/view/approve/reject and Admin deletion are current. Void is planned by [#186](https://github.com/ehuerta6/cappy-hub/issues/186), and will preserve decisions. Reason is immutable.                                                                                                                                                                                                                      |
| Catalog value     | Create / View / Rename / Retire / Reactivate where supported                                        | Current: create, view, rename, and reference-safe deletion for supported catalogs; required Positions cannot be renamed/deleted. Branch and custom Position retirement/reactivation is planned by [#185](https://github.com/ehuerta6/cappy-hub/issues/185). Existing historical references remain valid.                                                                                                       |

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
| Event capacity                     | Planned by [#178](https://github.com/ehuerta6/cappy-hub/issues/178). When implemented, confirmed signups must never exceed a positive per-occurrence capacity; capacity-changing mutations are serialized and rejected if lowering would overfill.                                                                                                                                       |
| Event waitlist                     | Planned by [#178](https://github.com/ehuerta6/cappy-hub/issues/178). Waitlisted Officers are stored separately from confirmed signups, cannot also be confirmed for the same occurrence, and do not count as participants or receive participation awards before promotion.                                                                                                              |
| Event primary awards               | Current. An Officer/Event pair cannot receive a duplicate participation award, including after logical removal, so automatic processing does not recreate removed awards. Planned by [#180](https://github.com/ehuerta6/cappy-hub/issues/180): additionally enforce at most one active primary Event award across participation and Event-linked manual awards; corrections may coexist. |
| Task assignments                   | Current. `task_officer_assignments` is canonical, with one assignment per Task/Officer pair. Assignment, completion, authorization, and history are occurrence-scoped.                                                                                                                                                                                                                   |
| Task awards                        | Current. Award state follows each assignment's completion, due date, and configured Task points. Reconciliation reuses the same Task/Officer transaction; protected completed/awarded states cannot be erased by removal or point edits.                                                                                                                                                 |
| Historical relationships           | Current. Officer references and logical Event, Task, and Point removal preserve historical relationships. Catalog deletion is restricted when referenced; accepted retirement keeps references intact.                                                                                                                                                                                   |
| Point totals                       | Current. Routine Officer totals include active Officers and sum active transactions only. Inactive Officers remain available in profiles and Point history; manual/correction transactions require an active recipient. Removed rows remain queryable by authorized audit/history workflows and do not count.                                                                                     |
| RLS and credentials                | Current. RLS and trusted server/database authorization enforce sensitive access. Privileged or service-role credentials never belong in browser code.                                                                                                                                                                                                                                    |

## 15. Planned / accepted behavior

The following table captures accepted, open product decisions as of this revision. It is intentionally not a general roadmap.

| Issue                                                    | Accepted decision                                                                                                                                                          | Current state                                                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [#177](https://github.com/ehuerta6/cappy-hub/issues/177) | Active Officers are the default working set across routine lists and selectors; inactive Officers remain deliberately discoverable with historical relationships intact.   | Shipped. Officers defaults to Active with Active/Inactive/All filters; routine Point totals and new selectors use active Officers, while history remains readable. |
| [#178](https://github.com/ehuerta6/cappy-hub/issues/178) | Optional per-occurrence Event capacity; separate deterministic FIFO waitlist; confirmed native signups remain the participation roster.                                    | Planned. No capacity/waitlist feature is shipped.                                                                            |
| [#179](https://github.com/ehuerta6/cappy-hub/issues/179) | Tasks may link to zero or more Events; links provide context and grant no permissions or Point behavior.                                                                   | Planned. No Task/Event relationship is shipped.                                                                              |
| [#180](https://github.com/ehuerta6/cappy-hub/issues/180) | One active primary Event award per Officer/Event across participation and Event-linked manual award types; corrections remain separate.                                    | Planned integrity hardening; current participation idempotency remains in force.                                             |
| [#184](https://github.com/ehuerta6/cappy-hub/issues/184) | Use Archive/Restore for logical Event/Task removal; restore the same materialized occurrence without changing its workflow state, and do not implicitly uncancel an Event. | Planned. Current logical removal is labeled Remove; archive terminology and restoration are not shipped.                     |
| [#185](https://github.com/ehuerta6/cappy-hub/issues/185) | Retire/reactivate Branches and custom Positions while preserving IDs and historical references.                                                                            | Planned. Current reference-safe deletion rules remain.                                                                       |
| [#186](https://github.com/ehuerta6/cappy-hub/issues/186) | Void Warnings while preserving approval history; void is terminal and excluded from active warning totals.                                                                 | Planned. Current Admin deletion workflow remains.                                                                            |
| [#187](https://github.com/ehuerta6/cappy-hub/issues/187) | Label the optional Sheet resource clearly as external so it cannot be confused with native signup, capacity, waitlist, or participation.                                   | Planned copy clarification. The resource remains a URL and has no Sheet synchronization.                                     |

## 16. Audit and history expectations

Meaningful mutations should retain enough context to understand what changed, who acted, which record was affected, and when. The System Log is the human-readable administrative view over that audit history. Actor attribution should refer to the Officer identity where supported and retain system attribution for scheduled processing. Routine reads and navigation are not audit events.

Logical removal, deactivation, cancellation, correction, and future retirement/void/restore transitions preserve prior history rather than rewriting unrelated relationships. A correction changes the current effective data through an explicit action; it does not make the original action disappear. Historical compatibility fields and older audit event names may remain in data without defining a current workflow.

## 17. Explicit non-goals and external systems

- Google Drive remains the external collaborative file system; Event resource fields store URLs only.
- The Event Signup sheet is an optional external resource URL. There is no Google Sheets OAuth, row synchronization, import, export, or roster reconciliation.
- Additional Officer profile fields have no approved allowlist; Issue [#140](https://github.com/ehuerta6/cappy-hub/issues/140) remains blocked pending field-specific purpose, visibility, editing, retention, and audit decisions. Candidate onboarding fields are not requirements.
- The internal Calendar is read-only. Google Calendar integration is separate work tracked by [#29](https://github.com/ehuerta6/cappy-hub/issues/29) and is not part of this specification's shipped behavior or Issue #183 scope.
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
