

> [!info] Status baseline  
> **POC snapshot:** 2026-09-27  
> **Product source of truth:** Cappy Hub Design Doc  
> **Implementation source of truth:** Cappy Hub POC Technical Report
> 
> - `[x]` = confirmed implemented in the current POC
>     
> - `[ ]` = still required, incomplete, or needs production implementation
>     
> - Items marked **DECISION NEEDED** require a product/architecture decision before final implementation.
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
    
- [ ] Regenerate TypeScript database types after final schema migrations.
    

---

# 3. Authentication

## Authentication design

- [ ] **DECISION NEEDED:** Choose final sign-in mechanism.
    
    - Google sign-in, or
        
    - Email authentication, or
        
    - Another approved-user login method consistent with the Design Doc.
        
    
- [ ] **DECISION NEEDED:** Define how an authenticated account links to an officer record.
    
- [ ] **DECISION NEEDED:** Define how approved CIC users are identified.
    
- [ ] **DECISION NEEDED:** Define what happens when someone authenticates but is not an approved Cappy Hub user.
    
- [ ] **DECISION NEEDED:** Define what happens when an officer exists before their auth account exists.
    
- [ ] **DECISION NEEDED:** Define how application roles are stored.
    
- [ ] **DECISION NEEDED:** Define how the application owner identity is represented.
    
- [ ] Avoid expanding the core schema solely for auth until the account-linking model is deliberately chosen.
    

## Authentication implementation

- [ ] Configure chosen provider in Supabase Auth.
    
- [ ] Implement sign-in flow.
    
- [ ] Implement auth callback flow if required by the chosen provider.
    
- [ ] Implement sign-out.
    
- [ ] Persist session correctly.
    
- [ ] Restore session on page requests.
    
- [ ] Protect internal application routes from unauthenticated users.
    
- [ ] Redirect unauthenticated users appropriately.
    
- [ ] Resolve `auth user → Cappy Hub officer`.
    
- [ ] Resolve `auth user → application role`.
    
- [ ] Resolve `auth user → officer branch memberships`.
    
- [ ] Resolve whether the current user's position grants branch-event management.
    
- [ ] Reject authenticated but unapproved users.
    
- [ ] Ensure deactivated officers receive the intended level of application access according to the final access decision.
    
- [ ] Display current signed-in identity where useful.
    
- [ ] Add logout control.
    

---

# 4. Application Roles

## Role model

- [ ] Implement `admin` application role.
    
- [ ] Implement `officer` application role.
    
- [ ] Keep application role separate from club position.
    
- [ ] Keep application role separate from branch membership.
    
- [ ] Keep club position separate from application authorization except for the explicit branch-lead capability.
    

## Admin users

- [ ] Support multiple administrators.
    
- [ ] Support President as an admin where configured.
    
- [ ] Support Vice Presidents as admins where configured.
    
- [ ] Support the application owner as an admin.
    
- [ ] Support additional designated administrators.
    
- [ ] Allow an existing admin to add an admin.
    
- [ ] Allow an existing admin to remove an admin.
    
- [ ] Allow the application owner to add/remove admins.
    
- [ ] Protect admin-management operations on the backend.
    
- [ ] Prevent normal officers from promoting themselves to admin.
    
- [ ] Prevent normal officers from changing another user's application role.
    

## Officer users

- [ ] Authenticated approved officers can view permitted application data.
    
- [ ] Normal officers can manage their own event signups.
    
- [ ] Normal officers cannot manage another officer's signup.
    
- [ ] Normal officers cannot create manual point transactions.
    
- [ ] Normal officers cannot create point corrections.
    
- [ ] Normal officers cannot remove point awards.
    
- [ ] Normal officers cannot edit other officer records.
    
- [ ] Normal officers cannot access the System Log.
    

---

# 5. Branch Lead Authorization

## Position capability

- [ ] `positions.can_manage_branch_events` column exists.
    
- [ ] Configure the positions that actually act as branch leads.
    
