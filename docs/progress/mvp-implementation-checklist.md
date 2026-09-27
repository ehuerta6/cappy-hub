

> [!info] Status baseline  
> **POC snapshot:** 2026-09-27  
> **Product source of truth:** Cappy Hub Design Doc  
> **Implementation source of truth:** Current repository state
> 
> - `[x]` beside an implementation item = confirmed implemented in the current POC.
>     
> - `[ ]` beside an implementation item = still required or incomplete.
>     
> - Resolved product decisions are marked `[x]` in Section 65; that does not mean implementation is complete.
>     

---

# 0. MVP Definition

## Core product scope

- [x] Cappy Hub exists as an internal web application.
    
- [x] Dashboard area exists.
    
- [x] Officers area exists.
    
- [x] Events area exists.
    
- [x] Points area exists.
    
- [ ] System Log area exists for administrators.
    
- [ ] Final authenticated internal-user experience exists.
    
- [ ] Final production authorization model exists.
    
- [ ] All MVP workflows from the Design Doc are implemented end-to-end.
    

## MVP core systems

- [x] Officer management — core POC.
    
- [x] Event management — core POC.
    
- [x] Event/officer participation — core POC.
    
- [x] Transaction-based points — core POC.
    
- [x] Dashboard summaries — core POC.
    
- [ ] Authentication.
    
- [ ] Account-to-officer linking.
    
- [ ] Application roles.
    
- [ ] Branch-scoped authorization.
    
- [ ] Final RLS policies.
    
- [ ] Trusted automatic event-completion processing.
    
- [ ] Participation rate configuration.
    
- [ ] Participation-rate snapshots.
    
- [ ] Warning system.
    
- [ ] Warning approval workflow.
    
- [ ] Flyer workflow.
    
- [ ] Recurring events.
    
- [ ] System/audit log.
    
- [ ] Final actor attribution for protected mutations.
    

---

# 1. Project Foundation

## Next.js application

- [x] Next.js project exists.
    
- [x] App Router is being used.
    
- [x] TypeScript is enabled.
    
- [x] TypeScript strict configuration is enabled.
    
- [x] React is configured.
    
- [x] Tailwind CSS is configured.
    
- [x] Global styles exist.
    
- [x] Root layout exists.
    
- [x] Generic application error boundary exists.
    
- [x] Not-found page exists.
    
- [x] Dynamic database-dependent pages render at request time.
    
- [x] Server Components are used for database-backed pages.
    
- [x] Client Components are used where form state is needed.
    
- [x] Server Actions handle current mutations.
    

## Current routes

- [x] `/` Dashboard.
    
- [x] `/officers`
    
- [x] `/officers/new`
    
- [x] `/officers/[id]`
    
- [x] `/officers/[id]/edit`
    
- [x] `/events`
    
- [x] `/events/new`
    
- [x] `/events/[id]`
    
- [x] `/events/[id]/edit`
    
- [x] `/points`
    
- [ ] Authentication/login surface.
    
- [ ] System Log surface.
    
- [ ] Warning administration surface/component.
    
- [ ] Participation-rate configuration surface.
    
- [ ] Administration controls for application admins.
    
- [ ] Any UI required to manage event types according to the final event-type design.
    

## Shared frontend infrastructure

- [x] Shared navigation component exists.
    
- [x] Shared UI/presentation components exist.
    
- [x] Buttons exist.
    
- [x] Form controls exist.
    
- [x] Tables exist.
    
- [x] Badges/status presentation exists.
    
- [x] Responsive Dashboard stat cards exist.
    
- [x] Points form panel exists.
    
- [x] Active navigation route indication exists.
    
- [ ] Authentication state is represented in global application UI.
    
- [ ] Logged-in officer identity is accessible where needed.
    
- [ ] Application role is accessible where needed.
    
- [ ] Role-aware navigation is implemented.
    
- [ ] Role-aware buttons/actions are implemented.
    
- [ ] Unauthorized-action feedback is implemented.
    

---

# 2. Supabase Foundation

## Current integration

- [ ] Supabase project exists.
    
- [ ] PostgreSQL database exists.
    
- [x] Supabase JS client is installed.
    
- [x] Typed `Database` definition exists.
    
- [x] Database types are used by application code.
    
- [x] Public Supabase URL is loaded from environment.
    
- [x] Publishable Supabase key is loaded from environment.
    
- [x] No service-role credential is exposed in application source.
    
- [x] `.env.local` is ignored by Git.
    
- [x] Database migrations are checked into source control.
    
- [ ] Current migration history matches checked-in migrations.
    

## Production Supabase integration

- [ ] Add Supabase Auth.
    
- [ ] Add session-aware Supabase requests.
    
- [ ] Replace anonymous application behavior with authenticated behavior.
    
- [ ] Ensure Server Components can identify the current authenticated user.
    
- [ ] Ensure Server Actions can identify the current authenticated user.
    
- [ ] Ensure database requests execute with the proper authenticated identity.
    
- [ ] Ensure direct client/database calls receive the same authorization protections as Server Actions.
    
- [ ] Remove production dependency on anonymous development write access.
    
- [ ] Remove anonymous execution access from privileged RPCs.
    
- [ ] Review grants for `anon`.
    
- [ ] Configure correct grants for `authenticated`.
    
- [ ] Review grants for views.
    
- [ ] Review grants for RPC functions.
    
- [x] Regenerate TypeScript database types after final schema migrations.
    

---

# 3. Authentication

## Resolved design

- [x] Google Sign-In through Supabase Auth is the MVP provider.
- [x] Email magic links and other email sign-in methods are outside the MVP.
- [x] An authenticated account links to an existing officer through nullable unique officers.auth_user_id referencing auth.users.id.
- [x] First-login matching uses the verified Google email against UTEP or personal email, case-insensitively.
- [x] Link only exactly one active, currently unlinked officer; deny access when there is no match or matching is ambiguous.
- [x] Subsequent requests resolve the officer through auth_user_id.
- [x] An approved user is a Google-authenticated user linked to an active officer.
- [x] Inactive officers have no application access, including read-only access; status is checked on requests and history remains preserved.
- [x] Authenticated actor fields reference auth.users.id; the officer relationship is resolved through officers.auth_user_id.

## Authentication implementation

- [ ] Configure Google provider in Supabase Auth.
- [ ] Implement Google sign-in and callback flow.
- [ ] Persist and restore the Supabase session on page requests.
- [ ] Protect internal routes and redirect unauthenticated users.
- [ ] Implement safe first-login matching and linking, including duplicate/ambiguous-match denial.
- [ ] Resolve the active officer through auth_user_id on each protected request.
- [ ] Resolve application_role and branch memberships from the linked officer.
- [ ] Reject unlinked, inactive, or otherwise unapproved users.
- [ ] Revoke access after an officer is deactivated, even for an existing session.
- [ ] Display signed-in identity where useful and provide sign-out.

# 4. Application Roles

## Resolved role model

- [x] Application roles are stored on officers.application_role.
- [x] Allowed application roles are admin and officer.
- [x] Application role is separate from club position and branch membership.
- [x] There is no third owner role; the application owner is an officer with application_role = admin.
- [x] Academic Officer position titles are descriptive only and do not grant application permissions.

## Role implementation

- [ ] Implement and constrain the application_role officer column.
- [ ] Support multiple administrators, including President, Vice Presidents, the application owner, and other designated officers as assigned.
- [ ] Allow existing admins to add/remove admin assignments through backend-protected operations.
- [ ] Prevent normal officers from promoting themselves or changing another user's role.
- [ ] Protect admin-management operations on the backend.

## Officer permissions

- [ ] Active authenticated officers can view permitted application data.
- [ ] Normal officers can manage only their own event signups.
- [ ] Normal officers cannot manage another officer's signup.
- [ ] Normal officers cannot create manual point transactions or corrections.
- [ ] Normal officers cannot remove point awards or alter configuration.
- [ ] Normal officers cannot edit other officer records or manage arbitrary events.
- [ ] Normal officers cannot access the System Log or other officers' warning records.

# 5. Branch Lead Authorization

## Resolved position capability and scope

- [x] positions.can_manage_branch_events exists in the current schema.
- [x] Only ICPC Lead, Intro Lead, and Social Media Lead positions are designated as branch leads.
- [x] Academic Officer titles are descriptive and grant no additional Cappy Hub permission.
- [x] Admins can manage all events regardless of position or branch.
- [x] A branch lead may manage an event when the lead's memberships and event branches have at least one branch in common.
- [x] A lead does not need to belong to every branch on a multi-branch event; for example, an Intro Lead in intro can manage an intro + general event.
- [x] Normal officers cannot manage arbitrary events.

## Implementation

- [ ] Set can_manage_branch_events = true only for the three designated lead positions; keep other positions false.
- [ ] Connect the capability to backend authorization.
- [ ] Determine the lead's scope from current officer branch memberships.
- [ ] Enforce the non-empty intersection rule for creating/updating events, assigning/removing signups, cancellation, early completion, and flyer work.
- [ ] Enforce branch scope in RLS/backend functions, not only through hidden buttons.
- [ ] Prevent a lead from expanding their own permission by changing event/officer branch associations.

# 6. Final Row Level Security

## Replace prototype policies

- [ ] RLS is currently enabled on all existing POC tables.
    
- [ ] Remove/replace every `TEMPORARY DEVELOPMENT` anonymous policy.
    
- [ ] Remove anonymous broad officer reads/writes as appropriate.
    
- [ ] Remove anonymous event writes.
    
- [ ] Remove anonymous signup writes.
    
- [ ] Remove anonymous point insertion.
    
- [ ] Remove anonymous privileged RPC execution.
    
- [ ] Add final policies for authenticated users.
    
- [ ] Verify views use authorization-safe access.
    
- [ ] Verify functions cannot bypass application permissions unintentionally.
    

## Officers RLS

- [x] Resolved read policy: active approved officers and admins may read other officers' names, positions, branches, UTEP/personal emails, points, point history, and event history.

- [x] Resolved warning policy: admins administer warnings; an officer sees only their own approved warnings.

- [ ] Implement these read policies in RLS and the application.
    
- [ ] Admins can create officers.
    
- [ ] Admins can edit officers.
    
- [ ] Admins can deactivate officers.
    
- [ ] Admins can reactivate officers.
    
- [ ] Normal officers cannot mutate arbitrary officer records.
    

## Officer branch RLS

