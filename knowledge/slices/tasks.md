# Tasks

**Status:** Shipped on the audited `main` snapshot (`2202dee9f0856dc43bc1a7b9a5a1673703ec5ef7`).
**Actors:** Officers self-assign when allowed; Task managers manage assignments and completion; trusted processing reconciles awards.
**Aliases:** Task assignment, completion, Task awards.
**Slice boundary:** Covers Task occurrence and per-Officer work lifecycle; recurrence mechanics, generic Point ledger behavior, and Calendar/Dashboard projections have separate slices.

## End-to-end shape

A Task is a branch-scoped work record with a date-only due date and zero or more Event links for context. Assignment is represented by `task_officer_assignments`; multiple Officers can be assigned independently. Officers may self-assign when open, while authorized managers assign/remove Officers and manage completion. After the due date, trusted processing reconciles one Task-derived Point award per completed assignment. Task deletion suspends eligible automatic awards and restoration re-evaluates the preserved completion state. Standalone and recurring occurrences lead to the same Task record workflow.

Task-to-Event links provide context only: they do not inherit Event permissions or make Event lifecycle changes recalculate Task awards. The internal [Calendar](calendar.md) displays active Task due dates; the [Dashboard](dashboard.md) may show incomplete assigned Tasks as personal action items.

Historical approval fields/audit entries are compatibility evidence. The retired single-assignee projection and legacy completion-approval workflow are not current behavior.

## Sources

- Canonical behavior: [Tasks](../../docs/product/tasks.md), [Points](../../docs/product/points.md), [recurrence/lifecycles](../../docs/product/recurrence-lifecycles.md), [authorization](../../docs/product/authorization.md).
- Application: [Task actions](../../app/%28protected%29/tasks/actions.ts), [Tasks page](../../app/%28protected%29/tasks/page.tsx).
- Database evidence: [20261004000000_task_officer_completion_workflow.sql](../../supabase/migrations/20261004000000_task_officer_completion_workflow.sql), [20261007120000_remove_legacy_task_assignment_projection.sql](../../supabase/migrations/20261007120000_remove_legacy_task_assignment_projection.sql), [20261008170000_task_event_links.sql](../../supabase/migrations/20261008170000_task_event_links.sql), [20261030183000_task_delete_restore.sql](../../supabase/migrations/20261030183000_task_delete_restore.sql).
- Checks: [tasks-actions.test.ts](../../tests/tasks-actions.test.ts), [task-list-query.test.ts](../../tests/task-list-query.test.ts), [task-officer-controls.test.tsx](../../tests/task-officer-controls.test.tsx), [task-list-postgrest.integration.test.ts](../../tests/task-list-postgrest.integration.test.ts).
- Related journey: [Task completion and award reconciliation](../../docs/user-journeys/task-completion.md).
- Related slices: [Points](points.md), [recurrence](recurrence.md), [Calendar](calendar.md), [Dashboard](dashboard.md).
