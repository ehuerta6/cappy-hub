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
  dateRange?: { from: string; through: string };
  periodIsHistorical?: boolean;
};

export function taskListDateFilters({
  view,
  today,
  dateRange,
  periodIsHistorical = false,
}: Pick<
  TaskListQueryOptions,
  "view" | "today" | "dateRange" | "periodIsHistorical"
>) {
  if (view === "deleted") return {};

  const from = dateRange?.from;
  const through = dateRange?.through;
  if (dateRange && periodIsHistorical) return { from, through };

  return view === "past"
    ? { from, through, before: today }
    : { from: from && from > today ? from : today, through };
}

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
    dateRange,
    periodIsHistorical = false,
  }: TaskListQueryOptions,
) {
  const taskSelection = [
    "*,branches(name),task_officer_assignments(officer_id,completed_at,completion_approval_pending)",
    assigneeId !== undefined &&
      "assignee_filter:task_officer_assignments!inner(officer_id)",
    status === "open" && "no_assignments:task_officer_assignments(task_id)",
    status === "in_progress" &&
      "incomplete_assignment:task_officer_assignments!inner(task_id,completed_at,completion_approval_pending)",
    status === "complete" &&
      "any_assignment:task_officer_assignments!inner(task_id)",
    status === "complete" &&
      "incomplete_assignment:task_officer_assignments(completed_at,completion_approval_pending)",
  ]
    .filter(Boolean)
    .join(",");

  let tasksQuery = supabase
    .from("tasks")
    .select(taskSelection, { count: "exact" });

  if (view === "deleted") tasksQuery = tasksQuery.not("removed_at", "is", null);
  else {
    tasksQuery = tasksQuery.is("removed_at", null);
    const dateFilters = taskListDateFilters({
      view,
      today,
      dateRange,
      periodIsHistorical,
    });
    if ("from" in dateFilters && dateFilters.from)
      tasksQuery = tasksQuery.gte("due_date", dateFilters.from);
    if ("through" in dateFilters && dateFilters.through)
      tasksQuery = tasksQuery.lte("due_date", dateFilters.through);
    if ("before" in dateFilters && dateFilters.before)
      tasksQuery = tasksQuery.lt("due_date", dateFilters.before);
  }

  if (view === "deleted" && branchScope?.length)
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
    tasksQuery = tasksQuery.or(
      "completed_at.is.null,completion_approval_pending.eq.true",
      { referencedTable: "incomplete_assignment" },
    );
  if (status === "complete")
    tasksQuery = tasksQuery
      .or("completed_at.is.null,completion_approval_pending.eq.true", {
        referencedTable: "incomplete_assignment",
      })
      .is("incomplete_assignment", null);

  return tasksQuery
    .order("due_date", { ascending: view === "current" })
    .order("id", { ascending: view === "current" })
    .range((page - 1) * TASKS_PER_PAGE, page * TASKS_PER_PAGE - 1);
}