- [ ] Approved users can read relevant memberships.
    
- [ ] Only authorized operations can modify officer memberships.
    
- [ ] An officer cannot arbitrarily grant themselves another branch.
    
- [ ] An officer cannot use branch changes to grant themselves lead access.
    

## Events RLS

- [ ] Approved users can read permitted events.
    
- [ ] Admins can create any event.
    
- [ ] Admins can modify any event allowed by event-state rules.
    
- [ ] Branch leads can create/modify events only when their branch memberships intersect the event branches in at least one branch.
    
- [ ] Normal officers cannot edit arbitrary events.
    
- [ ] Cancellation permissions are enforced.
    
- [ ] Early completion permissions are enforced.
    

## Event branches RLS

- [ ] Admins can assign branches to events.
    
- [ ] Branch-lead changes respect branch membership.
    
- [ ] A branch lead cannot use `event_branches` mutation to expand their own authorization improperly.
    

## Event officer/signup RLS

- [ ] Officers can add their own signup.
    
- [ ] Officers can remove their own signup.
    
- [ ] Officers cannot add another officer unless authorized.
    
- [ ] Officers cannot remove another officer unless authorized.
    
- [ ] Admins can manage all event signups.
    
- [ ] Branch leads can manage signups only when their branch memberships intersect the event branches in at least one branch.
    
- [ ] Signups remain closed after event end.
    
- [ ] Signups remain closed for cancelled events.
    

## Points RLS

- [ ] Approved users can read permitted point information.
    
- [ ] Only admins can create manual point transactions.
    
- [ ] Only admins can create corrections.
    
- [ ] Only admins can remove awards.
    
- [ ] Automated participation awards can only be generated by the trusted processing path.
    
- [ ] Normal officers cannot directly insert points.
    
- [ ] Normal officers cannot call a privileged award-processing RPC with arbitrary parameters.
    

## Warnings RLS

- [ ] Admins can create warnings.
    
- [ ] Admins can view pending warnings.
    
- [ ] Admins can view approved warnings.
    
- [ ] Admins can view rejected warnings.
    
- [ ] Required President/VP approvers can submit only their own approval decision.
    
- [ ] Officers cannot approve warnings unless they are a required approver.
    
- [ ] Assigned officers can see only approved warnings on their own profile.
    
- [ ] Assigned officers cannot see pending warnings.
    
- [ ] Assigned officers cannot see rejected warnings.
    
- [ ] Warning deletion is admin-only.
    

## Application config RLS

- [ ] Admins can read and change both participation-points-per-hour and flyer-completion-points values.
    
- [ ] Normal officers cannot change either value.
    
- [ ] Rate changes are logged.
    

## Audit log RLS

- [ ] Only admins can view System Log records.
    
- [ ] Normal officers cannot query audit logs directly.
    
- [ ] Audit records cannot be modified through normal application workflows.
    
- [ ] Audit records survive deletion of the entity they describe.
    

---

# 7. Database — Final MVP Schema

> [!note] PR 1 schema evidence
> The forward migration and local PostgreSQL tests establish the final table/column model, transactional officer branch validation, controlled event types, actor FKs, and logical-removal-aware totals/uniqueness. See [PR 1 schema verification](pr1-schema-verification.md). Checked schema items refer to checked-in migrations verified locally, not a hosted deployment. Direct prototype table writes, final identity-aware RLS, scheduled processing, warnings, and flyer workflows remain incomplete.

## Required MVP tables

- [x] `officers`
    
- [x] `positions`
    
- [x] `officer_warnings`
    
- [x] `warning_approvals`
    
- [x] `branches`
    
- [x] `officer_branches`
    
- [x] `event_types`

- [x] `events`
    
- [x] `event_branches`
    
- [x] `event_officers`
    
- [x] `point_transactions`
    
- [x] `application_config`
    
- [x] `audit_logs`
    

**Target: 13 MVP application tables.**

---

# 8. Database — officers

## Current POC columns

- [x] id
- [x] name
- [x] utep_email
- [x] personal_email
- [x] position_id
- [x] classification
- [x] status
- [x] created_at

## Final MVP authentication columns

- [x] Add nullable unique auth_user_id referencing auth.users.id.
- [x] Add application_role constrained to admin or officer.

## Current integrity

- [x] Primary key exists.
- [x] Name cannot be blank.
- [x] UTEP and personal email formats are validated.
- [x] Each email field is independently case-insensitive unique when provided.
- [x] Multiple null emails are supported.
- [x] position_id references a valid position.
- [x] Classification is nullable and permits freshman, sophomore, junior, senior, and graduate.
- [x] Status permits active and inactive.

## Final MVP identity rules

- [ ] Link at most one auth.users account to an officer.
- [ ] First-login email matching considers verified email against UTEP or personal email, case-insensitively.
- [ ] Link only exactly one active, unlinked officer; deny missing or ambiguous matches.
- [ ] Check current active status on protected requests and deny all app access to inactive officers.
- [ ] Preserve the officer and all historical relationships after deactivation.

## Remaining officer integrity rule

- [x] Enforce at least one branch through the transactional save_officer RPC.
- [ ] Restrict direct officer/membership writes so every permitted mutation preserves that requirement.
- [x] Creating an officer with zero branches must be rejected transactionally.
- [x] Editing an officer so they have zero branches must be rejected transactionally.
- [x] Do not rely solely on form checkbox validation.

# 9. Database — positions

## Current schema

- [x] id
- [x] name
- [x] can_manage_branch_events
- [x] created_at
- [x] Position names are unique controlled data.
- [x] Officers reference one position by ID.

## Resolved permission decisions

- [x] Only ICPC Lead, Intro Lead, and Social Media Lead are branch-lead positions.
- [x] Academic Officer titles are descriptive and do not grant branch-management capability.
- [x] All other catalog positions remain non-leads regardless of title.

## Remaining work

- [x] Implement can_manage_branch_events = true only for the three designated lead positions and false for all others.
- [ ] Connect this capability to backend authorization and branch-membership scope.

# 10. Database — `branches`

## Current schema

- [x] `id`
    
- [x] `name`
    
- [x] `created_at`
    
- [x] Branch names are unique.
    
- [x] Branches are stored as controlled data.
    
- [x] Current `general` branch exists.
    
- [x] Current `intro` branch exists.
    
- [x] Current `icpc` branch exists.
    
- [x] Current `social` branch exists.
    

## Scope rules

- [x] Officers may belong to multiple branches structurally.
    
- [ ] Officers must belong to at least one branch in final MVP.
    
- [x] Branches are separate from positions.
    
- [x] Resolved decision: branch-lead authorization uses a non-empty intersection of the lead’s memberships and event branches.
    

---

# 11. Database — `officer_branches`

- [x] `officer_id`
    
- [x] `branch_id`
    
- [x] Officer FK exists.
    
- [x] Branch FK exists.
    
- [x] Composite primary key exists.
    
- [x] Duplicate officer/branch memberships are prevented.
    
- [x] Many-to-many relationship works.
    
- [x] Current officer-save RPC guarantees at least one branch row on success.
- [ ] Add identity-aware authorization to the final save workflow.
    
- [ ] Final RLS protects membership mutation.
    

---

# 12. Database — events and event types

## event_types — final MVP table

- [x] Create event_types with id, unique name, and created_at.
- [x] Seed General, Intro, ICPC, Meeting, Social, and Workshop; preserve additional historical values.
- [ ] Add admin event-type creation workflow.
- [ ] Allow admins to delete only event types that are not referenced by events.
- [x] Reject deletion of referenced event types; never cascade deletion into event history.

## Existing POC event columns

- [x] id
- [x] name
- [x] description
- [x] Former POC type text migrated to event_type_id, preserving custom historical type meanings.
- [x] location
- [x] starts_at
- [x] ends_at
- [x] status
- [x] created_at

## Final MVP event columns and constraints

- [x] Implement required event_type_id referencing event_types, replacing the current POC free-text type column.
- [x] Add nullable participation_points_per_hour_at_end for the scheduled-end rate snapshot.
- [x] Add optional slides_url and meeting_notes_url.
- [x] Add optional flyer_status and flyer_assigned_to for Social flyer workflow.
- [x] Event name is nonblank and event_type_id is required; referenced type names are nonblank.
- [x] starts_at and ends_at are required in the current POC.
- [x] ends_at > starts_at is enforced in the current POC.
- [x] Current POC status values are upcoming, happening, past, and cancelled.
- [x] Resolved decision: early completion sets the existing status to past; it does not record an actual completion timestamp.
- [x] Resolved decision: preserve scheduled starts_at/ends_at; do not add completed_at or an actual-end-time field.
- [x] Resolved decision: early completion closes signup/signout, while participation processing waits until scheduled ends_at and uses the scheduled duration.
- [x] Resolved decision: keep timezone-aware timestamps and use America/Denver for event input/display.
- [x] Resolved decision: event-type names are unique; reject deletion while referenced and never cascade into event history.

# 13. Database — `event_branches`

- [x] `event_id`
    
- [x] `branch_id`
    
- [x] Event FK exists.
    
- [x] Branch FK exists.
    
- [x] Composite primary key exists.
    
- [x] Duplicate event/branch pairs are prevented.
    
- [x] An event can structurally belong to multiple branches.
    
- [x] Current event-save RPC requires at least one branch.
    
- [x] Resolved decision: branch-lead scope is based on event branches and requires at least one shared branch.
    
- [ ] Final RLS prevents unauthorized branch associations.
    

---

# 14. Database — `event_officers`

- [x] `event_id`
    
- [x] `officer_id`
    
- [x] Event FK exists.
    
- [x] Officer FK exists.
    
- [x] Composite primary key exists.
    
- [x] Duplicate officer/event signup is prevented.
    
- [x] Many officers can participate in one event.
    
- [x] One officer can participate in many events.
    
- [ ] Signup remains available until event end in POC.
    
- [ ] Signup is rejected for cancelled events in POC.
    
- [ ] Signup authorization distinguishes:
    
    - [ ] self-signup
        
    - [ ] self-signout
        
    - [ ] admin assignment
        
    - [ ] admin removal
        
    - [ ] authorized branch-lead assignment
        
    - [ ] authorized branch-lead removal
        
    
- [ ] Signup/signout actions are written to the System Log.
    

---

# 15. Database — point_transactions

## Current POC columns

