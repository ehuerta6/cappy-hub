"use client";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useActionState } from "react";
import { ActionFeedback } from "@/components/ui";
import { initialFormActionState } from "@/lib/form-feedback";
import { removeTask, restoreTask } from "./actions";

const lifecycleScopeContext = {
  label: "Scope",
  fieldName: "scope",
  values: {
    occurrence: "This occurrence only. Other deleted occurrences stay deleted.",
    following:
      "This occurrence and following occurrences from the same Delete action only.",
    series: "All occurrences from the same Delete action only.",
  },
  defaultValue: "occurrence",
} as const;

function RecurrenceLifecycleScope() {
  return (
    <fieldset className="space-y-2 text-sm">
      <legend className="font-medium">Choose occurrences</legend>
      {[
        ["occurrence", "This occurrence"],
        ["following", "This and following occurrences"],
        ["series", "All occurrences"],
      ].map(([value, label]) => (
        <label key={value} className="flex items-center gap-2">
          <input
            type="radio"
            name="scope"
            value={value}
            defaultChecked={value === "occurrence"}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function recurrenceInputs(
  series?: { id: number; revision: number },
  requestKey?: string,
) {
  if (!series) return null;
  return (
    <>
      <input type="hidden" name="recurrence_series_id" value={series.id} />
      <input type="hidden" name="recurrence_revision" value={series.revision} />
      <input type="hidden" name="mutation_request_key" value={requestKey} />
    </>
  );
}

export function TaskDeleteForm({
  taskId,
  series,
  requestKey,
}: {
  taskId: number;
  series?: { id: number; revision: number };
  requestKey?: string;
}) {
  const [state, action, pending] = useActionState(
    removeTask,
    initialFormActionState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="task_id" value={taskId} />
      {recurrenceInputs(series, requestKey)}
      <ActionFeedback state={state} />
      <ConfirmationDialog
        title={series ? "Delete recurring Tasks?" : "Delete Task?"}
        description="The selected scope leaves active lists and suspends eligible automatic Points. Assignments, completion, recurrence identity, and history remain available if restored."
        triggerLabel={pending ? "Deleting…" : "Delete Task"}
        confirmLabel="Delete Task"
        destructive
        context={series ? lifecycleScopeContext : undefined}
        pending={pending}
        triggerClassName="button-secondary"
      >
        {series && <RecurrenceLifecycleScope />}
      </ConfirmationDialog>
    </form>
  );
}

export function TaskRestoreForm({
  taskId,
  series,
  requestKey,
}: {
  taskId: number;
  series?: { id: number; revision: number };
  requestKey?: string;
}) {
  const [state, action, pending] = useActionState(
    restoreTask,
    initialFormActionState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="task_id" value={taskId} />
      {recurrenceInputs(series, requestKey)}
      <ActionFeedback state={state} />
      {series ? (
        <ConfirmationDialog
          title="Restore recurring Tasks?"
          description="Only occurrences deleted by the same Delete action are eligible. Independently deleted occurrences remain deleted, and assignments, completion, Points, and history are preserved."
          triggerLabel={pending ? "Restoring…" : "Restore Task"}
          confirmLabel="Restore selected scope"
          context={lifecycleScopeContext}
          pending={pending}
        >
          <RecurrenceLifecycleScope />
        </ConfirmationDialog>
      ) : (
        <button disabled={pending} className="button-secondary">
          {pending ? "Restoring…" : "Restore Task"}
        </button>
      )}
    </form>
  );
}
