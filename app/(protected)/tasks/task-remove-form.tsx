"use client";

import {
  RecurrenceScope,
  recurrenceScopeLabels,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useActionState } from "react";
import { ActionFeedback } from "@/components/ui";
import { initialFormActionState } from "@/lib/form-feedback";
import { removeTask, restoreTask } from "./actions";

export function TaskRemoveForm({
  taskId,
  series,
  requestKey,
}: {
  taskId: number;
  series?: RecurrenceSeries;
  requestKey?: string;
}) {
  const [state, action, pending] = useActionState(
    removeTask,
    initialFormActionState,
  );
  return (
    <form action={action}>
      {series && requestKey && (
        <RecurrenceScope
          series={series}
          requestKey={requestKey}
          recordType="Task"
        />
      )}
      <input type="hidden" name="task_id" value={taskId} />
      <ActionFeedback state={state} />
      <ConfirmationDialog
        title="Archive Task?"
        description={
          series
            ? "This archives the selected Task occurrence. Assignments, completion, Points, and history are preserved."
            : "This archives the Task from routine browsing. Assignments, completion, Points, and history are preserved."
        }
        triggerLabel={pending ? "Archiving…" : "Archive Task"}
        confirmLabel="Archive Task"
        destructive
        pending={pending}
        triggerClassName="button-secondary"
        context={
          series
            ? {
                label: "Scope",
                fieldName: "scope",
                values: recurrenceScopeLabels,
                defaultValue: "occurrence",
              }
            : undefined
        }
      />
    </form>
  );
}

export function TaskRestoreForm({ taskId }: { taskId: number }) {
  const [state, action, pending] = useActionState(
    restoreTask,
    initialFormActionState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="task_id" value={taskId} />
      <ActionFeedback state={state} />
      <button disabled={pending} className="button-secondary">
        {pending ? "Restoring…" : "Restore Task"}
      </button>
    </form>
  );
}
