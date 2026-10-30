"use client";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useActionState } from "react";
import { ActionFeedback } from "@/components/ui";
import { initialFormActionState } from "@/lib/form-feedback";
import { removeTask, restoreTask } from "./actions";

export function TaskDeleteForm({ taskId }: { taskId: number }) {
  const [state, action, pending] = useActionState(
    removeTask,
    initialFormActionState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="task_id" value={taskId} />
      <ActionFeedback state={state} />
      <ConfirmationDialog
        title="Delete Task?"
        description="This removes the Task from active lists and suspends its automatic Points. Its assignments, completion, recurrence details, and history remain available if restored."
        triggerLabel={pending ? "Deleting…" : "Delete Task"}
        confirmLabel="Delete Task"
        destructive
        pending={pending}
        triggerClassName="button-secondary"
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
