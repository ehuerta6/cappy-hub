# Production database index audit — 2026-10-07

This audit records the read-only production investigation for Issue #148 after
the legacy `task_assignments` projection was removed. Production was not
modified. The Performance Advisor was run at 2026-10-07 21:23 UTC against the
CappyHub project, and production migration history included
`20261007120000` (`#147`). The migration-history check is a schema milestone
only; production data was not read beyond aggregate catalog statistics and
query-planner estimates.

## Decision

No index or processor change is justified by the observed production workload.
The finished-Event processor uses a sequential scan over 113 Events (estimated
24 matches, estimated total cost 9.83), which is appropriate for the current
table size. The due-Task processor uses the active partial due-date index and
the Task assignment primary key. Keep all current indexes, including both
Task due-date indexes and all uniqueness/integrity indexes. No migration was
created, and processor behavior and cron cadence remain unchanged.

## Scheduled processor evidence

Production function definitions were read with `pg_get_functiondef`.

`private.process_finished_events()` selects rows from `public.events` where
`status <> 'cancelled'`, `deleted_at IS NULL`, `ends_at <= now()`, and
`participation_points_per_hour_at_end IS NULL`, ordered by `id`, with
`FOR UPDATE SKIP LOCKED`. It processes signups from `event_officers` by
`event_id` and inserts participation awards idempotently.

`EXPLAIN (FORMAT JSON)` for that exact lookup returned:

```text
LockRows
└─ Sort by id
   └─ Seq Scan on events
      estimated rows: 24
      estimated total cost: 9.83
      relation estimate: 113 live rows
```

There is no selective, high-volume scan evidence to justify a partial index
for this processor. The existing `events_event_date_idx` and
`events_starts_at_idx` serve other observed date/time access patterns; neither
matches the processor predicate and ordering.

`private.process_due_tasks()` selects active Tasks with `due_date` earlier
than the current Denver date, with at least one completed assignment, ordered
by `due_date, id`, using `FOR UPDATE SKIP LOCKED`. The inner existence lookup
uses `task_officer_assignments(task_id, officer_id)` and filters
`completed_at IS NOT NULL`.

`EXPLAIN (FORMAT JSON)` returned:

```text
LockRows
└─ Incremental Sort by due_date, id (presorted by due_date)
   └─ Nested Loop Semi Join
      ├─ Index Scan tasks_active_due_date_idx
      │  condition: due_date < Denver current date
      │  filter: removed_at IS NULL
      └─ Index Scan task_officer_assignments_pkey
         condition: task_id = tasks.id
         filter: completed_at IS NOT NULL
```

The plan uses the intended indexes and avoids scanning unrelated assignments.
No processor query, behavior, or schedule change is warranted.

## Foreign keys reported without a covering index

The advisor reported 13 FKs. The counts below are live-row estimates at audit
time. The relationship-operation review found no current workload large or
frequent enough to justify adding an index. An FK can still require a child
table lookup when its referenced row is deleted; the small current relation
sizes and the lack of a demonstrated hot lookup make the advisor finding
insufficient evidence on its own.