- [ ] Stop leaving all `can_manage_branch_events` values as `false`.
    
- [ ] **DECISION NEEDED:** Confirm which existing club positions have branch-management permission.
    
- [ ] **DECISION NEEDED:** Resolve whether "Academic Officer" variants carry application permission or are descriptive titles only.
    

## Branch scope

- [ ] Determine branch-lead scope from the officer's actual branch memberships.
    
- [ ] A lead can create/manage an event only for a branch they belong to.
    
- [ ] A lead can manage multi-branch events only when authorized according to the finalized multi-branch permission rule.
    
- [ ] A lead can assign officers only to authorized events.
    
- [ ] A lead can remove officers only from authorized events.
    
- [ ] A lead can manage event participation only for authorized events.
    
- [ ] A lead can cancel an event only within authorized branch scope.
    
- [ ] A lead can mark an event completed early only within authorized branch scope.
    
- [ ] A lead can manage flyer state for authorized Social events.
    
- [ ] Branch scope is enforced by backend/database authorization.
    
- [ ] Branch scope is not enforced only through hidden buttons.
    

---

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

- [ ] Approved users can read officer data they are permitted to see.
    
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
    
- [ ] Branch leads can create branch-scoped events.
    
- [ ] Branch leads can modify branch-scoped events.
    
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
    
- [ ] Branch leads can manage signups for authorized events.
    
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

- [ ] Admins can read current participation points-per-hour.
    
- [ ] Admins can change current participation points-per-hour.
    
- [ ] Normal officers cannot change the rate.
    
- [ ] Rate changes are logged.
    

## Audit log RLS

- [ ] Only admins can view System Log records.
    
- [ ] Normal officers cannot query audit logs directly.
    
- [ ] Audit records cannot be modified through normal application workflows.
    
- [ ] Audit records survive deletion of the entity they describe.
    

---

# 7. Database — Final MVP Schema

## Required MVP tables

- [x] `officers`
    
- [x] `positions`
    
- [ ] `officer_warnings`
    
- [ ] `warning_approvals`
    
- [x] `branches`
    
- [x] `officer_branches`
    
- [x] `events`
    
- [x] `event_branches`
    
- [x] `event_officers`
    
- [x] `point_transactions`
    
- [ ] `application_config`
    
- [ ] `audit_logs`
    

**Target: 12 MVP application tables.**

---

# 8. Database — `officers`

## Columns

- [x] `id`
    
- [x] `name`
    
- [x] `utep_email`
    
- [x] `personal_email`
    
- [x] `position_id`
    
- [x] `classification`
    
- [x] `status`
    
- [x] `created_at`
    

## Constraints

- [x] Primary key exists.
    
- [x] Name cannot be blank.
    
- [x] UTEP email format is validated.
    
- [x] Personal email format is validated.
    
- [x] UTEP email is independently case-insensitive unique when provided.
    
- [x] Personal email is independently case-insensitive unique when provided.
    
- [x] Multiple null emails are supported.
    
- [x] `position_id` references a valid position.
    
- [x] Classification is nullable.
    
- [x] Classification allowed values:
    
    - `freshman`
        
    - `sophomore`
        
    - `junior`
        
    - `senior`
        
    - `graduate`
        
    
- [x] Status allowed values:
    
    - `active`
        
    - `inactive`
        
    

## Remaining officer integrity rule

- [ ] Every officer must belong to at least one branch.
    
- [ ] Creating an officer with zero branches must be rejected.
    
- [ ] Editing an officer so they have zero branches must be rejected.
    
- [ ] Do not rely solely on the form checkbox UI for this rule.
    
- [ ] Ensure the trusted save path enforces the requirement transactionally.
    

---

# 9. Database — `positions`

## Current schema

- [x] `id`
    
- [x] `name`
    
- [ ] `can_manage_branch_events`
    
- [x] `created_at`
    
- [x] Position names are unique.
    
- [x] Position names are controlled database data.
    
