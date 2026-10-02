import type { Tables } from "@/lib/database.types";
import TaskActionForm from "./task-action-form";

type Task = Pick<Tables<"tasks">, "id" | "approval_required">;
type Assignment = Pick<
  Tables<"task_assignments">,
  "officer_id" | "completed_at" | "approved_at"
> | null;
export function taskStatus(task: Task, assignment: Assignment) {
  let status = "Open";
  if (assignment) {
    if (!assignment.completed_at) {
      status = "Assigned";
    } else if (task.approval_required && !assignment.approved_at) {
      status = "Awaiting approval";
    } else {
      status = "Complete";
    }
  }
  return status;
}
export function TaskWorkflow({
  task,
  assignment,
  actorId,
  canManage,
  officers,
}: {
  task: Task;
  assignment: Assignment;
  actorId: number;
  canManage: boolean;
  officers: { id: number; name: string }[];
}) {
  return (
    <div className="space-y-3">
      {!assignment && (
        <div className="space-y-2">
          <TaskActionForm
            taskId={task.id}
            operation="assign"
            officerId={actorId}
            label="Self-assign"
          />
          {canManage && (
            <TaskActionForm
              taskId={task.id}
              operation="assign"
              label="Assign"
              officers={officers}
            />
          )}
        </div>
      )}
      {assignment &&
        !assignment.completed_at &&
        assignment.officer_id === actorId && (
          <TaskActionForm
            taskId={task.id}
            operation="complete"
            label="Mark complete"
          />
        )}
      {assignment?.completed_at &&
        task.approval_required &&
        !assignment.approved_at &&
        canManage &&
        assignment.officer_id !== actorId && (
          <TaskActionForm
            taskId={task.id}
            operation="approve"
            label="Approve"
          />
        )}
    </div>
  );
}
