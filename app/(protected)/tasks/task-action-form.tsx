"use client";

import { useActionState } from "react";
import { ActionFeedback } from "@/components/ui";
import { initialFormActionState } from "@/lib/form-feedback";
import { selfAssignTask } from "./actions";

export default function TaskSelfAssignForm({ taskId }: { taskId: number }) {
  const [state, action, pending] = useActionState(
    selfAssignTask,
    initialFormActionState,
  );
  return (
    <form action={action} className="gap-2">
      <input type="hidden" name="task_id" value={taskId} />
      <button
        className="whitespace-nowrap px-3 py-1.5"
        type="submit"
        disabled={pending}
        aria-label="Assign this task to me"
      >
        {pending ? "Assigning…" : "Assign to me"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
