"use client";

import { useActionState } from "react";
import { ActionFeedback, FieldError } from "@/components/ui";
import { initialFormActionState, submittedValue } from "@/lib/form-feedback";
import { updateTask } from "./actions";

export default function TaskActionForm({
  taskId,
  operation,
  officerId,
  label,
  officers,
}: {
  taskId: number;
  operation: "assign" | "complete" | "approve";
  officerId?: number;
  label: string;
  officers?: { id: number; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    updateTask,
    initialFormActionState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  const pendingLabel =
    operation === "assign"
      ? "Assigning…"
      : operation === "complete"
        ? "Completing…"
        : "Approving…";
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="operation" value={operation} />
      {officers && (
        <>
          <select
            className="min-w-0 flex-1 basis-40"
            name="officer_id"
            aria-label="Assign officer"
            required
            aria-invalid={Boolean(fieldErrors.officer_id)}
            aria-describedby={
              fieldErrors.officer_id ? "task-officer-error" : undefined
            }
            defaultValue={submittedValue(state.values, "officer_id")}
          >
            <option value="" disabled>
              Select officer
            </option>
            {officers.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}
              </option>
            ))}
          </select>
          <FieldError id="task-officer-error">
            {fieldErrors.officer_id}
          </FieldError>
        </>
      )}
      {officerId !== undefined && (
        <input type="hidden" name="officer_id" value={officerId} />
      )}
      <button className="shrink-0" type="submit" disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
