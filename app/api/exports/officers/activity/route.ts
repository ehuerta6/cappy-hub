import type { NextRequest } from "next/server";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { isAdmin, isLead } from "@/lib/authorization";
import {
  exportErrorResponse,
  requireExportActor,
  searchParamsToRecord,
} from "@/lib/csv-export-auth";
import { buildCsv, csvFilename, csvResponse, fetchAllPages } from "@/lib/csv";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { searchOrFilter } from "@/lib/list-search";
import {
  computeOfficerActivityMap,
  emptyOfficerActivitySummary,
  formatTaskCompletionLabel,
  type ActivityEventSignupInput,
  type ActivityTaskAssignmentInput,
} from "@/lib/officer-activity";
import { formatLabel } from "@/lib/presentation";
import { officerListFiltersSchema } from "@/app/(protected)/officers/filter-validation";

const OFFICER_ACTIVITY_CSV_HEADERS = [
  "Officer",
  "Position",
  "Branches",
  "Task Completion %",
  "Completed Due Tasks",
  "Due Tasks",
  "Pending Approval Tasks",
  "Upcoming Tasks",
  "Volunteer Events",
  "Attend Events",
  "Recorded Events",
  "Academic Period",
] as const;

type ActivityOfficerRow = {
  id: number;
  name: string;
  positions: { name: string } | null;
  officer_branches: Array<{
    branch_id: number;
    branches: { name: string } | null;
  }>;
};

export async function GET(request: NextRequest) {
  const auth = await requireExportActor();
  if (!auth.ok) return auth.response;
  const { actor, supabase } = auth;

  try {
    const rawParams = searchParamsToRecord(request.nextUrl.searchParams);
    const filters = officerListFiltersSchema.parse(rawParams);
    const {
      q: search,
      scope,
      status,
      position: positionId,
      branch: branchId,
      warnings: warningFilter,
    } = filters;

    const admin = isAdmin(actor);
    const showBranchScope = isLead(actor) && actor.branchIds.length > 0;
    const effectiveScope =
      scope === "branch" && !showBranchScope ? "all" : scope;
    const effectiveWarningFilter = admin ? warningFilter : undefined;

    const periodParam = request.nextUrl.searchParams.get("period") ?? undefined;
    const periodData = await getAcademicPeriodData();
    const periodSelection = resolveAcademicPeriod(periodParam, periodData);
    const selectedPeriod = periodSelection.period;
    const periodLabel = selectedPeriod ? selectedPeriod.name : "All periods";

    const [officerRows, warningRows] = await Promise.all([
      fetchAllPages<ActivityOfficerRow>((from, to) => {
        let query = supabase
          .from("officers")
          .select(
            "id,name,positions(name),officer_branches(branch_id,branches(name)),filter_branch:officer_branches(branch_id),scope_branch:officer_branches(branch_id)",
          );
        if (search) {
          query = query.or(
            searchOrFilter(search, ["name", "utep_email", "personal_email"]),
          );
        }
        if (status !== "all") query = query.eq("status", status);
        if (positionId !== undefined)
          query = query.eq("position_id", positionId);
        if (branchId !== undefined) {
          query = query
            .eq("filter_branch.branch_id", branchId)
            .not("filter_branch", "is", null);
        }
        if (effectiveScope === "branch" && actor.branchIds.length > 0) {
          query = query
            .in("scope_branch.branch_id", actor.branchIds)
            .not("scope_branch", "is", null);
        }
        return query.order("name").order("id").range(from, to) as PromiseLike<{
          data: ActivityOfficerRow[] | null;
          error: { message: string } | null;
        }>;
      }),
      effectiveWarningFilter === "review"
        ? fetchAllPages<{ officer_id: number }>((from, to) =>
            supabase
              .from("officer_warnings")
              .select("officer_id")
              .eq("status", "approved")
              .is("voided_at", null)
              .is("deleted_at", null)
              .order("id")
              .range(from, to),
          )
        : Promise.resolve([]),
    ]);

    let matchingOfficers = officerRows;
    if (effectiveWarningFilter === "review") {
      const warningCounts = new Map<number, number>();
      for (const row of warningRows) {
        warningCounts.set(
          row.officer_id,
          (warningCounts.get(row.officer_id) ?? 0) + 1,
        );
      }
      matchingOfficers = officerRows.filter(
        (officer) => (warningCounts.get(officer.id) ?? 0) >= 3,
      );
    }

    const { today } = currentDenverWeek(new Date());
    const officerIds = matchingOfficers.map((officer) => officer.id);

    const activityByOfficerId =
      officerIds.length === 0
        ? new Map()
        : await (async () => {
            const [taskAssignments, eventSignups] = await Promise.all([
              fetchAllPages<ActivityTaskAssignmentInput>((from, to) => {
                let query = supabase
                  .from("task_officer_assignments")
                  .select(
                    "officer_id,completed_at,completion_approval_pending,removed_at,tasks!inner(due_date,removed_at,no_longer_needed_at)",
                  )
                  .in("officer_id", officerIds)
                  .is("removed_at", null)
                  .is("tasks.removed_at", null)
                  .is("tasks.no_longer_needed_at", null);
                if (selectedPeriod) {
                  query = query
                    .gte("tasks.due_date", selectedPeriod.starts_on)
                    .lte("tasks.due_date", selectedPeriod.ends_on);
                }
                return query
                  .order("officer_id")
                  .order("task_id")
                  .range(from, to);
              }),
              fetchAllPages<ActivityEventSignupInput>((from, to) => {
                let query = supabase
                  .from("event_officers")
                  .select(
                    "officer_id,event_id,participation_type,removed_at,events!inner(id,event_date,deleted_at,status)",
                  )
                  .in("officer_id", officerIds)
                  .is("removed_at", null)
                  .is("events.deleted_at", null)
                  .neq("events.status", "cancelled");
                if (selectedPeriod) {
                  query = query
                    .gte("events.event_date", selectedPeriod.starts_on)
                    .lte("events.event_date", selectedPeriod.ends_on);
                }
                return query
                  .order("officer_id")
                  .order("event_id")
                  .range(from, to);
              }),
            ]);
            return computeOfficerActivityMap(
              officerIds,
              taskAssignments,
              eventSignups,
              today,
            );
          })();

    const csvRows = matchingOfficers.map((officer) => {
      const activity =
        activityByOfficerId.get(officer.id) ?? emptyOfficerActivitySummary();
      const branchesLabel = Array.from(
        new Set(
          (officer.officer_branches ?? [])
            .map((membership) => membership.branches?.name)
            .filter((name): name is string => Boolean(name))
            .map((name) => formatLabel(name)),
        ),
      )
        .sort((a, b) => a.localeCompare(b))
        .join(", ");

      return [
        officer.name,
        officer.positions?.name ?? "",
        branchesLabel,
        formatTaskCompletionLabel(activity),
        activity.completedDueTasksCount,
        activity.dueTasksCount,
        activity.pendingApprovalTasksCount,
        activity.upcomingTasksCount,
        activity.volunteerEventsCount,
        activity.attendEventsCount,
        activity.totalRecordedEventsCount,
        periodLabel,
      ];
    });

    const csv = buildCsv(OFFICER_ACTIVITY_CSV_HEADERS, csvRows);
    return csvResponse(
      csv,
      csvFilename(
        "cappy-hub-officer-activity",
        today,
        selectedPeriod?.name ?? undefined,
      ),
      csvRows.length,
    );
  } catch (error) {
    console.error("Failed to export Officer activity CSV", error);
    return exportErrorResponse("Could not export Officer activity CSV", 500);
  }
}