| Candidate index                          | Evidence and relationship operation                                                                                                                                        | Decision                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `event_series(created_by)`               | Creation actor is retained as provenance; no hot lookup by creator. Six rows.                                                                                              | KEEP current layout; do not add |
| `event_series(parent_series_id)`         | Recurrence lineage uses parent IDs; current ancestor traversal follows referenced series IDs. Restrict-delete check only; six rows.                                        | KEEP current layout; do not add |
| `events(deleted_by)`                     | Soft-delete auth-user provenance, not a hot event filter or join. Restrict-delete check; 113 rows.                                                                         | KEEP current layout; do not add |
| `events(location_id)`                    | Event detail relates to `event_locations` by the referenced location key; deleting a location sets the FK to null. 113 rows.                                               | KEEP current layout; do not add |
| `point_transactions(updated_by)`         | Legacy auth-user provenance; current actor presentation also has stable Officer attribution. No demonstrated hot lookup by auth user. 166 rows.                            | KEEP current layout; do not add |
| `task_officer_assignments(approved_by)`  | Approval attribution; due-Task processor looks up by `task_id` and completion state using the assignment primary key. Six rows.                                            | KEEP current layout; do not add |
| `task_officer_assignments(assigned_by)`  | Assignment attribution; current assignment operations address `(task_id, officer_id)`, not assigner. Six rows.                                                             | KEEP current layout; do not add |
| `task_series(created_by)`                | Creation provenance; no current series rows.                                                                                                                               | KEEP current layout; do not add |
| `task_series(parent_series_id)`          | Recurrence lineage; no current series rows.                                                                                                                                | KEEP current layout; do not add |
| `tasks(branch_id)`                       | Used for branch relationship/scope operations, including branch-reference checks; no due-processor filter. Nine rows.                                                      | KEEP current layout; do not add |
| `tasks(created_by)`                      | Creation provenance; task mutations load Tasks by primary key. Nine rows.                                                                                                  | KEEP current layout; do not add |
| `tasks(removed_by)`                      | Soft-removal provenance; task mutations load Tasks by primary key. Nine rows.                                                                                              | KEEP current layout; do not add |
| `warning_approvals(approver_officer_id)` | Approval workflow addresses `(warning_id, approver_officer_id)` through the existing partial unique index; officer deletion is a restrict relationship check. Twelve rows. | KEEP current layout; do not add |

The advisor's `unindexed_foreign_keys` finding should be revisited if these
tables grow materially or query evidence shows frequent FK-side lookups.

## Task due-date indexes

| Candidate                                                            | Evidence                                                                                                                                                                          | Decision                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `tasks_active_due_date_idx` on `(due_date) WHERE removed_at IS NULL` | 4,726 index scans in the observed statistics; selected by the due-Task processor plan.                                                                                            | KEEP                                           |
| `tasks_due_date_idx` on `(due_date)`                                 | 12 index scans; covers rows including removed Tasks, unlike the partial index. Observed scans mean it is not unused, and the current data does not identify which caller used it. | KEEP; do not drop without query-level evidence |

The two indexes overlap for active Tasks but are not equivalent: the partial
index excludes removed rows. The processor correctly uses the partial index.
The 12 scans of the general index are evidence to retain it pending
query-level attribution, not proof it is redundant.

## Unused-index advisor findings

The advisor reported zero scans for these indexes at observation time. Zero
scans alone is not a drop justification. All are retained because they
support relationship checks, provenance access, or integrity/performance
paths that have not been ruled out by query-level evidence.

| Candidate                                      | Evidence                                                                                                                 | Decision |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| `event_branches_branch_id_idx`                 | Branch relationship checks and FK-side operations use `branch_id`; the composite primary key starts with `event_id`.     | KEEP     |
| `officer_branches_branch_id_idx`               | Branch relationship checks and FK-side operations use `branch_id`; the composite primary key starts with `officer_id`.   | KEEP     |
| `point_transactions_created_by_officer_id_idx` | Stable actor attribution is used when presenting point history; zero scans do not rule out low-frequency history access. | KEEP     |
| `point_transactions_created_by_idx`            | Auth-user FK/provenance relationship; zero scans do not rule out delete checks.                                          | KEEP     |
| `point_transactions_removed_by_idx`            | Auth-user FK/provenance relationship; zero scans do not rule out delete checks.                                          | KEEP     |
| `point_transactions_removed_by_officer_id_idx` | Stable removal-actor provenance relationship; zero scans do not rule out low-frequency history access.                   | KEEP     |
| `point_transactions_updated_by_officer_id_idx` | Stable update-actor attribution; zero scans do not rule out low-frequency history access.                                | KEEP     |
| `audit_logs_actor_id_idx`                      | Auth-user actor FK/provenance relationship; zero scans do not rule out delete checks or low-frequency lookup.            | KEEP     |