- [x] id
- [x] officer_id
- [x] event_id
- [x] points
- [x] reason
- [x] award_type
- [x] created_by
- [x] created_at

## Current POC integrity

- [x] Every transaction references an officer; event is optional.
- [x] Participation requires an event.
- [x] Positive, negative, and fractional point values work.
- [x] Reason cannot be blank; numeric points are finite.
- [x] One participation award per officer/event is enforced by a unique partial index.
- [x] Point totals are derived rather than stored on officers.

## Final MVP fields and behavior

- [x] Resolved actor-FK decision: created_by, removed_by, warning_approvals.approver_id, and audit_logs.actor_id reference auth.users.id.
- [x] Add nullable removed_at and removed_by referencing auth.users.id.
- [ ] Implement logical award removal; retain the original transaction as a voided history record.
- [x] Exclude removed transactions from derived totals and ordinary active history.
- [x] Resolved decision: retain removed participation awards for idempotency so they are never regenerated.
- [x] Enforce at most one participation award per officer/event and at most one flyer award per event, including removed awards.
- [ ] Preserve removal actor, timestamp, and transaction details in the System Log.
- [ ] Store the final awarded amount in each transaction; later configuration changes do not recalculate it.

# 16. Database — `officer_warnings`

- [x] Create `officer_warnings` table.
    
- [x] Add `id`.
    
- [x] Add `officer_id`.
    
- [x] Add `reason`.
    
- [x] Add `status`.
    
- [x] Add `created_at`.
    
- [x] `officer_id` references a valid officer.
    
- [x] Warning status supports:
    
    - `pending`
        
    - `approved`
        
    - `rejected`
        
    
- [ ] Warning reason is retained for audit purposes.
    
- [ ] Warning is immutable after creation from normal application workflows.
    
- [ ] Admin physical deletion is supported.
    
- [ ] Deletion does not erase the corresponding System Log history.
    

---

# 17. Database — `warning_approvals`

- [x] Create `warning_approvals` table.
    
- [x] Add `warning_id`.
    
- [x] Add `approver_id`.
    
- [x] Add `approver_role`.
    
- [x] Add `decision`.
    
- [x] Add nullable `decided_at`.
    
- [x] Resolved decision: warning_approvals.approver_id references auth.users.id; resolve the officer through officers.auth_user_id when needed.
    
- [ ] Support President approval record.
    
- [ ] Support approval records for every Vice President.
    
- [x] Prevent duplicate warning/approver pairs.
    
- [x] Decision supports:
    
    - `pending`
        
    - `approved`
        
    - `rejected`
        
    
- [x] Nullable decided_at can store the decision timestamp.
- [ ] Voting workflow writes the timestamp when deciding.
    
- [ ] Prevent unauthorized users from writing approval decisions.
    

---

# 18. Database — application_config

- [x] Create application_config as a single-row table.
- [x] Add id.
- [x] Add participation_points_per_hour (resolved design value in application_config).
- [x] Add flyer_completion_points (resolved design value in application_config).
- [x] Add updated_at.
- [x] Validate both configured point values according to the approved numeric constraints.
- [x] Provide a predictable way to access the single configuration row.
- [ ] Allow admins to view and change both values.
- [ ] Prevent normal officers from changing either value.
- [ ] Log rate and flyer-value changes with the authenticated actor.
- [ ] Automatic participation processing reads and snapshots the current participation rate at scheduled event end.
- [ ] Flyer completion reads the current flyer amount and stores the resulting award amount permanently.

# 19. Database — audit_logs

- [x] Create audit_logs with id, actor_id, action, entity_type, entity_id, details, and created_at.
- [x] Resolved actor-FK decision: audit_logs.actor_id references auth.users.id.
- [ ] Preserve useful before/after data and deletion/removal snapshots where needed.
- [ ] Retain audit entries after source entities or logical point awards are deleted/removed.
- [ ] Protect audit records from ordinary application modification.
- [ ] Allow only admins to read System Log records.

# 20. Database Views

## Existing views

- [x] officer_point_totals
- [x] dashboard_summary
- [x] Views derive results from current records.
- [x] Totals are not duplicated into cached officer columns.
- [x] Current views use security_invoker.

## Final review

- [ ] Verify views work under authenticated RLS.
- [ ] Ensure peer officer fields match the resolved visibility policy while warnings remain restricted.
- [x] Ensure officer and Dashboard totals include only point_transactions with removed_at IS NULL.
- [ ] Verify half-year Dashboard calculations use America/Denver local calendar periods.
- [x] Verify corrections affect active totals and logically removed awards do not.

# 21. Database RPCs / Trusted Operations

## Existing RPC behavior

- [x] Atomic officer save RPC exists.
    
- [x] Atomic event save RPC exists.
    
- [x] Event signup RPC exists.
    
- [x] Completed-event point processing RPC exists.
    
- [x] Officer update + branch replacement is transactional.
    
- [x] Event update + branch replacement is transactional.
    
- [x] Participation processing is idempotent against duplicate participation awards.
    

## Final MVP work

- [ ] Make officer-save authorization identity-aware.
    
- [x] Enforce at least one officer branch in the existing transactional save workflow.
    
- [ ] Make event-save authorization identity-aware.
    
- [ ] Make signup RPC identity-aware.
    
- [ ] Distinguish self-signup from admin/lead assignment.
    
- [ ] Replace arbitrary caller-supplied participation rate behavior.
    
- [ ] Restrict completed-event processing to a trusted execution path.
    
- [ ] Integrate application configuration lookup.
    
- [ ] Snapshot participation rate onto the event.
    
- [ ] Create participation transactions using the snapshot.
    
- [ ] Add audit logging to protected mutations.
    
- [ ] Keep audit log writes consistent with the actual mutation.
    
- [ ] Review `SECURITY INVOKER`/function grants after final auth design.
    

---

# 22. Officer Management — Directory

## Officer list

- [x] `/officers` exists.
    
- [x] List all officers.
    
- [x] Display officer names.
    
- [x] Display position information.
    
- [x] Display branch memberships.
    
- [x] Display status.
    
- [x] Officer rows link to officer detail.
    
- [ ] Final page respects authentication.
    
- [ ] Final page respects any read-visibility policy decided for officer contact information.
    

## Finding officers

- [x] Officer directory provides an ordered list.
    
- [ ] Verify the final directory remains practical for finding a specific officer with production roster size.
    
- [ ] Add search/filtering only if needed to satisfy the product goal of quickly finding officers; do not add unnecessary complexity.
    

---

# 23. Officer Management — Creation

- [x] Add Officer page exists.
    
- [x] Name input exists.
    
- [x] UTEP email input exists.
    
- [x] Personal email input exists.
    
- [x] Position select exists.
    
- [x] Classification select exists.
    
- [x] Status input exists.
    
- [x] Multiple branch selection exists.
    
- [x] Positions load from controlled database records.
    
- [x] Branches load from controlled database records.
    
- [x] Empty optional emails normalize to null.
    
- [x] Email values normalize.
    
- [x] Blank classification can be null.
    
- [x] Database validates emails.
    
- [x] Database validates position.
    
- [x] Database validates classification.
    
- [x] Database validates status.
    
- [ ] Require at least one branch in UI.
    
- [ ] Require at least one branch in trusted backend path.
    
- [ ] Only admins can create officers.
    
- [ ] Creation records actor identity where needed.
    
- [ ] Officer creation is recorded in System Log if included in final mutation logging coverage.
    

---

# 24. Officer Management — Editing

- [x] Edit Officer page exists.
    
- [x] Existing values load into form.
    
- [x] Name can be edited.
    
- [x] UTEP email can be edited.
    
- [x] Personal email can be edited.
    
- [x] Email can be cleared.
    
- [x] Position can be changed.
    
- [x] Classification can be changed.
    
- [x] Classification can be cleared.
    
- [x] Branch memberships can be changed.
    
- [x] Status can be changed.
    
- [x] Officer + branch changes are transactional.
    
- [ ] Prevent save with zero branches.
    
- [ ] Only admins can edit officers.
    
- [ ] Admin authorization is server/database enforced.
    
- [ ] Relevant officer modifications are represented in System Log.
    

---

# 25. Officer Activation / Deactivation

- [x] Officer can be marked inactive.
    
- [x] Officer can be reactivated.
    
- [x] Deactivation does not delete officer record.
    
- [x] Historical event relationships remain valid.
    
- [x] Historical point transactions remain valid.
    
- [x] Inactive officers are excluded from new signup selection in current event UI.
    
- [ ] Only admins can deactivate.
    
- [ ] Only admins can reactivate.
    
- [ ] Three approved warnings visually flag an officer for admin review.
    
- [ ] Three warnings do **not** automatically deactivate the officer.
    
- [ ] Admin manually decides whether to deactivate/reactivate after warning review.
    
- [ ] Deactivation/reactivation is logged.
    

---

# 26. Officer Profile

- [x] Officer detail page exists.
    
- [x] Display name.
    
- [x] Display position.
    
- [x] Display status.
    
- [x] Display UTEP email.
    
- [x] Display personal email.
    
- [x] Display branch memberships.
    
- [x] Display total points.
    
- [x] Display event participation relationships.
    
- [x] Display point transaction history.
    
- [ ] Display approved warning count.
    
- [ ] Display approved warnings to the assigned officer.
    
- [ ] Display warning approval status to admins.
    
- [ ] Clearly flag officer for admin review at three approved warnings.
    
- [ ] Apply final permission rules to profile data.
    
- [ ] Remove arbitrary recent-history limitations if they prevent access to required historical information, or add an appropriate way to reach older records.
    

---

# 27. Warning System

## Warning creation

- [ ] Admin can create a warning.
    
- [ ] Warning is assigned to a specific officer.
    
- [ ] Warning requires a reason.
    
- [ ] Newly created warning begins pending.
    
- [ ] Create approval records for the President and every Vice President according to finalized approver identity rules.
    
- [ ] Warning cannot be edited after creation.
    
- [ ] Warning creation is recorded in System Log.
    

## Warning approval

- [ ] President can submit their decision.
    
- [ ] Each Vice President can submit their decision.
    
- [ ] Each required approver has one approval record.
    
- [ ] An approver cannot vote twice.
    
- [ ] An approver cannot modify someone else's decision.
    
- [ ] If any required approver rejects:
    
    - [ ] warning becomes `rejected`.
        
    
- [ ] If every required approver approves:
    
    - [ ] warning becomes `approved`.
        
    