- [x] Officers reference a position by ID.
    
- [x] Position values can change without altering the officers table schema.
    

## Remaining work

- [ ] Assign correct `can_manage_branch_events` values.
    
- [ ] Connect this boolean to real backend authorization.
    
- [ ] Prevent the boolean from acting alone without checking branch membership.
    
- [ ] **DECISION NEEDED:** finalize permission meaning for Academic Officer variants.
    

---

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
    
- [ ] Branches participate in final permission checks.
    

---

# 11. Database — `officer_branches`

- [x] `officer_id`
    
- [x] `branch_id`
    
- [x] Officer FK exists.
    
- [x] Branch FK exists.
    
- [x] Composite primary key exists.
    
- [x] Duplicate officer/branch memberships are prevented.
    
- [x] Many-to-many relationship works.
    
- [ ] Final officer-save workflow guarantees at least one row.
    
- [ ] Final RLS protects membership mutation.
    

---

# 12. Database — `events`

## Existing columns

- [x] `id`
    
- [x] `name`
    
- [x] `description`
    
- [x] `type`
    
- [x] `location`
    
- [x] `starts_at`
    
- [x] `ends_at`
    
- [x] `status`
    
- [x] `created_at`
    

## Missing MVP columns

- [ ] `participation_points_per_hour_at_end`
    
- [ ] `slides_url`
    
- [ ] `meeting_notes_url`
    
- [ ] `flyer_status`
    
- [ ] `flyer_assigned_to`
    

## Event constraints

- [x] Event name cannot be blank.
    
- [x] Event type cannot be blank.
    
- [x] `starts_at` is required.
    
- [x] `ends_at` is required.
    
- [x] `ends_at > starts_at` is enforced.
    
- [x] Event status accepts:
    
    - `upcoming`
        
    - `happening`
        
    - `past`
        
    - `cancelled`
        
    
- [ ] Flyer status accepts:
    
    - `not_started`
        
    - `in_progress`
        
    - `done`
        
    
- [ ] `flyer_assigned_to` references a valid officer when provided.
    
- [ ] Rate snapshot is nullable until event processing/completion.
    
- [ ] Once participation awards are created, the event retains the rate used for those awards.
    

---

# 13. Database — `event_branches`

- [x] `event_id`
    
- [x] `branch_id`
    
- [x] Event FK exists.
    
- [x] Branch FK exists.
    
- [x] Composite primary key exists.
    
- [x] Duplicate event/branch pairs are prevented.
    
- [x] An event can structurally belong to multiple branches.
    
- [x] Current event-save RPC requires at least one branch.
    
- [ ] Final authorization uses event branches to determine branch-lead scope.
    
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

# 15. Database — `point_transactions`

## Existing columns

- [x] `id`
    
- [x] `officer_id`
    
- [x] `event_id`
    
- [x] `points`
    
- [x] `reason`
    
- [x] `award_type`
    
- [x] `created_by`
    
- [x] `created_at`
    

## Current award types

- `participation`
    
- `manual`
    
- `correction`
    
- `flyer`
    

## Existing integrity

- [x] Every transaction references an officer.
    
- [x] Event is optional.
    
- [x] Participation requires an event.
    
- [x] Positive point values work.
    
- [x] Negative point values work.
    
- [x] Fractional point values work.
    
- [x] Reason cannot be blank.
    
- [x] Numeric point values are validated as finite.
    
- [x] One participation award per officer/event is enforced with a unique partial index.
    
- [x] Point totals are derived rather than stored on officers.
    

## Remaining point schema work

- [ ] `created_by` has a finalized authentication relationship.
    
- [ ] Admin-created manual transactions store actor identity.
    
- [ ] Admin-created corrections store actor identity.
    
- [ ] Automatic transactions use the appropriate trusted actor/system representation.
    
- [ ] `flyer` is an allowed award type.
    
- [ ] Enforce no more than one flyer award per event.
    
