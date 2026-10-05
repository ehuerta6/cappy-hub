export type TaskListView = "current" | "past";

export type TaskListItem = {
  id: number;
  due_date: string;
  removed_at: string | null;
};

export function organizeTaskList<T extends TaskListItem>(
  tasks: readonly T[],
  view: TaskListView,
  today: string,
  sunday: string,
) {
  const visible = tasks.filter((task) => task.removed_at === null);
  if (view === "past") {
    return {
      view,
      tasks: visible
        .filter((task) => task.due_date < today)
        .sort(
          (left, right) =>
            right.due_date.localeCompare(left.due_date) || right.id - left.id,
        ),
    };
  }

  const current = visible
    .filter((task) => task.due_date >= today)
    .sort(
      (left, right) =>
        left.due_date.localeCompare(right.due_date) || left.id - right.id,
    );
  return {
    view,
    thisWeek: current.filter((task) => task.due_date <= sunday),
    upcoming: current.filter((task) => task.due_date > sunday),
  };
}