- [ ] Otherwise:
    
    - [ ] warning remains `pending`.
        
    
- [ ] Each approval is logged.
    
- [ ] Each rejection is logged.
    

## Warning visibility

- [ ] Admin warnings component exists.
    
- [ ] Admin can view all warnings.
    
- [ ] Admin can filter pending warnings.
    
- [ ] Admin can filter approved warnings.
    
- [ ] Admin can filter rejected warnings.
    
- [ ] Assigned officer sees approved warnings.
    
- [ ] Assigned officer does not see pending warnings.
    
- [ ] Assigned officer does not see rejected warnings.
    
- [ ] Only approved warnings count toward officer warning total.
    

## Warning deletion

- [ ] Admin can physically delete a warning.
    
- [ ] Non-admin cannot delete warnings.
    
- [ ] Deleting the warning also handles associated approval records correctly.
    
- [ ] Audit/System Log entry survives deletion.
    
- [ ] Deletion log contains warning reason.
    
- [ ] Deletion log contains approval decisions.
    
- [ ] Deletion log contains enough details to understand the removed warning.
    

---

# 28. Event Management — Event List

- [ ] `/events` exists.
    
- [ ] Events are listed.
    
- [ ] Event name is shown.
    
- [ ] Schedule is shown.
    
- [ ] Type is shown.
    
- [ ] Signup count is shown.
    
- [ ] Branch associations are available.
    
- [ ] Event row/detail navigation exists.
    
- [ ] Logged-in officer's signup state is visible.
    
- [x] Resolved decision: event type is for organization/filtering and does not grant permissions.
    
- [ ] Apply final access rules to creation/manage actions.
    

---

# 29. Event Management — Event Creation

## Current basic fields

- [ ] Name.
    
- [x] Description.
    
- [x] Type.
    
- [x] Optional location.
    
- [x] Start time.
    
- [x] End time.
    
- [x] One or more branches.
    
- [x] Save is transactional with branch associations.
    

## Missing fields/workflows

- [ ] Optional slides URL.
    
- [ ] Optional meeting notes URL.
    
- [ ] Social-event flyer status.
    
- [ ] Social-event flyer assignee.
    
- [ ] Recurrence configuration.
    
- [ ] Role/branch authorization.
    

## Permissions

- [ ] Admin may create any event.
    
- [ ] Authorized branch lead may create event within their branch scope.
    
- [ ] Normal officer may not create arbitrary events.
    
- [ ] Permission is backend enforced.
    

---

# 30. Event Types

## Current POC

- [ ] Event `type` exists.
    
- [x] Type is required/nonblank.
    
- [ ] Form suggests:
    
    - General
        
    - Intro
        
    - ICPC
        
    - Meeting
        
    - Social
        
    - Workshop
        
    
- [x] Database currently allows any nonblank type.
    

## Final MVP

- [x] Event type remains primarily organizational and for filtering.
    
- [x] Resolved decision: event type does **not** determine branch-lead authorization.
    
- [x] Resolved decision: branch associations determine branch scope.
    
- [x] Resolved product decision: The final MVP includes an `event_types` table (13 application tables total).
    
- [x] Use `event_types` with unique names; admins manage values, and referenced types cannot be deleted.
    
- [ ] Implement the chosen admin-management behavior.
    
- [x] Resolved decision: event type changes do not alter branch permissions.
    

---

# 31. Event Scheduling and Status

- [x] Every event has start time.
    
- [x] Every event has end time.
    
- [x] End must occur after start.
    
- [x] Upcoming status can be derived from schedule.
    
- [x] Happening status can be derived from schedule.
    
- [x] Past status can be derived from schedule.
    
- [x] Cancellation is explicit.
    
- [ ] Implement admin/authorized-lead early completion.
    
- [ ] Early completion does not shorten participation-point duration.
    
- [ ] Participation points still use originally scheduled `starts_at → ends_at` duration.
    
- [x] Resolved decision: use the existing status value `past`; retain the originally scheduled timestamps and add no completion-time field.
    
- [ ] Ensure early-completed events cannot continue accepting signups.
    
- [ ] Ensure event status displayed in UI is consistent with early completion behavior.
    

---

# 32. Event Editing

- [x] Event edit page exists.
    
- [x] Current POC allows editing upcoming noncancelled events.
    
- [x] Event branch associations update transactionally.
    
- [ ] Admin has final authorized edit path.
    
- [ ] Authorized branch lead has branch-scoped edit path.
    
- [ ] Normal officers cannot edit events.
    
- [x] Editing preserves historical records.
    
- [ ] Editing recurring occurrences affects only the selected occurrence unless explicitly creating/editing a recurrence set during creation.
    
- [ ] Event edits are logged in System Log.
    

---

# 33. Event Cancellation

- [x] Event can currently be cancelled before its end.
    
- [x] Cancellation preserves event row.
    
- [x] Cancellation preserves branch relationships.
    
- [x] Cancelled event is excluded from participation processing.
    
- [x] Signups cannot be changed after cancellation in current POC.
    
- [ ] Admin authorization enforced.
    
- [ ] Branch-lead authorization enforced.
    
- [ ] Cancellation logged.
    
- [ ] Recurring schedule occurrence can be cancelled independently.
    

---

# 34. Event Deletion Rules

- [ ] Add deletion behavior required for eligible future recurring occurrences.
    
- [ ] Future occurrence can be deleted individually.
    
- [ ] Past-event deletion is not available in normal UI.
    
- [ ] Historical events remain protected.
    
- [ ] Only database owner can physically delete historical events outside normal application workflow.
    
- [ ] Deletion does not accidentally cascade historical points.
    
- [ ] Relevant deletion is represented in System Log where required.
    

---

# 35. Recurring Events

- [ ] Event creation can generate a recurring schedule.
    
- [ ] Recurrence is capped at 15 weeks.
    
- [ ] Generated occurrences stay within the current half-year:
    
    - January–June, or
        
    - July–December.
        
    
- [ ] Each generated occurrence is an independent event row.
    
- [ ] Each occurrence has its own ID.
    
- [ ] Each occurrence has its own schedule.
    
- [ ] Each occurrence has its own status.
    
- [ ] Each occurrence can be edited independently.
    
- [ ] Each occurrence can be cancelled independently.
    
- [ ] Eligible future occurrences can be deleted independently.
    
- [ ] Past occurrences cannot be deleted through UI.
    
- [ ] Copied/generated occurrences do **not** inherit officer signups.
    
- [ ] Recurrence generation validates all resulting dates.
    
- [ ] Recurrence generation validates half-year boundary.
    
- [ ] Recurrence generation validates 15-week limit.
    
- [ ] Recurrence actions respect admin/branch-lead authorization.
    

---

# 36. Event Detail View

## Existing data

- [x] Event name.
    
- [x] Description.
    
- [x] Type.
    
- [ ] Location.
    
- [x] Start time.
    
- [x] End time.
    
- [ ] Derived/displayed status.
    
- [ ] Associated branches.
    
- [ ] Associated officers.
    
- [x] Related point transactions.
    
- [x] Signup controls.
    
- [x] Cancellation control.
    

## Missing MVP data

- [ ] Slides link.
    
- [ ] Meeting notes link.
    
- [ ] Social flyer status.
    
- [ ] Social flyer assignee.
    
- [ ] Flyer completion control.
    
- [ ] Flyer award information.
    
- [ ] Role-aware signup controls.
    
- [ ] Role-aware event management controls.
    
- [ ] Early-completion control.
    
- [ ] Participation rate snapshot visible to admins if useful for explaining generated awards.
    

---

# 37. Event File Links / Google Drive

- [ ] Add nullable `slides_url`.
    
- [ ] Add nullable `meeting_notes_url`.
    
- [ ] Display slides link when present.
    
- [ ] Display meeting notes link when present.
    
- [ ] Allow authorized event managers to set/update these links.
    
- [ ] Keep actual collaborative files in Google Drive.
    
- [ ] Do not duplicate presentation content into Cappy Hub database.
    
- [ ] Do not duplicate meeting-note content into Cappy Hub database.
    
- [ ] Cappy Hub stores/references URLs only where needed.
    
- [ ] Validate/handle empty URLs appropriately.
    

---

# 38. Social Event Flyer Workflow

## Data

- [ ] Add `flyer_status`.
    
- [ ] Add `flyer_assigned_to`.
    
- [ ] `flyer_assigned_to` references an officer.
    
- [ ] Flyer fields are relevant for Social events.
    

## UI

- [ ] Event detail shows flyer status.
    
- [ ] Event detail shows assigned officer.
    
- [ ] Authorized user can assign flyer work.
    
- [ ] Authorized user can change status.
    
- [ ] Admin can mark flyer done.
    
- [ ] Authorized lead for event branch can mark flyer done.
    

## Points

- [x] Resolved product decision: the flyer award amount comes from `application_config.flyer_completion_points`.
    
- [ ] Implement flyer award using the configured amount and award it to `flyer_assigned_to`.
    
- [ ] Completing flyer work creates no more than one flyer award for the event.
    
- [ ] Add `flyer` point transaction type.
    
- [ ] Add uniqueness rule preventing duplicate flyer award.
    
- [ ] Flyer award references event.
    
- [ ] Flyer completion is logged.
    
- [ ] Flyer award is logged.
    

---

# 39. Event Participation / Signups

## Current POC

- [x] Officer/event many-to-many relationship exists.
    
- [x] Active officers can be added through event detail.
    
- [x] Existing signup can be removed.
    
- [x] Duplicate signup is impossible.
    
- [x] Signup closes after event ends.
    
- [x] Signup closes after cancellation.
    

## Final identity-aware behavior

- [ ] Logged-in officer can sign themselves up.
    
- [ ] Logged-in officer can sign themselves out.
    
- [ ] Logged-in officer cannot sign another officer up.
    
- [ ] Logged-in officer cannot remove another officer.
    
- [ ] Admin can sign up any eligible officer.
    
- [ ] Admin can remove any officer.
    
- [ ] Authorized branch lead can sign up officers for an event in their branch scope.
    
- [ ] Authorized branch lead can remove officers from an event in their branch scope.
    
- [ ] Unauthorized branch lead cannot manage unrelated branch events.
    
- [ ] Event detail clearly shows current officer's signup status.
    
- [ ] Events page clearly shows current officer's signup status.
    
- [ ] Signup action is logged.
    
- [ ] Signout/removal action is logged.
    