- [ ] Award deletions preserve sufficient details in `audit_logs`.
    

---

# 16. Database — `officer_warnings`

- [ ] Create `officer_warnings` table.
    
- [ ] Add `id`.
    
- [ ] Add `officer_id`.
    
- [ ] Add `reason`.
    
- [ ] Add `status`.
    
- [ ] Add `created_at`.
    
- [ ] `officer_id` references a valid officer.
    
- [ ] Warning status supports:
    
    - `pending`
        
    - `approved`
        
    - `rejected`
        
    
- [ ] Warning reason is retained for audit purposes.
    
- [ ] Warning is immutable after creation from normal application workflows.
    
- [ ] Admin physical deletion is supported.
    
- [ ] Deletion does not erase the corresponding System Log history.
    

---

# 17. Database — `warning_approvals`

- [ ] Create `warning_approvals` table.
    
- [ ] Add `warning_id`.
    
- [ ] Add `approver_id`.
    
- [ ] Add `approver_role`.
    
- [ ] Add `decision`.
    
- [ ] Add nullable `decided_at`.
    
- [ ] Finalize `approver_id` relationship after auth design.
    
- [ ] Support President approval record.
    
- [ ] Support approval records for every Vice President.
    
- [ ] Prevent duplicate warning/approver pairs.
    
- [ ] Decision supports:
    
    - `pending`
        
    - `approved`
        
    - `rejected`
        
    
- [ ] Store decision timestamp.
    
- [ ] Prevent unauthorized users from writing approval decisions.
    

---

# 18. Database — `application_config`

- [ ] Create `application_config`.
    
- [ ] Use a single-row configuration record.
    
- [ ] Add `id`.
    
- [ ] Add `participation_points_per_hour`.
    
- [ ] Add `updated_at`.
    
- [ ] Store current participation rate in the database instead of only an environment variable.
    
- [ ] Validate configured rate as a valid numeric rate.
    
- [ ] Provide a predictable way to access the single configuration row.
    
- [ ] Admin rate updates modify this row.
    
- [ ] Rate changes create System Log entries.
    
- [ ] Automatic award processing reads this configuration.
    
- [ ] Event completion snapshots the current rate onto the event.
    

---

# 19. Database — `audit_logs`

- [ ] Create `audit_logs`.
    
- [ ] Add `id`.
    
- [ ] Add `actor_id`.
    
- [ ] Add `action`.
    
- [ ] Add `entity_type`.
    
- [ ] Add `entity_id`.
    
- [ ] Add `details`.
    
- [ ] Add `created_at`.
    
- [ ] Finalize `actor_id` relationship after authentication design.
    
- [ ] Store enough detail to understand an action.
    
- [ ] Store before/after data where useful.
    
- [ ] Store deletion snapshots where required.
    
- [ ] Retain logs after source entity deletion.
    
- [ ] Protect logs from normal modification.
    
- [ ] Allow only admins to read logs.
    

---

# 20. Database Views

## Existing views

- [x] `officer_point_totals`
    
- [x] `dashboard_summary`
    
- [x] Views derive results from current records.
    
- [x] Totals are not duplicated into cached officer columns.
    
- [x] Current views use `security_invoker`.
    

## Final review

- [ ] Verify both views work correctly under authenticated RLS.
    
- [ ] Remove anonymous read grants if no longer appropriate.
    
- [ ] Ensure views cannot accidentally expose rows users cannot otherwise read.
    
- [ ] Verify Dashboard half-year totals remain correct after final point model changes.
    
- [ ] Verify deleted awards no longer contribute to point totals.
    
- [ ] Verify correction transactions do contribute positively/negatively as intended.
    

---

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
    
- [ ] Enforce at least one officer branch in final save workflow.
    
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
    
- [ ] Use event type for organization/filtering according to final UI.
    
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
    
- [ ] Event type does **not** determine branch-lead authorization.
    
- [ ] Branch associations determine branch scope.
    
