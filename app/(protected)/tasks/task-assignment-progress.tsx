import {
  taskProgressCounts,
  type TaskAssignmentSummary,
} from "@/lib/task-status";

export default function TaskAssignmentProgress({
  assignments,
}: {
  assignments: readonly TaskAssignmentSummary[];
}) {
  const { completed, total } = taskProgressCounts(assignments);
  if (total === 0)
    return <span className="text-sm text-muted">No Officers assigned</span>;

  if (completed === total)
    return (
      <span className="status-badge badge-green task-assignment-all-complete">
        All completed
      </span>
    );

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
