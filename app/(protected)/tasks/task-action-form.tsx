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
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="task_id" value={taskId} />
      <button className="shrink-0" type="submit" disabled={pending}>
        {pending ? "Assigning…" : "Self-assign"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