- [ ] **DECISION NEEDED:** Design Doc says event types are "managed by admins", but the 12-table MVP schema does not contain an `event_types` table.
    
- [ ] Decide how admin-managed event types are represented without silently expanding the schema.
    
- [ ] Implement the chosen admin-management behavior.
    
- [ ] Ensure event type changes do not alter branch permissions.
    

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
    
- [ ] **Implementation decision:** define how early completion state is represented using the existing event model without unnecessary schema expansion.
    
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

- [ ] **DECISION NEEDED:** President approves final flyer award amount.
    
- [ ] Implement flyer award only after award amount/rule is finalized.
    
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
    
- [ ] `created_by` stores admin actor.
    
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

- [ ] Remove page-load processing as the production trigger.
    
- [ ] Add trusted scheduled event processing.
    
- [ ] Processing runs even when nobody loads Cappy Hub.
    
- [ ] Processing executes when an event reaches its scheduled end.
    
- [ ] Processing cannot be triggered anonymously with an arbitrary rate.
    
- [ ] Processing reads current rate from `application_config`.
    
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
    
- [ ] Admin can view current rate.
    
- [ ] Admin can change current rate.
    
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
    
- [ ] Participation uniqueness allows the system's intended behavior after removal according to the finalized removal/re-award rule.
    
- [ ] **Implementation decision:** define whether a removed participation award may ever be regenerated automatically for the same event/officer or remains intentionally suppressed.
    

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
    
- [ ] Verify timezone semantics for production.
    
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

- [ ] Decide whether officer create/edit/deactivate/reactivate is included in universal System Log coverage.
    
- [ ] Decide whether application admin-role changes are included.
    
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

- [ ] **DECISION NEEDED:** define the user-facing timezone convention for Cappy Hub.
    
- [ ] Keep PostgreSQL timestamps timezone-aware.
    
- [ ] Ensure datetime inputs are interpreted correctly.
    
- [ ] Ensure event detail displays expected local time.
    
- [ ] Ensure event list displays expected local time.
    
- [ ] Ensure Dashboard displays expected local time.
    
- [ ] Ensure recurrence generation uses the chosen timezone consistently.
    
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

- [ ] Current roster has already been imported into the POC while preserving existing officer identities according to the Technical Report.
    

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
    
- [ ] Auth actor references finalized.
    
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
    
- [ ] CI uses placeholder public values.
    
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

## Existing

- [ ] GitHub Actions workflow exists.
    
- [ ] CI runs on PRs to `main`.
    
- [ ] CI runs on pushes to `main`.
    
- [ ] `npm ci`
    
- [ ] ESLint check.
    
- [ ] Prettier formatting check.
    
- [ ] TypeScript check.
    
- [ ] Production build check.
    
- [ ] Current POC passes these checks.
    

## Release hardening

- [ ] Keep CI passing throughout MVP implementation.
    
- [ ] Run migrations through reproducible files.
    
- [ ] Regenerate DB types after schema changes.
    
- [ ] Keep secrets out of workflow files.
    
- [ ] Align/document supported local and CI Node version if the Node 26 local / Node 24 CI difference becomes problematic.
    

---

# 61. Automated Testing — Engineering Hardening

> [!note]  
> The Design Doc does not prescribe a test framework, but the POC Technical Report identifies the absence of automated tests as a prototype limitation. These are release-readiness tasks rather than new product features.

## Test infrastructure

- [ ] Select minimal test approach.
    
- [ ] Add test script to `package.json`.
    
- [ ] Run automated tests in CI.
    
- [ ] Keep test setup simple; avoid unnecessary testing infrastructure.
    

## Database integrity tests

- [ ] Officer email uniqueness.
    
- [ ] Officer classification validation.
    
- [ ] Officer status validation.
    
- [ ] Officer requires valid position.
    
- [ ] Officer requires at least one branch.
    
- [ ] Officer/branch duplicate rejected.
    
- [ ] Event/branch duplicate rejected.
    
