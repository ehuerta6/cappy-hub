# Task completion and award reconciliation

**Actors:** an Officer may self-assign when allowed; a Task manager may assign Officers and manage completion within the Task's authorization scope. **Entry:** Task list or detail.

1. An Officer self-assigns, or an authorized manager assigns one or more Officers. Assignments are independent rows; each has its own completion state.
2. An authorized manager records completion for that assignment.
3. Trusted database behavior determines whether the due-date eligibility conditions are met and reconciles the Task-derived Point award. A relevant Task Point-value or due-date correction recalculates the source-derived award; descriptive edits do not.
4. Task Delete suspends associated awards while preserving assignment/completion history. Restore reconciles eligible awards without reviving intentionally removed transactions.

**Important boundaries:** a Task's optional Event link is context and does not make Event changes alter Task awards. Independent manual Points and corrections are not overwritten by Task award reconciliation.

**Sources:** [Task contract](../product/tasks.md), [Points contract](../product/points.md), [authorization](../product/authorization.md), [lifecycles](../product/recurrence-lifecycles.md), `app/(protected)/tasks/actions.ts`, migration `20261004000000_task_officer_completion_workflow.sql`.
