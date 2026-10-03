"use client";

import { useActionState } from "react";
import { removeTask } from "./actions";

export function TaskRemoveForm({ taskId }: { taskId: number }) {
  const [state, action, pending] = useActionState(removeTask, {
    error: "",
    success: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="task_id" value={taskId} />
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <button className="button-secondary" disabled={pending}>
        {pending ? "Removing…" : "Remove this occurrence"}
      </button>
    </form>
  );
}