- [ ] Officer/event duplicate rejected.
    
- [ ] Event end before/start equal rejected.
    
- [ ] Duplicate participation award rejected.
    
- [ ] Duplicate flyer award rejected.
    
- [ ] Warning/approver duplicate rejected.
    

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

- [ ] Choose trusted scheduling mechanism compatible with Supabase/hosting environment.
    
- [ ] Scheduled processing does not depend on browser traffic.
    
- [ ] Scheduler can authenticate as trusted execution context.
    
- [ ] Scheduler cannot be invoked by normal officer credentials to choose arbitrary point rate.
    
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

# 65. Explicit Product Decisions Still Needed

## Authentication

- [ ] Choose Google vs email vs other approved-user sign-in.
    
- [ ] Define auth account ↔ officer linking.
    
- [ ] Define where `admin` / `officer` application role is stored.
    
- [ ] Define application owner representation.
    
- [ ] Define what data an approved officer may read.
    

## Positions and permissions

- [ ] Decide whether regular vs Academic Officer titles carry different application permissions.
    
- [ ] Finalize which positions have `can_manage_branch_events = true`.
    

## Event types

- [ ] Decide how admin-managed event types work given that the MVP's documented 12 tables do not include an `event_types` table.
    

## Flyer points

- [ ] President approves flyer award amount.
    
- [ ] Finalize exact flyer-award rule.
    

## Authentication foreign keys

- [ ] Finalize `point_transactions.created_by`.
    
- [ ] Finalize `warning_approvals.approver_id`.
    
- [ ] Finalize `audit_logs.actor_id`.
    

## Time

- [ ] Decide official user-facing timezone behavior.
    

## Award removal

- [ ] Decide whether deleting an automatically generated participation award permanently suppresses regeneration or requires a separate suppression mechanism.
    

---

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

- [ ] Add `application_config`.
    
- [ ] Add participation rate snapshot column to events.
    
- [ ] Add missing event file/flyer columns.
    
- [ ] Add flyer award type/constraint.
    
- [ ] Add `officer_warnings`.
    
- [ ] Add `warning_approvals`.
    
- [ ] Add `audit_logs`.
    
- [ ] Enforce at least one branch per officer.
    
- [ ] Regenerate Supabase TypeScript types.
    

## Phase 2 — Authentication

- [ ] Make authentication decisions.
    
- [ ] Configure Supabase Auth.
    
- [ ] Implement login/logout.
    
- [ ] Implement session-aware Supabase usage.
    
- [ ] Implement auth account → officer mapping.
    
- [ ] Implement application roles.
    

## Phase 3 — Authorization

- [ ] Configure admin identities.
    
- [ ] Configure branch-lead positions.
    
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
    
- [ ] Event-type management decision/implementation.
    
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

- [ ] Add automated tests.
    
- [ ] Authorization tests.
    
- [ ] Database integrity tests.
    
- [ ] Scheduler tests.
    
- [ ] Warning tests.
    
- [ ] Recurrence tests.
    
- [ ] Run security review.
    
- [ ] Verify zero temporary anon write policies.
    
- [ ] Verify CI.
    
- [ ] Verify fresh migration replay.
    
- [ ] Verify production build.
    

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
    
- [ ] All unresolved product decisions above are resolved.
    
- [ ] No post-MVP feature is accidentally blocking release.
    

## Database

- [ ] All 12 intended MVP tables exist.
    
- [ ] All required columns exist.
    
- [ ] All required FKs exist.
    
- [ ] All required uniqueness constraints exist.
    
- [ ] All required check constraints exist.
    
- [ ] Migrations reproduce complete schema from scratch.
    
- [ ] Database types are regenerated.
    

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

- [ ] Lint passes.
    
- [ ] Format check passes.
    
- [ ] Typecheck passes.
    
- [ ] Production build passes.
    
- [ ] Automated tests pass.
    
- [ ] Authorization test suite passes.
    
- [ ] Fresh migration replay passes.
    
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