- [ ] Admin/lead officer assignment is logged.
    

---

# 40. Points System — Core Model

- [x] Points are transaction based.
    
- [x] No `total_points` field is stored on officers.
    
- [x] Officer total is calculated using transaction sum.
    
- [x] Historical point transactions remain individually visible.
    
- [x] Transactions support positive values.
    
- [x] Transactions support negative values.
    
- [x] Transactions support fractional values.
    
- [x] Transactions may optionally reference an event.
    
- [x] Multiple distinct awards can exist for different reasons.
    
- [x] Corrections can be represented as additional transactions.
    
- [ ] Final admin-only permissions exist.
    
- [ ] Actor attribution is complete.
    
- [ ] Award deletion workflow exists.
    
- [ ] Flyer awards exist.
    
- [ ] All point-changing actions are audited.
    

---

# 41. Manual Point Transactions

## Existing POC

- [x] Manual point form exists.
    
- [x] Select officer.
    
- [x] Enter points.
    
- [x] Enter reason.
    
- [x] Select optional event.
    
- [x] Positive values accepted.
    
- [x] Negative values accepted.
    
- [x] Fractional values accepted.
    
- [x] Zero is rejected by current Server Action.
    
- [x] Nonfinite value is rejected.
    
- [x] Blank reason is rejected.
    

## Final MVP

- [ ] Only admins can access manual point creation action.
    
- [ ] Backend independently verifies admin role.
    
- [ ] Database authorization independently prevents unauthorized direct inserts.
    
- [x] Resolved decision: created_by references auth.users.id for the authenticated actor.
- [ ] Implement admin actor attribution.
    
- [ ] Transaction creation is logged.
    
- [ ] UI communicates validation errors clearly.
    

---

# 42. Point Corrections

- [x] Corrections are represented as additional transactions.
    
- [x] Existing original transaction does not need to be edited.
    
- [x] Positive correction is possible.
    
- [x] Negative correction is possible.
    
- [x] Correction reason is stored.
    
- [ ] Only admins can create corrections.
    
- [ ] Correction stores actor identity.
    
- [ ] Correction creation is logged.
    
- [ ] Correction UI clearly distinguishes correction from ordinary manual award.
    
- [x] Officer total immediately reflects correction.
    

---

# 43. Automatic Participation Points

## Formula

- [x] Scheduled duration can be calculated.
    
- [ ] Current POC formula is:
    
    - [x] `(ends_at - starts_at) in hours × points-per-hour`
        
    
- [x] Fractional results are supported.
    
- [x] Cancelled events are excluded.
    
- [x] Officer must have a signup row.
    
- [x] Unique index prevents duplicate participation award.
    
- [x] Repeated processing is idempotent.
    

## Current POC limitation

- [x] Prototype processing currently happens on page load.
    
- [x] Prototype currently reads rate from environment.
    
- [x] Prototype currently accepts rate as RPC parameter.
    

## Final MVP processing

- [x] Resolved decision: page loads are not a production processing trigger.
- [ ] Remove the current page-load trigger during implementation.
    
- [x] Resolved decision: Supabase Cron/pg_cron invokes a private trusted PostgreSQL function approximately once per minute.
- [ ] Implement the scheduled database function and configure its private execution path.
    
- [ ] Processing runs even when nobody loads Cappy Hub.
    
- [x] Resolved decision: process an event only once it reaches its scheduled end (scheduler polling interval is approximately one minute).
    
- [x] Resolved decision: trusted private database processing reads configured values; no anonymous rate parameter is accepted.
    
- [x] Resolved decision: read participation and flyer amounts from `application_config`.
    
- [ ] Processing stores that rate in `events.participation_points_per_hour_at_end`.
    
- [ ] Processing calculates award using that snapshot.
    
- [ ] Exactly one participation award is created per signed-up officer/event.
    
- [ ] Existing completed-event awards are never recalculated because the current global rate changes later.
    
- [ ] Later rate changes apply only to events ending afterward.
    
- [ ] Participation award creation is recorded in System Log.
    

---

# 44. Participation Rate Configuration

- [ ] Store current rate in `application_config`.
    
- [ ] Remove environment variable as the authoritative business configuration.
    
- [ ] Admin can view/change both configured values, participation rate and flyer completion points.
    
- [ ] Normal officer cannot change rate.
    
- [ ] Rate change updates `updated_at`.
    
- [ ] Rate change stores actor identity through audit logging.
    
- [ ] Rate change is recorded in System Log.
    
- [ ] Existing completed event snapshots remain unchanged.
    
- [ ] Existing point transactions remain unchanged.
    
- [ ] Unprocessed future events use the rate effective when they end.
    

---

# 45. Removing Incorrect Event Awards

- [ ] Admin can remove an incorrect generated award when needed.
    
- [ ] Normal officer cannot remove awards.
    
- [ ] Branch lead cannot remove point awards unless explicitly given admin role.
    
- [ ] Award removal updates derived totals naturally.
    
- [ ] Point-award deletion is logged.
    
- [ ] Audit log preserves enough transaction detail to understand what was deleted.
    
- [ ] Deleted award cannot silently disappear without trace.
    
- [x] Resolved decision: unique participation history includes logically removed rows and suppresses regeneration.
    
- [x] Resolved product decision: a logically removed participation award remains suppressed and is never regenerated for that officer/event.
- [ ] Implement the suppression behavior through retained transaction history and uniqueness.
    

---

# 46. Points Page

## Existing

- [x] `/points` exists.
    
- [x] Officer totals table exists.
    
- [x] Recent transactions table exists.
    
- [x] Manual/correction form exists.
    
- [x] Event can be associated with a transaction.
    
- [x] Point totals derive from current transactions.
    

## Missing MVP behavior

- [ ] Only admins see point-creation controls.
    
- [ ] Non-admins cannot call protected mutation directly.
    
- [ ] Add transaction search.
    
- [ ] Add transaction filtering.
    
- [ ] Filter/search can identify transactions by relevant displayed information.
    
- [ ] Transactions associated with events remain inspectable.
    
- [ ] Provide access to required history beyond current "latest 50" display if production data can exceed that.
    
- [ ] Display actor information to admins where useful once `created_by` exists.
    
- [ ] Add award removal control for admins where appropriate.
    

---

# 47. Dashboard

## Existing summary

- [x] Dashboard route exists.
    
- [x] Active officer count.
    
- [x] Upcoming event count.
    
- [x] Current half-year points total.
    
- [x] Upcoming events list.
    
- [x] Recent point activity.
    
- [x] Upcoming event list includes signup count.
    
- [x] Dashboard values are calculated from source records.
    
- [x] Dashboard does not store duplicated summary totals.
    

## Half-year calculations

- [x] January–June period behavior exists.
    
- [x] July–December period behavior exists.
    
- [x] Negative corrections affect current total.
    
- [ ] Verify America/Denver timezone semantics in production.
    
- [ ] Ensure final rate/award model still feeds Dashboard correctly.
    

## Authenticated officer view

- [ ] Dashboard knows which officer is signed in.
    
- [ ] Officer-specific upcoming event view shows all relevant events.
    
- [ ] Clearly mark events where current officer is signed up.
    
- [ ] Clearly mark events where current officer is not signed up.
    
- [ ] Dashboard navigation respects application role.
    
- [ ] System Log link is shown only to admins.
    

---

# 48. System Log / Audit Trail

## Page

- [ ] Add System Log navigation item.
    
- [ ] Show System Log navigation only to admins.
    
- [ ] Create System Log page.
    
- [ ] Query `audit_logs`.
    
- [ ] Show actor.
    
- [ ] Show action.
    
- [ ] Show affected entity type.
    
- [ ] Show affected entity/reference.
    
- [ ] Show action time.
    
- [ ] Show useful details/snapshot.
    
- [ ] Only admins can access route.
    
- [ ] Direct database query is also admin-only.
    

## Minimum logged actions from Design Doc

- [ ] Event creation.
    
- [ ] Event changes.
    
- [ ] Event cancellation.
    
- [ ] Event early completion.
    
- [ ] Event signup.
    
- [ ] Event sign-out.
    
- [ ] Officer assignment to event.
    
- [ ] Officer removal from event.
    
- [ ] Warning creation.
    
- [ ] Warning approval.
    
- [ ] Warning rejection.
    
- [ ] Warning deletion.
    
- [ ] Participation points-per-hour rate change.
    
- [ ] Automatic participation point award.
    
- [ ] Point award removal.
    
- [ ] Flyer completion.
    
- [ ] Flyer point award.
    

## Additional operational mutation logging

- [ ] Implement System Log coverage for officer create/edit/deactivate/reactivate actions as specified in the audit requirements.
    
- [ ] Implement System Log coverage for application admin-role changes as specified in the audit requirements.
    
- [ ] Prefer logging security-sensitive/admin mutations for traceability.
    

---

# 49. Frontend Navigation

- [x] Top navigation exists.
    
- [x] Dashboard link.
    
- [x] Events link.
    
- [x] Officers link.
    
- [x] Points link.
    
- [x] Sidebar is not required.
    
- [x] Simple visual style exists.
    
- [ ] System Log admin-only link.
    
- [ ] Auth/sign-out control.
    
- [ ] Current identity/role indication if useful.
    
- [ ] Do not show admin-only navigation to officers.
    
- [ ] Hidden navigation must not be treated as authorization.
    

---

# 50. Frontend Permission States

## Admin

- [ ] Can see Add Officer.
    
- [ ] Can edit officers.
    
- [ ] Can deactivate/reactivate officers.
    
- [ ] Can create events.
    
- [ ] Can manage all events.
    
- [ ] Can manage all event signups.
    
- [ ] Can create manual point transactions.
    
- [ ] Can create corrections.
    
- [ ] Can remove point awards.
    
- [ ] Can configure participation rate.
    
- [ ] Can create/delete warnings.
    
- [ ] Can view all warning statuses.
    
- [ ] Can access System Log.
    
- [ ] Can manage application admins according to final admin management UI.
    

## Branch lead

- [ ] Can create events for authorized branch scope.
    
- [ ] Can edit authorized events.
    
- [ ] Can cancel authorized events.
    
- [ ] Can complete authorized events early.
    
- [ ] Can manage signups for authorized events.
    
- [ ] Can manage flyer workflow for authorized events.
    
- [ ] Cannot manage unrelated branch events.
    
