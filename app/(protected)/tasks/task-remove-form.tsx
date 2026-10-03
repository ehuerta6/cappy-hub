"use client";

import {
  RecurrenceScope,
  confirmRecurrenceMutation,
  type RecurrenceSeries,
} from "@/components/recurrence-scope";
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
  series: RecurrenceSeries;
  requestKey: string;
}) {
  const [state, action, pending] = useActionState(
    removeTask,
    initialFormActionState,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirmRecurrenceMutation(event.currentTarget, "Remove Task"))
          event.preventDefault();
      }}
    >
      <RecurrenceScope
        series={series}
        requestKey={requestKey}
        recordType="Task"
      />
      <input type="hidden" name="task_id" value={taskId} />
      <ActionFeedback state={state} />
      <button className="button-secondary" disabled={pending}>
        {pending ? "Removing…" : "Remove task"}
      </button>
    </form>
  );
}
