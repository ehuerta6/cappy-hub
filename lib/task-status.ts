export type TaskAssignmentSummary = {
  officer_id: number;
  completed_at: string | null;
};

export type TaskWithAssignments<
  T extends TaskAssignmentSummary = TaskAssignmentSummary,
> = {
  task_officer_assignments: readonly T[] | null;
};

export function taskStatus(assignments: readonly TaskAssignmentSummary[]) {
  if (assignments.length === 0) return "Open";
  return assignments.every((assignment) => assignment.completed_at !== null)
    ? "Complete"
    : "In progress";
}

export function taskProgressLabel(
  assignments: readonly TaskAssignmentSummary[],
) {
  const completed = assignments.filter(
    (assignment) => assignment.completed_at !== null,
  ).length;
  if (assignments.length === 0) return "0 officers";
  return `${completed}/${assignments.length} completed`;
}

export function splitTasksByOfficer<T extends TaskWithAssignments>(
  tasks: readonly T[],
  officerId: number,
) {
  const yourTasks: T[] = [];
  const otherTasks: T[] = [];
  for (const task of tasks) {
    const assigned = (task.task_officer_assignments ?? []).some(
      (assignment) => assignment.officer_id === officerId,
    );
    (assigned ? yourTasks : otherTasks).push(task);
  }
  return { yourTasks, otherTasks };
}
