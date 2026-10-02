"use client";

import { useActionState } from "react";
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
  const [state, action, pending] = useActionState(updateTask, {
    error: "",
    success: "",
  });
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="operation" value={operation} />
      {officers && (
        <select
          name="officer_id"
          aria-label="Assign officer"
          required
          defaultValue=""
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
      )}
      {officerId !== undefined && (
        <input type="hidden" name="officer_id" value={officerId} />
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      {state.error && (
        <span role="alert" className="text-red-300">
          {state.error}
        </span>
      )}
      {state.success && <span role="status">{state.success}</span>}
    </form>
  );
}
