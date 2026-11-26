import type { SupabaseClient } from "@supabase/supabase-js";
import { searchOrFilter } from "@/lib/list-search";
import type { Database } from "@/lib/database.types";

export type TaskWorkflowStatus =
  | "open"
  | "in_progress"
  | "needs_approval"
  | "complete";
export type TaskListSort = "urgency" | "newest";
export type TaskListView = "current" | "past" | "all" | "deleted";

type TaskListQueryOptions = {
  view: TaskListView;
  sort: TaskListSort;
  today: string;
  search?: string;
  status?: TaskWorkflowStatus;
  branchId?: number;
  branchScope?: number[];
  assigneeId?: number;
  assignedToOfficerId?: number;
  /** Accepted for stale callers during the pagination-free UI prototype. */
  page?: number;
  dateRange?: { from: string; through: string };
};

export function taskListDateFilters({
  view,
  today,
  dateRange,
}: Pick<TaskListQueryOptions, "view" | "today" | "dateRange">) {
  if (view === "deleted") return {};

  const from = dateRange?.from;
  const through = dateRange?.through;
  if (view === "past") return { from, through, before: today };
  if (view === "current") return { from, through, currentFrom: today };
  return { from, through };
}

export function buildTaskListQuery(
  supabase: SupabaseClient<Database>,
  {
    view,
    sort,
    today,
    search,
    status,
    branchId,
    branchScope,
    assigneeId,
    assignedToOfficerId,
    dateRange,
  }: TaskListQueryOptions,
) {
  const taskSelection = [
    "*,branches(name,color),task_types(color),task_officer_assignments(officer_id,completed_at,completion_approval_pending,removed_at)",
    (view === "current" ||
      view === "past" ||
      status === "open" ||
      status === "complete") &&
      "active_assignments:task_officer_assignments(task_id,removed_at)",
    (view === "current" ||
      view === "past" ||
      status === "in_progress" ||
      status === "complete") &&
      "incomplete_assignments:task_officer_assignments(task_id,completed_at,completion_approval_pending,removed_at)",
    status === "needs_approval" &&
      "pending_approval:task_officer_assignments!inner(task_id,completion_approval_pending,removed_at)",
    assigneeId !== undefined &&
      "assignee_filter:task_officer_assignments!inner(officer_id,removed_at)",
    assignedToOfficerId !== undefined &&
      "my_assignment:task_officer_assignments!inner(officer_id,removed_at)",
  ]
    .filter(Boolean)
    .join(",");

  let tasksQuery = supabase
    .from("tasks")
    .select(taskSelection, { count: "exact" });

  if (view === "deleted") tasksQuery = tasksQuery.not("removed_at", "is", null);
  else {
    tasksQuery = tasksQuery.is("removed_at", null);
    if (view === "current" || view === "past")
      tasksQuery = tasksQuery.is("no_longer_needed_at", null);
    const dateFilters = taskListDateFilters({
      view,
      today,
      dateRange,
    });
    if ("from" in dateFilters && dateFilters.from)
      tasksQuery = tasksQuery.gte("due_date", dateFilters.from);
    if ("through" in dateFilters && dateFilters.through)
      tasksQuery = tasksQuery.lte("due_date", dateFilters.through);
    if ("before" in dateFilters && dateFilters.before)
      tasksQuery = tasksQuery.lt("due_date", dateFilters.before);
    if ("currentFrom" in dateFilters && dateFilters.currentFrom)
      tasksQuery = tasksQuery.or(
        `due_date.gte.${dateFilters.currentFrom},and(due_date.lt.${dateFilters.currentFrom},or(active_assignments.is.null,incomplete_assignments.not.is.null))`,
      );
    if (view === "past")
      tasksQuery = tasksQuery
        .not("active_assignments", "is", null)
        .is("incomplete_assignments", null);
  }

  if (
    view === "current" ||
    view === "past" ||
    status === "open" ||
    status === "complete"
  )
    tasksQuery = tasksQuery.is("active_assignments.removed_at", null);
  if (
    view === "current" ||
    view === "past" ||
    status === "in_progress" ||
    status === "complete"
  )
    tasksQuery = tasksQuery
      .or("completed_at.is.null,completion_approval_pending.eq.true", {
        referencedTable: "incomplete_assignments",
      })
      .is("incomplete_assignments.removed_at", null);

  if (branchScope?.length)
    tasksQuery = tasksQuery.in("branch_id", branchScope);
  if (search)
    tasksQuery = tasksQuery.or(
      searchOrFilter(search, ["title", "description"]),
    );
  if (branchId !== undefined) tasksQuery = tasksQuery.eq("branch_id", branchId);
  if (assigneeId !== undefined)
    tasksQuery = tasksQuery
      .eq("assignee_filter.officer_id", assigneeId)
      .is("assignee_filter.removed_at", null);
  if (assignedToOfficerId !== undefined)
    tasksQuery = tasksQuery
      .eq("my_assignment.officer_id", assignedToOfficerId)
      .is("my_assignment.removed_at", null);

  if (status === "open")
    tasksQuery = tasksQuery
      .is("active_assignments.removed_at", null)
      .is("active_assignments", null);
  if (status === "in_progress")
    tasksQuery = tasksQuery.not("incomplete_assignments", "is", null);
  if (status === "needs_approval")
    tasksQuery = tasksQuery
      .eq("pending_approval.completion_approval_pending", true)
      .is("pending_approval.removed_at", null);
  if (status === "complete")
    tasksQuery = tasksQuery
      .is("active_assignments.removed_at", null)
      .not("active_assignments", "is", null)
      .is("incomplete_assignments", null);

  if (sort === "newest")
    tasksQuery = tasksQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  else if (view === "past")
    tasksQuery = tasksQuery
      .order("due_date", { ascending: true })
      .order("id", { ascending: false });
  else
    tasksQuery = tasksQuery
      .order("due_date", {
        ascending: view !== "deleted",
      })
      .order("id", { ascending: view !== "deleted" });
  return tasksQuery;
}