## Advisor summary

- `unindexed_foreign_keys`: 13 findings, reviewed above.
- `unused_index`: 8 findings, reviewed above; no index dropped.
- No uniqueness or integrity index was changed.
- No index was added, so there is no before/after migration plan comparison.
- Production access for this audit consisted only of advisor/catalog reads and
  `EXPLAIN` without `ANALYZE`; no production rows were changed or locked by
  executing a processor query.

## Production public index inventory

Catalog inventory captured during the same audit. PostgreSQL index usage
counters had last reset at `2026-08-25 20:33:23 UTC`; reported scan counts
therefore cover the period since that reset. `[unique]` marks a unique index.

| Table                      | Indexes                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application_config`       | `application_config_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `audit_logs`               | `audit_logs_actor_id_idx`, `audit_logs_actor_officer_id_idx`, `audit_logs_created_at_id_idx`, `audit_logs_pkey` [unique]                                                                                                                                                                                                                                                                                                                             |
| `branches`                 | `branches_name_key` [unique], `branches_normalized_name_key` [unique], `branches_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                      |
| `event_branches`           | `event_branches_branch_id_idx`, `event_branches_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                                                       |
| `event_locations`          | `event_locations_normalized_name_key` [unique], `event_locations_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                                      |
| `event_officers`           | `event_officers_officer_id_idx`, `event_officers_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                                                      |
| `event_series`             | `event_series_pkey` [unique], `event_series_request_key_key` [unique]                                                                                                                                                                                                                                                                                                                                                                                |
| `event_types`              | `event_types_name_key` [unique], `event_types_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                                                         |
| `events`                   | `event_series_occurrence_key` [unique], `events_deleted_by_officer_id_idx`, `events_event_date_idx`, `events_event_type_id_idx`, `events_pkey` [unique], `events_starts_at_idx`                                                                                                                                                                                                                                                                      |
| `officer_branches`         | `officer_branches_branch_id_idx`, `officer_branches_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                                                   |
| `officer_warnings`         | `officer_warnings_officer_id_idx`, `officer_warnings_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                                                  |
| `officers`                 | `officers_auth_user_id_key` [unique], `officers_personal_email_key` [unique], `officers_pkey` [unique], `officers_position_id_idx`, `officers_utep_email_key` [unique]                                                                                                                                                                                                                                                                               |
| `point_transactions`       | `one_participation_award` [unique], `one_task_award_per_officer` [unique], `point_transactions_created_at_idx`, `point_transactions_created_by_idx`, `point_transactions_created_by_officer_id_idx`, `point_transactions_event_id_idx`, `point_transactions_officer_id_idx`, `point_transactions_pkey` [unique], `point_transactions_removed_by_idx`, `point_transactions_removed_by_officer_id_idx`, `point_transactions_updated_by_officer_id_idx` |
| `positions`                | `positions_code_key` [unique], `positions_name_key` [unique], `positions_normalized_name_key` [unique], `positions_pkey` [unique]                                                                                                                                                                                                                                                                                                                    |
| `task_officer_assignments` | `task_officer_assignments_officer_idx`, `task_officer_assignments_pkey` [unique]                                                                                                                                                                                                                                                                                                                                                                     |
| `task_series`              | `task_series_pkey` [unique], `task_series_request_key_key` [unique]                                                                                                                                                                                                                                                                                                                                                                                  |
| `tasks`                    | `task_series_occurrence_key` [unique], `tasks_active_due_date_idx`, `tasks_due_date_idx`, `tasks_pkey` [unique]                                                                                                                                                                                                                                                                                                                                      |
| `warning_approvals`        | `warning_approvals_approver_id_idx`, `warning_approvals_pkey` [unique], `warning_approvals_warning_officer_uidx` [unique]                                                                                                                                                                                                                                                                                                                            |
