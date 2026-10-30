import "server-only";
import type { AuthorizationContext } from "@/lib/authorization";
import type { Tables } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";
import { DASHBOARD_PREVIEW_LIMIT } from "./dashboard-limits";

// One extra row per source detects overflow without loading the full list.
const queryLimit = DASHBOARD_PREVIEW_LIMIT + 1;
const taskSelection =
  "id,title,due_date,task_officer_assignments!inner(officer_id,completed_at)";

type ActionTask = Pick<Tables<"tasks">, "id" | "title" | "due_date"> & {
  task_officer_assignments: Pick<
    Tables<"task_officer_assignments">,
    "officer_id" | "completed_at"
  >[];
};
export type ActionItem = {
  key: string;
  title: string;
  href: `/tasks/${number}`;
  status: string;
  dueDate?: string;
};
export type DashboardActionItems = ReturnType<typeof dashboardActionItems> & {
  unavailableSources: { tasks: boolean };
};

export function dashboardActionItems(
  actor: AuthorizationContext,
  personalTasks: ActionTask[],
) {
  const byDueDate = (a: ActionTask, b: ActionTask) =>
    a.due_date.localeCompare(b.due_date) || a.id - b.id;
  const taskItem = (task: ActionTask): ActionItem => ({
    key: `task-${task.id}`,
    title: task.title,
    href: `/tasks/${task.id}`,
    status: "Not completed",
    dueDate: task.due_date,
  });
  const pendingTasks = personalTasks
    .filter((task) =>
      task.task_officer_assignments.some(
        (assignment) =>
          assignment.officer_id === actor.id &&
          assignment.completed_at === null,
      ),
    )
    .sort(byDueDate)
    .map(taskItem);
  const items = pendingTasks;
  return {
    items: items.slice(0, DASHBOARD_PREVIEW_LIMIT),
    hasMore: items.length > DASHBOARD_PREVIEW_LIMIT,
  };
}

export async function loadDashboardActionItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: AuthorizationContext,
): Promise<DashboardActionItems> {
  const taskQuery = () =>
    supabase
      .from("tasks")
      .select(taskSelection)
      .is("removed_at", null)
      .order("due_date")
      .order("id")
      .limit(queryLimit);
  const assigned = await taskQuery()
    .eq("task_officer_assignments.officer_id", actor.id)
    .is("task_officer_assignments.completed_at", null);
  const tasksUnavailable = assigned.error !== null || assigned.data === null;
  return {
    ...dashboardActionItems(actor, tasksUnavailable ? [] : assigned.data),
    unavailableSources: {
      tasks: tasksUnavailable,
    },
  };
}