- [ ] Cannot award/correct/remove points unless separately an admin.
    

## Normal officer

- [ ] Can view permitted application data.
    
- [ ] Can manage own event signup.
    
- [ ] Cannot manage another officer's signup.
    
- [ ] Cannot manage arbitrary events.
    
- [ ] Cannot mutate officer records.
    
- [ ] Cannot mutate points.
    
- [ ] Cannot see System Log.
    
- [ ] Sees own approved warnings.
    

---

# 51. Forms and Validation

## Officer form

- [x] Required name validation.
    
- [x] Position required.
    
- [x] Optional classification.
    
- [x] Optional UTEP email.
    
- [x] Optional personal email.
    
- [ ] Database email validation.
    
- [x] Status validation.
    
- [ ] At least one branch required.
    
- [ ] Role authorization enforced independently from form.
    

## Event form

- [x] Name required.
    
- [x] Type required.
    
- [x] Start required.
    
- [x] End required.
    
- [x] End-after-start database validation.
    
- [x] At least one branch required through save RPC.
    
- [ ] Slides URL field.
    
- [ ] Meeting notes URL field.
    
- [ ] Flyer fields where applicable.
    
- [ ] Recurrence controls.
    
- [ ] Recurrence limit validation.
    
- [ ] Half-year recurrence validation.
    
- [ ] Authorization validation.
    

## Points form

- [x] Officer required.
    
- [x] Points required.
    
- [x] Numeric validation.
    
- [x] Reason required.
    
- [x] Event optional.
    
- [ ] Manual/correction type selection.
    
- [ ] Admin authorization.
    
- [ ] Actor attribution.
    

## Warning form

- [x] Officer required.
    
- [x] Reason required.
    
- [ ] Admin authorization.
    
- [ ] Confirmation before immutable warning creation if desired.
    
- [ ] Required approval records generated.
    

---

# 52. Time and Timezone Correctness

> Current POC treats event form/display timestamps as UTC.

- [x] Resolved product decision: user-facing event times and recurrence use America/Denver (El Paso local time).
    
- [x] Resolved decision: PostgreSQL event timestamps remain timezone-aware.
    
- [ ] Ensure datetime inputs are interpreted correctly.
    
- [ ] Ensure event detail displays expected local time.
    
- [ ] Ensure event list displays expected local time.
    
- [ ] Ensure Dashboard displays expected America/Denver local time.
    
- [ ] Ensure recurrence generation uses America/Denver consistently.
    
- [ ] Ensure DST/timezone changes do not alter scheduled duration unexpectedly.
    
- [ ] Ensure trusted event-end processing compares timestamps consistently.
    

---

# 53. Google Drive Scope

- [ ] Product decision: Google Drive remains collaborative file system.
    
- [ ] Implement event URL references for slides.
    
- [ ] Implement event URL references for meeting notes.
    
- [ ] Keep policies/promotional materials/curriculum/etc. in Drive.
    
- [ ] Do not create duplicate document-management subsystem inside Cappy Hub.
    
- [ ] Do not store Drive document contents in the Cappy Hub database solely for convenience.
    

---

# 54. Discord Scope

- [ ] Product decision: Discord remains primary communication platform.
    
- [ ] Cappy Hub does not need to replace Discord.
    
- [ ] Cappy Hub owns structured administrative information.
    
- [ ] Discord owns communication.
    
- [ ] No Discord integration is required for MVP by the Design Doc.
    

---

# 55. Google Sheets / Data Migration

## Transition

- [ ] Existing Google Sheets may coexist during development.
    
- [ ] Determine when Cappy Hub becomes source of truth for officers.
    
- [ ] Determine when Cappy Hub becomes source of truth for events.
    
- [ ] Determine when Cappy Hub becomes source of truth for points.
    

## Historical migration if performed

- [ ] Preserve officer IDs/stable identity where possible.
    
- [ ] Preserve officer/event relationships.
    
- [ ] Preserve event/point relationships.
    
- [ ] Preserve transaction history.
    
- [ ] Avoid importing duplicate point awards.
    
- [ ] Avoid importing duplicate officer/event associations.
    
- [ ] Validate imported contacts.
    
- [ ] Validate imported positions.
    
- [ ] Validate imported branches.
    
- [ ] Verify totals after migration.
    

## Current roster

- [x] Current roster has already been imported into the POC while preserving existing officer identities according to the Technical Report.
    

---

# 56. Data Integrity — Final Checklist

- [ ] Officer IDs are stable.
    
- [ ] Event IDs are stable.
    
- [ ] Point transactions reference stable officers.
    
- [ ] Point transactions may reference stable events.
    
- [ ] Position FK exists.
    
- [ ] Officer email uniqueness exists.
    
- [ ] Position name uniqueness exists.
    
- [ ] Branch name uniqueness exists.
    
- [ ] Officer/branch uniqueness exists.
    
- [ ] Event/branch uniqueness exists.
    
- [ ] Officer/event uniqueness exists.
    
- [ ] Participation award uniqueness exists.
    
- [ ] Event end-after-start constraint exists.
    
- [ ] Classification validation exists.
    
- [ ] Officer status validation exists.
    
- [ ] Point type validation exists for current types.
    
- [ ] Minimum one branch per officer enforced.
    
- [ ] Warning/approver uniqueness enforced.
    
- [ ] Warning decision validation enforced.
    
- [ ] Flyer award uniqueness enforced.
    
- [ ] Flyer assignee FK enforced.
    
- [ ] Flyer status validation enforced.
    
- [ ] Application config rate validation enforced.
    
- [ ] Participation rate snapshot implemented.
    
- [x] Actor FKs reference auth.users.id in the verified migration; public-schema types are regenerated.
- [ ] Protected workflows record the authenticated actor.
    
- [ ] Audit log survives source deletions.
    
- [ ] Final RLS protects every table appropriately.
    

---

# 57. Historical Preservation Rules

- [ ] Officer deactivation does not delete historical officer.
    
- [ ] Event cancellation does not delete historical event.
    
- [ ] Existing foreign keys use history-preserving behavior rather than cascaded deletion.
    
- [ ] Corrections can be represented without rewriting prior point values.
    
- [ ] Past events remain unavailable for deletion in normal UI.
    
- [ ] Warning deletion leaves audit history.
    
- [ ] Point-award deletion leaves audit history.
    
- [ ] Audit log contains deletion snapshot.
    
- [ ] Participation rate changes do not rewrite past transactions.
    
- [ ] Participation rate changes do not rewrite event snapshots.
    

---

# 58. Security

## Credentials

- [ ] Public Supabase configuration uses client-safe variables.
    
- [ ] Service-role credential is not present in frontend source.
    
- [ ] `.env.local` is not committed.
    
- [x] CI uses placeholder public values.
    
- [ ] If a privileged server credential is ever introduced, keep it server-only.
    
- [ ] Never expose service-role credentials through `NEXT_PUBLIC_*`.
    
- [ ] Never expose privileged secrets to Client Components.
    

## Authorization

- [ ] Authentication exists.
    
- [ ] Approved-user check exists.
    
- [ ] Application role check exists.
    
- [ ] Branch-lead check exists.
    
- [ ] Branch membership scope check exists.
    
- [ ] Self-signup identity check exists.
    
- [ ] Admin-only point operations enforced.
    
- [ ] Admin-only System Log enforced.
    
- [ ] Warning approval identity enforced.
    
- [ ] Direct Supabase/API access cannot bypass UI restrictions.
    
- [ ] Server Actions are not treated as trusted merely because they run on the Next.js server.
    

## Production security gate

- [ ] Zero temporary anonymous development write policies remain.
    
- [ ] Anonymous users cannot modify operational data.
    
- [ ] Anonymous users cannot call point-processing functions.
    
- [ ] Authenticated normal officers cannot perform admin actions.
    
- [ ] Branch leads cannot escape branch scope.
    
- [ ] Users cannot modify their auth/application role through normal client access.
    
- [ ] Security review is performed after final RLS migration.
    

---

# 59. Auditability

- [ ] Point model already provides transaction history.
    
- [ ] Corrections can remain separate from original awards.
    
- [ ] Actor identity exists for admin point changes.
    
- [ ] Actor identity exists for warning changes.
    
- [ ] Actor identity exists for event management actions.
    
- [ ] Actor identity exists for rate changes.
    
- [ ] Actor identity exists for signup management where required.
    
- [ ] Deleted-warning snapshot exists.
    
- [ ] Deleted-award snapshot exists.
    
- [ ] Audit records include timestamp.
    
- [ ] Audit records include affected entity.
    
- [ ] Audit records include action.
    
- [ ] Audit records include actor.
    
- [ ] Audit records include useful details.
    
- [ ] Audit history is admin-readable.
    

---

# 60. CI / Code Quality

## Implemented quality gates (PR 0)

- [x] GitHub Actions workflow exists.
- [x] CI is configured for PRs to main and mvp.
- [x] CI is configured for pushes to main and mvp.
- [x] Deterministic dependency installation uses npm ci and package-lock.json.
- [x] ESLint check.
- [x] Prettier formatting check (read-only).
- [x] Strict TypeScript check without emitted application files.
- [x] Automated test command runs Vitest once in a Node environment.
- [x] Production build check.
- [x] PR 0 passed all quality gates in GitHub CI on Node 24 with an intentionally empty suite. PR 1 adds real database coverage; its verification is recorded separately.
- [x] CI uses only fake public Supabase values and contents: read permissions.

