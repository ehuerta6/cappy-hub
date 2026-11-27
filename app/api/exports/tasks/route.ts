import type { NextRequest } from "next/server";
import { canSeeAllBranches, isLead } from "@/lib/authorization";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import {
  exportErrorResponse,
  requireExportActor,
  searchParamsToRecord,
} from "@/lib/csv-export-auth";
import { buildCsv, csvFilename, csvResponse, fetchAllPages } from "@/lib/csv";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { formatLabel, formatTaskDueTime } from "@/lib/presentation";
import { buildTaskListQuery, type TaskListSort } from "@/lib/task-list-query";
import { taskStatus } from "@/lib/task-status";
import { taskListFiltersSchema } from "@/app/(protected)/tasks/filter-validation";
import type { Tables } from "@/lib/database.types";

type TaskExportRow = Tables<"tasks"> & {
  branches: Pick<Tables<"branches">, "name">;
  task_officer_assignments: Pick<
    Tables<"task_officer_assignments">,
    "officer_id" | "completed_at" | "completion_approval_pending" | "removed_at"
  >[];
};

const TASKS_CSV_HEADERS = [
  "Task",
  "Due Date",
  "Due Time",
  "Type",
  "Branch",
  "Points",
  "Assigned",
  "Completed",
  "Pending Approval",
  "Status",
  "No Longer Needed",
] as const;

export async function GET(request: NextRequest) {
  const auth = await requireExportActor();
  if (!auth.ok) return auth.response;
  const { actor, supabase } = auth;

  try {
    const params = searchParamsToRecord(request.nextUrl.searchParams);
    const periodData = await getAcademicPeriodData();
    const periodSelection = resolveAcademicPeriod(params.period, periodData);
    const selectedPeriod = periodSelection.period;
    const filters = taskListFiltersSchema.parse(params);
    const {
      q: search,
      status,
      branch: branchId,
      assignee: assigneeId,
      scope,
      sort,
    } = filters;
    const hasOwnBranches = actor.branchIds.length > 0;
    const effectiveScope =
      scope === "branch" && !hasOwnBranches ? "all" : scope;
    const mayBrowseDeleted =
      canSeeAllBranches(actor) || (isLead(actor) && actor.branchIds.length > 0);
    const view =
      filters.view === "deleted" && !mayBrowseDeleted
        ? "current"
        : (filters.view ?? "current");
    const { today } = currentDenverWeek(new Date());
    const dateRange =
      selectedPeriod && view !== "deleted"
        ? { from: selectedPeriod.starts_on, through: selectedPeriod.ends_on }
        : undefined;

    const rows = await fetchAllPages<TaskExportRow>(
      (from, to) =>
        buildTaskListQuery(supabase, {
          view,
          sort: sort as TaskListSort,
          today,
          search,
          status,
          branchId,
          assigneeId,
          assignedToOfficerId: effectiveScope === "mine" ? actor.id : undefined,
          branchScope:
            (view === "deleted" &&
              isLead(actor) &&
              !canSeeAllBranches(actor)) ||
            effectiveScope === "branch"
              ? actor.branchIds
              : undefined,
          dateRange,
        }).range(from, to) as PromiseLike<{
          data: TaskExportRow[] | null;
          error: { message: string } | null;
        }>,
    );

    const csvRows = rows.map((task) => {
      const activeAssignments = task.task_officer_assignments.filter(
        (assignment) => assignment.removed_at == null,
      );
      const pendingApprovalCount = activeAssignments.filter(
        (assignment) => assignment.completion_approval_pending,
      ).length;
      const completedCount = activeAssignments.filter(
        (assignment) =>
          assignment.completed_at !== null &&
          !assignment.completion_approval_pending,
      ).length;
      const statusLabel = task.removed_at
        ? "Deleted"
        : taskStatus(activeAssignments);

      return [
        task.title,
        task.due_date,
        task.due_time ? formatTaskDueTime(task.due_time) : "",
        formatLabel(task.task_type),
        formatLabel(task.branches.name),
        Number(task.points),
        activeAssignments.length,
        completedCount,
        pendingApprovalCount,
        statusLabel,
        task.no_longer_needed_at ? "Yes" : "No",
      ];
    });

    const csv = buildCsv(TASKS_CSV_HEADERS, csvRows);
    return csvResponse(
      csv,
      csvFilename("cappy-hub-tasks", today, selectedPeriod?.name),
      csvRows.length,
    );
  } catch (error) {
    console.error("Failed to export Tasks CSV", error);
    return exportErrorResponse("Could not export Tasks CSV", 500);
  }
}
