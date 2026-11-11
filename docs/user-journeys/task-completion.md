# Task completion and award reconciliation

**Actors:** an Officer may self-assign and report completion for their own assignment; a Task manager may assign Officers and review or correct completion within the Task's authorization scope. **Entry:** Task list or detail.

1. An Officer self-assigns, or an authorized manager assigns one or more Officers. Assignments are independent rows; each has its own completion state.
2. An Officer marks their assigned Task complete. A Lead who manages the Task's Branch or an Admin is accepted immediately; another Officer's report waits for an authorized Task manager to approve or reject it. Rejection clears the report, notifies the Officer in-app, and permits a later submission.
3. Trusted database behavior reconciles the Task-derived Point award only after completion is approved and the due date has passed in America/Denver. A relevant Task Point-value or due-date correction recalculates the source-derived award; descriptive edits do not.
4. Task Delete suspends associated awards while preserving assignment/completion history. Restore reconciles eligible approved completions without reviving intentionally removed transactions.

**Important boundaries:** a Task's optional Event link is context and does not make Event changes alter Task awards. Independent manual Points and corrections are not overwritten by Task award reconciliation.

**Sources:** [Task contract](../product/tasks.md), [Points contract](../product/points.md), [authorization](../product/authorization.md), [lifecycles](../product/recurrence-lifecycles.md), `app/(protected)/tasks/actions.ts`, migration `20261004000000_task_officer_completion_workflow.sql`.
