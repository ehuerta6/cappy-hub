import {
  taskProgressCounts,
  type TaskAssignmentSummary,
} from "@/lib/task-status";

export default function TaskAssignmentProgress({
  assignments,
}: {
  assignments: readonly TaskAssignmentSummary[];
}) {
  if (assignments.length === 0)
    return <span className="text-sm text-muted">No Officers assigned</span>;

  const { completed, total } = taskProgressCounts(assignments);
  const officerLabel = total === 1 ? "Officer" : "Officers";

  return (
    <div className="task-assignment-progress">
      <span className="task-assignment-progress-copy">
        <strong className="task-assignment-progress-count">{completed}</strong>
        <span className="text-muted">
          of {total} {officerLabel} completed
        </span>
      </span>
      <progress
        className="task-assignment-progress-bar"
        aria-label="Officer completion"
        value={completed}
        max={total}
      />
    </div>
  );
}
