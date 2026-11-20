export type TaskAssignmentSummary = {
  officer_id: number;
  completed_at: string | null;
  completion_approval_pending?: boolean | null;
  removed_at?: string | null;
};

const isApprovedComplete = (assignment: TaskAssignmentSummary) =>
  assignment.completed_at !== null && !assignment.completion_approval_pending;
const isActiveAssignment = (assignment: TaskAssignmentSummary) =>
  assignment.removed_at == null;

export type TaskWithAssignments<
  T extends TaskAssignmentSummary = TaskAssignmentSummary,
> = {
  task_officer_assignments: readonly T[] | null;
};

export function taskStatus(assignments: readonly TaskAssignmentSummary[]) {
  const activeAssignments = assignments.filter(isActiveAssignment);
  if (activeAssignments.length === 0) return "Open";
  return activeAssignments.every(isApprovedComplete)
    ? "Complete"
    : "In progress";
}

export function taskStatusFromCounts(
  assignmentCount: number,
  incompleteCount: number,
) {
  if (assignmentCount === 0) return "Open";
  return incompleteCount === 0 ? "Complete" : "In progress";
}

export function taskProgressLabel(
  assignments: readonly TaskAssignmentSummary[],
) {
  const { completed, total } = taskProgressCounts(assignments);
  if (total === 0) return "0 officers";
  return `${completed}/${total} completed`;
}

export function taskProgressCounts(
  assignments: readonly TaskAssignmentSummary[],
) {
  const activeAssignments = assignments.filter(isActiveAssignment);
  return {
    completed: activeAssignments.filter(isApprovedComplete).length,
    total: activeAssignments.length,
  };
}

export function splitTasksByOfficer<T extends TaskWithAssignments>(
  tasks: readonly T[],
  officerId: number,
) {
  const yourTasks: T[] = [];
  const otherTasks: T[] = [];
  for (const task of tasks) {
    const assigned = (task.task_officer_assignments ?? []).some(
      (assignment) =>
        isActiveAssignment(assignment) && assignment.officer_id === officerId,
    );
    (assigned ? yourTasks : otherTasks).push(task);
  }
  return { yourTasks, otherTasks };
}
