import type { SupabaseClient } from "@supabase/supabase-js";
import { searchOrFilter } from "@/lib/list-search";
import type { Database } from "@/lib/database.types";
import type { TaskListView } from "@/lib/task-list";

export const TASKS_PER_PAGE = 8;

export type TaskWorkflowStatus = "open" | "in_progress" | "complete";

type TaskListQueryOptions = {
  view: TaskListView;
  today: string;
  search?: string;
  status?: TaskWorkflowStatus;
  branchId?: number;
  branchScope?: number[];
  assigneeId?: number;
  page: number;
};

export function buildTaskListQuery(
  supabase: SupabaseClient<Database>,
  {
    view,
    today,
    search,
    status,
    branchId,
    branchScope,
    assigneeId,
    page,
  }: TaskListQueryOptions,
) {
  const taskSelection = [
    "*,branches(name),task_officer_assignments(officer_id,completed_at)",
    assigneeId !== undefined &&
      "assignee_filter:task_officer_assignments!inner(officer_id)",
    status === "open" && "no_assignments:task_officer_assignments(task_id)",
    status === "in_progress" &&
      "incomplete_assignment:task_officer_assignments!inner(task_id,completed_at)",
    status === "complete" &&
      "any_assignment:task_officer_assignments!inner(task_id)",
    status === "complete" &&
      "incomplete_assignment:task_officer_assignments(completed_at)",
  ]
    .filter(Boolean)
    .join(",");

  let tasksQuery = supabase
    .from("tasks")
    .select(taskSelection, { count: "exact" });

  if (view === "archived")
    tasksQuery = tasksQuery.not("removed_at", "is", null);
  else {
    tasksQuery = tasksQuery.is("removed_at", null);
    tasksQuery =
      view === "past"
        ? tasksQuery.lt("due_date", today)
        : tasksQuery.gte("due_date", today);
  }

  if (view === "archived" && branchScope?.length)
    tasksQuery = tasksQuery.in("branch_id", branchScope);
  if (search)
    tasksQuery = tasksQuery.or(
      searchOrFilter(search, ["title", "description"]),
    );
  if (branchId !== undefined) tasksQuery = tasksQuery.eq("branch_id", branchId);
  if (assigneeId !== undefined)
    tasksQuery = tasksQuery.eq("assignee_filter.officer_id", assigneeId);

  if (status === "open") tasksQuery = tasksQuery.is("no_assignments", null);
  if (status === "in_progress")
    tasksQuery = tasksQuery.is("incomplete_assignment.completed_at", null);
  if (status === "complete")
    tasksQuery = tasksQuery
      .is("incomplete_assignment.completed_at", null)
      .is("incomplete_assignment", null);

  return tasksQuery
    .order("due_date", { ascending: view === "current" })
    .order("id", { ascending: view === "current" })
    .range((page - 1) * TASKS_PER_PAGE, page * TASKS_PER_PAGE - 1);
}
