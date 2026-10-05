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
import { removeTask } from "./actions";

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
        title="Remove Task?"
        description={
          series
            ? "This removes the Task in the selected scope according to current recurring-series rules. Protected completion and award history remains in place."
            : "This removes the Task from routine browsing. Protected completion and Point history cannot be removed."
        }
        triggerLabel={pending ? "Removing…" : "Remove task"}
        confirmLabel="Remove Task"
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
