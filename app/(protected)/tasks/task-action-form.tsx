"use client";

import { useActionState } from "react";
import { ActionFeedback } from "@/components/ui";
import { AcademicPeriodWriteContextField } from "@/components/academic-period-selector";
import { initialFormActionState } from "@/lib/form-feedback";
import { selfAssignTask, selfCompleteTaskAssignment } from "./actions";

export default function TaskSelfAssignForm({ taskId }: { taskId: number }) {
  const [state, action, pending] = useActionState(
    selfAssignTask,
    initialFormActionState,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="task_id" value={taskId} />
      <button
        className="compact-action-button compact-action-button--primary"
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

export function TaskSelfCompletionForm({
  taskId,
  pendingApproval = false,
  completed = false,
}: {
  taskId: number;
  pendingApproval?: boolean;
  completed?: boolean;
}) {
  const [state, action, pending] = useActionState(
    selfCompleteTaskAssignment,
    initialFormActionState,
  );
  if (pendingApproval)
    return <span className="text-sm text-muted">Awaiting approval</span>;
  if (completed) return <span>Completed</span>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <AcademicPeriodWriteContextField />
      <input type="hidden" name="task_id" value={taskId} />
      <button
        className="compact-action-button compact-action-button--primary"
        type="submit"
        disabled={pending}
        aria-label="Mark this task complete"
      >
        {pending ? "Sending…" : "Mark complete"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
