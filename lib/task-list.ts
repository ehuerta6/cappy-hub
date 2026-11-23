export type TaskListView = "current" | "past" | "all" | "deleted";

export type TaskListItem = {
  id: number;
  due_date: string;
  removed_at: string | null;
  created_at?: string;
};

export type TaskListSort = "urgency" | "newest";

export function organizeTaskList<T extends TaskListItem>(
  tasks: readonly T[],
  view: TaskListView,
  today: string,
  sunday: string,
  sort: TaskListSort = "urgency",
) {
  const visible = tasks.filter((task) =>
    view === "deleted"
      ? task.removed_at !== null
      : task.removed_at === null && (view !== "past" || task.due_date < today),
  );
  const ordered = [...visible].sort((left, right) => {
    if (sort === "newest")
      return (
        (right.created_at ?? "").localeCompare(left.created_at ?? "") ||
        right.id - left.id
      );
    const dueOrder = left.due_date.localeCompare(right.due_date);
    const historicalOrder = view === "deleted" ? -dueOrder : dueOrder;
    return (
      historicalOrder ||
      (view === "past" || view === "deleted"
        ? right.id - left.id
        : left.id - right.id)
    );
  });
  if (view === "deleted")
    return {
      view,
      tasks: ordered,
    };
  if (view === "all") return { view, tasks: ordered };
  if (view === "past") {
    return {
      view,
      tasks: ordered,
    };
  }

  const overdue = ordered.filter((task) => task.due_date < today);
  const current = ordered.filter((task) => task.due_date >= today);
  return {
    view,
    overdue,
    thisWeek: current.filter((task) => task.due_date <= sunday),
    upcoming: current.filter((task) => task.due_date > sunday),
  };
}