PR 0 evidence: local npm ci, format, lint, typecheck, and the empty-suite test command pass on Node 26. The local Turbopack build is blocked by the execution sandbox’s temporary-port restriction (Operation not permitted); the real production build passes in GitHub Actions on Node 24. [Verification run](https://github.com/ehuerta6/cappy-hub/actions/runs/36347554555).

PR 1 evidence: [GitHub CI on Node 24](https://github.com/ehuerta6/cappy-hub/actions/runs/36349607898) passed dependency installation, formatting, lint, TypeScript, fresh migrations, real database integrity tests, populated POC upgrade/replay, generated-type drift verification, SQL function lint, and the production build. The local Turbopack port restriction remains an environment limitation.

## Release hardening

- [ ] Keep CI passing throughout MVP implementation.
    
- [x] Run migrations through reproducible files.
    
- [x] Regenerate DB types after schema changes.
    
- [x] Workflow files contain no privileged secrets.
    
- [x] Node 24 is documented and selected through .nvmrc for CI; the PR 0 local environment uses Node 26, and GitHub CI passes on Node 24.
    

---

# 61. Automated Testing — Engineering Hardening

> [!note]  
> The Design Doc does not prescribe a test framework, but the POC Technical Report identifies the absence of automated tests as a prototype limitation. These are release-readiness tasks rather than new product features.

## Test infrastructure

- [x] Select minimal test approach: Vitest with Node environment and existing @/ imports.
- [x] Add test script to package.json.
- [x] Run the automated test command in CI.
- [x] Keep test setup simple; no browser, E2E, snapshot, or mocking stack is added.

PR 1 removes --passWithNoTests. Vitest runs real pgTAP assertions against disposable local Supabase, and CI verifies populated-POC migration preservation, fresh replay, SQL function lint, and generated-type drift. The tests cover schema integrity and prototype compatibility, not final authorization, scheduled processing, warnings workflows, or recurrence.

## Database integrity tests

- [x] Invalid application roles and invalid/duplicate auth links are rejected.
- [x] Event type is required/valid; referenced types cannot be deleted.
- [x] Removed participation and flyer awards still prevent regeneration.
- [x] Removed awards do not contribute to totals; signed corrections do.
- [x] Singleton configuration and finite fractional values are validated.
- [x] Populated POC upgrade preserves IDs, history, custom event types, and relationships.

- [ ] Officer email uniqueness.
    
- [ ] Officer classification validation.
    
- [ ] Officer status validation.
    
- [ ] Officer requires valid position.
    
- [x] Officer save rejects empty/null branch sets and rolls back failed edits.
- [ ] Verify the invariant across all final authorized mutation paths.
    
- [x] Officer/branch duplicate rejected.
    
- [x] Event/branch duplicate rejected.
    
- [x] Officer/event duplicate rejected.
    
- [x] Event end before/start equal rejected.
    
- [x] Duplicate participation award rejected.
    
- [x] Duplicate flyer award rejected.
    
- [x] Warning/approver duplicate rejected.
    

## Authorization tests

- [ ] Anonymous user cannot access internal data/actions according to final policy.
    
- [ ] Officer cannot create officer.
    
- [ ] Officer cannot edit another officer.
    
- [ ] Officer cannot create manual points.
    
- [ ] Officer cannot create correction.
    
- [ ] Officer cannot remove award.
    
- [ ] Officer can sign themselves up.
    
- [ ] Officer can sign themselves out.
    
- [ ] Officer cannot modify another signup.
    
- [ ] Branch lead can manage own branch event.
    
- [ ] Branch lead cannot manage unrelated branch event.
    
- [ ] Admin can manage all events.
    
- [ ] Admin can manage officers.
    
- [ ] Admin can manage points.
    
- [ ] Non-admin cannot read System Log.
    
- [ ] Required warning approver can vote.
    
- [ ] Unrelated officer cannot vote.
    

## Points tests

- [ ] Participation duration formula.
    
- [ ] Fractional duration.
    
- [ ] Rate snapshot is stored.
    
- [ ] Later rate changes do not alter old award.
    
- [ ] One participation award per officer/event.
    
- [ ] Cancelled event gives no participation award.
    
- [ ] No signup means no award.
    
- [ ] Manual positive transaction affects total.
    
- [ ] Manual negative transaction affects total.
    
- [ ] Correction affects total.
    
- [ ] Deleted award is removed from total but remains in audit history.
    

## Warning tests

- [ ] New warning = pending.
    
- [ ] One reject = rejected.
    
- [ ] All required approvals = approved.
    
- [ ] Partial approvals = pending.
    
- [ ] Approved warning counts toward total.
    
- [ ] Pending warning does not count.
    
- [ ] Rejected warning does not count.
    
- [ ] Three approved warnings trigger admin-review flag.
    
- [ ] Three warnings do not automatically deactivate officer.
    
- [ ] Deleted warning leaves audit record.
    

## Recurring event tests

- [ ] Maximum 15-week span.
    
- [ ] Current half-year boundary enforced.
    
- [ ] Independent rows created.
    
- [ ] Signups are not copied.
    
- [ ] Editing one occurrence does not mutate others.
    
- [ ] Cancelling one occurrence does not cancel others.
    
- [ ] Past occurrence cannot be deleted from UI/workflow.
    

---

# 62. Production Processing / Scheduler

- [x] Resolved decision: use Supabase Cron/pg_cron with a private PostgreSQL function, approximately once per minute.
    
- [x] Resolved decision: scheduled processing does not depend on browser traffic.
- [ ] Implement and verify processing while the application is idle.
    
- [x] Resolved decision: the scheduler invokes a private trusted database function.
    
- [x] Resolved decision: no client/anonymous caller may provide an arbitrary point rate.
- [ ] Enforce private function execution grants and configuration reads.
    
- [ ] Processing is safe to run more than once.
    
- [ ] Database uniqueness already provides an idempotency foundation.
    
- [ ] Processing handles events ending while app is idle.
    
- [ ] Processing handles multiple events ending simultaneously.
    
- [ ] Processing records rate snapshot.
    
- [ ] Processing creates audit entries.
    
- [ ] Processing errors can be diagnosed without silently duplicating awards.
    

---

# 63. Error Handling

- [x] Generic application error boundary exists.
    
- [x] Not-found handling exists for invalid officer/event IDs.
    
- [ ] Authentication failures have an appropriate user-facing state.
    
- [ ] Authorization failures have an appropriate user-facing state.
    
- [ ] Invalid branch-scoped action returns useful error.
    
- [ ] Invalid warning approval returns useful error.
    
- [ ] Duplicate-protected operations return useful error where relevant.
    
- [ ] Rate-update errors are surfaced.
    
- [ ] Scheduled-processing failures are diagnosable.
    
- [ ] Form validation distinguishes invalid user input from server/database failures.
    

---

# 64. UI Scope Discipline

- [x] Current UI uses straightforward tables/forms/buttons.
    
- [x] No elaborate dashboard is required.
    
- [x] No sidebar is required.
    
- [x] No animation system is required.
    
- [ ] No charting system is required for MVP.
    
- [x] No complex design system is required.
    
- [ ] Keep new auth/warnings/log/config UI visually simple.
    
- [x] Prefer tables for collections.
    
- [x] Prefer basic forms for editing.
    
- [x] Prefer status badges for status.
    
- [ ] Prefer simple dialogs only where confirmation is useful.
    
- [x] Do not add unrelated product areas.
    

---

# 65. Resolved Product Decisions

These are product decisions, not implementation completion. The corresponding implementation items remain unchecked in their sections and release gates.

## Authentication and roles

- [x] Use Google Sign-In through Supabase Auth; do not use email magic links.
- [x] On first login, match the verified Google email case-insensitively to UTEP or personal email; link only exactly one active, unlinked officer, otherwise deny access.
- [x] Store a unique nullable `officers.auth_user_id` FK to `auth.users.id`; inactive officers have no application access.
- [x] Store application role on officers as `admin` or `officer`; the app owner is an admin, with no separate owner role.
- [x] `created_by`, `warning_approvals.approver_id`, `audit_logs.actor_id`, and `removed_by` identify `auth.users` accounts.
- [x] Active approved officers can view peer officer contact information, points, and history; warning records remain separately restricted.

## Positions, branches, and event types

- [x] Only ICPC Lead, Intro Lead, and Social Media Lead receive branch-management capability; academic officer titles are descriptive.
- [x] A lead may manage an event only when their branch memberships and the event’s branches have a non-empty intersection.
- [x] Include `event_types` in the MVP schema (13 application tables). Events use required `event_type_id`; admins manage unique types, and referenced types cannot be deleted.

## Points, scheduling, and time

- [x] `application_config` stores both participation points per hour and flyer completion points.
- [x] At scheduled event end, snapshot the participation rate and award using the scheduled duration.
- [x] Flyer completion awards the configured amount to `flyer_assigned_to`, at most once per event.
- [x] Use America/Denver for event input, display, recurrence, and half-year boundaries.
- [x] Early completion sets status to `past`, closes participation, retains scheduled times, and does not start point processing early or add an actual-end timestamp.
- [x] A logically removed award retains its history and is never regenerated.
- [x] Trusted Supabase Cron/pg_cron calls a private database function approximately once per minute; processing does not depend on page loads, Vercel Cron, or Edge Functions.

# 66. Explicitly Post-MVP / Not Required Now

## Do not block MVP on these

- [ ] Google Calendar invite generation is **post-MVP**.
    
- [ ] No Discord integration is required.
    
- [ ] No replacement for Google Drive is required.
    
- [ ] No file-storage subsystem is required for presentations/meeting notes.
    
- [ ] No charts are required.
    
- [ ] No elaborate analytics system is required.
    
- [ ] No complex visual dashboard is required.
    
- [ ] No separate ORM is required by the Design Doc.
    
- [ ] No separate REST API layer is required by the Design Doc.
    
- [ ] No microservice architecture is required.
    
- [ ] No additional product system outside Officers, Events, Points, Dashboard, Warnings, Auth/Permissions, and System Log should be added without a real requirement.
    

---

# 67. Recommended Implementation Order From Current POC

## Phase 1 — Finish core data model

- [x] Add `application_config`.
    
- [x] Add participation rate snapshot column to events.
    
- [x] Add missing event file/flyer columns.
    
- [ ] Add flyer award type/constraint; configured amount is awarded to the event’s flyer assignee.
    
- [x] Add `officer_warnings`.
    
- [x] Add `warning_approvals`.
    
- [x] Add `audit_logs`.
    
- [ ] Enforce at least one branch per officer.
    
- [x] Regenerate Supabase TypeScript types.
    

## Phase 2 — Authentication

- [x] Resolved product decisions are recorded below; implement Google Sign-In and officer linking.
    
- [ ] Configure Supabase Auth.
    
- [ ] Implement login/logout.
    
- [ ] Implement session-aware Supabase usage.
    
- [ ] Implement auth account → officer mapping.
    
- [ ] Implement application roles.
    

## Phase 3 — Authorization

- [ ] Configure officer application_role assignments for admins.
    
- [x] Resolved decision: ICPC Lead, Intro Lead, and Social Media Lead are the only branch-lead positions.
    
- [ ] Implement branch-scope permission helpers.
    
- [ ] Replace temporary anon RLS.
    
- [ ] Protect RPCs.
    
- [ ] Protect Server Actions.
    
- [ ] Test direct database/API access.
    

## Phase 4 — Points correctness

- [ ] Move rate into `application_config`.
    
- [ ] Add admin rate UI.
    
- [ ] Implement trusted scheduled processing.
    
- [ ] Snapshot rate at event end.
    
- [ ] Create audited participation awards.
    
- [ ] Add admin award removal.
    
- [ ] Add actor attribution.
    
- [ ] Remove page-load processing dependency.
    

## Phase 5 — Warnings

- [ ] Warning creation.
    
- [ ] Required approver generation.
    
- [ ] President/VP voting.
    
- [ ] Status calculation.
    
- [ ] Warning visibility.
    
- [ ] Three-warning review flag.
    
- [ ] Warning deletion.
    
- [ ] Audit logging.
    

## Phase 6 — Complete Events

- [ ] Slides/meeting-note URLs.
    
- [ ] Early completion.
    
- [ ] Recurring schedule generation.
    
- [ ] Future occurrence deletion.
    
- [ ] Flyer workflow.
    
- [ ] Flyer points.
    
- [ ] Implement admin event-type management with reference-protected deletion.
    
- [ ] Identity-aware signup controls.
    

## Phase 7 — System Log

- [ ] Log all required operations.
    
- [ ] Build admin System Log page.
    
- [ ] Verify deletion snapshots.
    
- [ ] Verify log access controls.
    

## Phase 8 — Finish frontend behavior

- [ ] Auth state/navigation.
    
- [ ] Role-aware controls.
    
- [ ] Dashboard signup indicator.
    
- [ ] Points filtering/search.
    
- [ ] Warnings UI.
    
- [ ] Config UI.
    
- [ ] Timezone correctness.
    
- [ ] Access to older history where needed.
    

## Phase 9 — Testing and production hardening

- [x] Add automated tests.
    
- [ ] Authorization tests.
    
- [x] Database integrity tests.
    
- [ ] Scheduler tests.
    
- [ ] Warning tests.
    
- [ ] Recurrence tests.
    
- [ ] Run security review.
    
- [ ] Verify zero temporary anon write policies.
    
- [x] Verify CI.
    
- [x] Verify fresh migration replay.
    
- [x] Verify production build.
    

---

# 68. MVP End-to-End Acceptance Checklist

## Authentication flow

- [ ] Approved CIC user can sign in.
    
- [ ] Unapproved user cannot access Cappy Hub.
    
- [ ] Application knows which officer is signed in.
    
- [ ] Application knows whether user is admin/officer.
    
- [ ] Application knows officer branches.
    
- [ ] Application knows whether position grants branch management.
    

## Admin officer workflow

- [ ] Admin signs in.
    
- [ ] Admin opens Officers.
    
- [ ] Admin creates officer.
    
- [ ] Officer has one position.
    
- [ ] Officer has at least one branch.
    
- [ ] Admin edits officer.
    
- [ ] Admin deactivates officer.
    
- [ ] Historical data remains.
    
- [ ] Admin reactivates officer.
    

## Admin event workflow

- [ ] Admin creates event.
    
- [ ] Event has at least one branch.
    
- [ ] Event has valid start/end.
    
- [ ] Admin can add officers.
    
- [ ] Admin can remove officers.
    
- [ ] Admin can edit event.
    
- [ ] Admin can cancel event.
    
- [ ] Admin can complete event early.
    
- [ ] Event retains scheduled duration for points.
    

## Branch-lead workflow

- [ ] Lead signs in.
    
- [ ] Lead can create/manage own-branch event.
    
- [ ] Lead can manage participation for own-branch event.
    
- [ ] Lead cannot manage unrelated branch event.
    

## Officer event workflow

- [ ] Officer signs in.
    
- [ ] Officer sees events.
    
- [ ] Officer sees whether they are signed up.
    
- [ ] Officer signs themselves up.
    
- [ ] Officer signs themselves out.
    
- [ ] Officer cannot modify another officer's signup.
    

## Automatic points workflow

- [ ] Event reaches scheduled end.
    
- [ ] Trusted processor executes without page load.
    
- [ ] Current participation rate is read.
    
- [ ] Rate is snapshotted on event.
    
- [ ] Scheduled duration is calculated.
    
- [ ] One participation award is created for each signup.
    
- [ ] No duplicate participation award is possible.
    
- [ ] Officer total changes automatically.
    
- [ ] Dashboard total changes automatically.
    
- [ ] Award creation appears in System Log.
    

## Rate-change workflow

- [ ] Admin changes participation rate.
    
- [ ] Rate change is logged.
    
- [ ] Past awards do not change.
    
- [ ] Past event snapshots do not change.
    
- [ ] Future events use new rate when they end.
    

## Correction workflow

- [ ] Admin creates positive/negative correction.
    
- [ ] Original transaction remains intact.
    
- [ ] Correction has reason.
    
- [ ] Correction has actor.
    
- [ ] Total updates.
    
- [ ] Action is logged.
    

## Award-removal workflow

- [ ] Admin removes incorrect award.
    
- [ ] Total updates.
    
- [ ] Deleted award details remain in System Log.
    
- [ ] Normal officer cannot remove award.
    

## Warning workflow

- [ ] Admin creates warning.
    
- [ ] Warning begins pending.
    
- [ ] President receives/has approval record.
    
- [ ] Every VP receives/has approval record.
    
- [ ] Any rejection makes warning rejected.
    
- [ ] All approvals make warning approved.
    
- [ ] Otherwise warning stays pending.
    
- [ ] Only approved warnings appear to assigned officer.
    
- [ ] Only approved warnings count.
    
- [ ] Three approved warnings flag admin review.
    
- [ ] Admin manually decides deactivation.
    
- [ ] Warning actions are logged.
    
- [ ] Warning deletion leaves audit history.
    

## Recurring event workflow

- [ ] Authorized user creates recurrence.
    
- [ ] Recurrence is at most 15 weeks.
    
- [ ] Recurrence stays in current half-year.
    
- [ ] Each occurrence is independent.
    
- [ ] No signups are copied.
    
- [ ] Individual occurrence can be edited.
    
- [ ] Individual occurrence can be cancelled.
    
- [ ] Eligible future occurrence can be deleted.
    
- [ ] Past occurrence cannot be deleted through UI.
    

## Social flyer workflow

- [ ] Social event shows flyer state.
    
- [ ] Flyer can be assigned.
    
- [ ] Authorized user marks flyer complete.
    
- [ ] Only one flyer award is created.
    
- [ ] Flyer completion is logged.
    
- [ ] Flyer award is logged.
    

## Dashboard workflow

- [ ] Active officer count is correct.
    
- [ ] Upcoming event count is correct.
    
- [ ] Half-year points total is correct.
    
- [ ] Upcoming event list is correct.
    
- [ ] Recent point activity is correct.
    
- [ ] Current officer signup indicators are correct.
    
- [ ] All values derive from source records.
    

## System Log workflow

- [ ] Admin can open System Log.
    
- [ ] Officer cannot open System Log.
    
- [ ] Actor is visible.
    
- [ ] Action is visible.
    
- [ ] Entity is visible.
    
- [ ] Timestamp is visible.
    
- [ ] Useful details are visible.
    
- [ ] Deleted warning snapshot remains.
    
- [ ] Deleted point award snapshot remains.
    

---

# 69. Final MVP Release Gate

## Product

- [ ] All MVP features above are complete.
    
- [x] Product decisions in the Design Doc and checklist are resolved.
- [ ] Implement the resolved product decisions.
    
- [ ] No post-MVP feature is accidentally blocking release.
    

## Database

- [x] All 13 intended MVP application tables exist.
    
- [x] All required columns exist.
    
- [x] All required FKs exist.
    
- [x] All required uniqueness constraints exist.
    
- [x] All required check constraints exist.
    
- [x] Migrations reproduce complete schema from scratch.
    
- [x] Database types are regenerated.
    

## Authentication and security

- [ ] Authentication enabled.
    
- [ ] Account mapping works.
    
- [ ] Roles work.
    
- [ ] Branch permissions work.
    
- [ ] Final RLS enabled.
    
- [ ] Temporary anonymous policies removed.
    
- [ ] Privileged RPCs are protected.
    
- [ ] Service credentials are not exposed.
    
- [ ] Direct API access cannot bypass permissions.
    

## Points

- [ ] Rate stored in database.
    
- [ ] Rate configurable by admins.
    
- [ ] Rate snapshots work.
    
- [ ] Trusted scheduled processing works.
    
- [ ] Participation awards are idempotent.
    
- [ ] Corrections work.
    
- [ ] Award removal works.
    
- [ ] Flyer award works.
    
- [ ] Point totals remain derived.
    

## Auditability

- [ ] System Log exists.
    
- [ ] Required actions are logged.
    
- [ ] Actors are recorded.
    
- [ ] Deleted-record snapshots are retained.
    
- [ ] Only admins can view logs.
    

## Frontend

- [ ] Login flow works.
    
- [ ] Navigation is role-aware.
    
- [ ] Dashboard complete.
    
- [ ] Officers complete.
    
- [ ] Events complete.
    
- [ ] Points complete.
    
- [ ] Warnings complete.
    
- [ ] System Log complete.
    
- [ ] Admin configuration controls complete.
    
- [ ] UI remains simple and usable.
    

## Quality

- [x] Lint passes.
    
- [x] Format check passes.
    
- [x] Typecheck passes.
    
- [x] Production build passes.
    
- [x] Automated tests pass.
    
- [ ] Authorization test suite passes.
    
- [x] Fresh migration replay passes.
    
- [ ] Production security review passes.
    

---

# 70. MVP Complete

- [ ] **Authentication is production-ready**
    
- [ ] **Authorization/RLS is production-ready**
    
- [ ] **Officers are complete**
    
- [ ] **Warnings are complete**
    
- [ ] **Events are complete**
    
- [ ] **Recurring events are complete**
    
- [ ] **Event participation is identity-aware**
    
- [ ] **Points are complete**
    
- [ ] **Trusted automatic participation processing is complete**
    
- [ ] **Flyer workflow is complete**
    
- [ ] **Dashboard is complete**
    
- [ ] **System Log is complete**
    
- [ ] **Database matches the intended MVP model**
    
- [ ] **Security has replaced all temporary POC access**
    
- [ ] **Required automated tests pass**
    
- [ ] **Cappy Hub MVP is ready for real CIC administrative use**