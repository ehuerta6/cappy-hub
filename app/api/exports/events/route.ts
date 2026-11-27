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
import { eventStatus } from "@/lib/event-status";
import { searchOrFilter } from "@/lib/list-search";
import { formatEventSchedule, formatLabel } from "@/lib/presentation";
import { eventListFiltersSchema } from "@/app/(protected)/events/filter-validation";

type EventExportRow = {
  id: number;
  name: string;
  event_date: string;
  starts_at: string;
  ends_at: string;
  location: string;
  status: string;
  deleted_at: string | null;
  delete_points_suspended: boolean;
  max_volunteers: number | null;
  event_types: { name: string } | null;
  event_branches: { branches: { name: string } }[];
  event_officers: { officer_id: number; removed_at: string | null }[];
};

const EVENTS_CSV_HEADERS = [
  "Event",
  "Date",
  "Schedule (El Paso)",
  "Location",
  "Type",
  "Branches",
  "Confirmed Signups",
  "Max Volunteers",
  "Status",
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
    const filters = eventListFiltersSchema.parse(params);
    const mayBrowseDeleted =
      canSeeAllBranches(actor) || (isLead(actor) && actor.branchIds.length > 0);
    const status =
      filters.status === "deleted" && !mayBrowseDeleted
        ? undefined
        : filters.status;
    const { q: search, type: typeId, branch: branchId, scope } = filters;
    const hasOwnBranches = actor.branchIds.length > 0;
    const effectiveScope =
      scope === "branch" && !hasOwnBranches ? "all" : scope;
    const deletedLead =
      status === "deleted" && isLead(actor) && !canSeeAllBranches(actor);

    const now = new Date();
    const nowIso = now.toISOString();
    const { today } = currentDenverWeek(now);

    const eventSelection =
      "id,name,event_date,starts_at,ends_at,location,status,deleted_at,delete_points_suspended,max_volunteers,event_types(name),event_branches(branch_id,branches(name)),filter_branch:event_branches(branch_id),scope_branch:event_branches(branch_id),event_officers(officer_id,removed_at),my_signup:event_officers(officer_id,removed_at,participation_type)";

    const rows = await fetchAllPages<EventExportRow>((from, to) => {
      let query = supabase.from("events").select(eventSelection);
      query =
        status === "deleted"
          ? query.not("deleted_at", "is", null)
          : query.is("deleted_at", null);
      if (deletedLead)
        query = query
          .in("scope_branch.branch_id", actor.branchIds)
          .not("scope_branch", "is", null);

      if (selectedPeriod && status !== "cancelled" && status !== "deleted")
        query = query
          .gte("event_date", selectedPeriod.starts_on)
          .lte("event_date", selectedPeriod.ends_on);
      if (status === undefined) {
        query = query.neq("status", "cancelled");
        if (!selectedPeriod || !periodSelection.isHistorical)
          query = query.gte("event_date", today).gt("ends_at", nowIso);
      }
      if (status === "upcoming")
        query = query.neq("status", "cancelled").gt("starts_at", nowIso);
      if (status === "happening")
        query = query
          .neq("status", "cancelled")
          .lte("starts_at", nowIso)
          .gt("ends_at", nowIso);
      if (status === "past")
        query = query.neq("status", "cancelled").lte("ends_at", nowIso);
      if (status === "cancelled") query = query.eq("status", "cancelled");

      if (effectiveScope === "mine")
        query = query
          .eq("my_signup.officer_id", actor.id)
          .is("my_signup.removed_at", null)
          .not("my_signup", "is", null)
          .in("my_signup.participation_type", ["attendee", "volunteer"]);
      if (effectiveScope === "branch")
        query = query
          .in("scope_branch.branch_id", actor.branchIds)
          .not("scope_branch", "is", null);
      if (search)
        query = query.or(
          searchOrFilter(search, ["name", "description", "location"]),
        );
      if (typeId !== undefined) query = query.eq("event_type_id", typeId);
      if (branchId !== undefined)
        query = query
          .eq("filter_branch.branch_id", branchId)
          .not("filter_branch", "is", null);

      query =
        status === "past"
          ? query
              .order("ends_at", { ascending: false })
              .order("id", { ascending: false })
          : status === "cancelled" || status === "deleted"
            ? query
                .order("event_date", { ascending: false })
                .order("starts_at", { ascending: false })
                .order("id", { ascending: false })
            : query
                .order("starts_at", { ascending: true })
                .order("id", { ascending: true });

      return query.range(from, to) as PromiseLike<{
        data: EventExportRow[] | null;
        error: { message: string } | null;
      }>;
    });

    const csvRows = rows.map((event) => {
      const confirmedCount = event.event_officers.filter(
        ({ removed_at }) => removed_at == null,
      ).length;
      const branches = event.event_branches.length
        ? event.event_branches
            .map(({ branches: branch }) => formatLabel(branch.name))
            .join(", ")
        : "Global";
      const statusLabel = event.deleted_at
        ? event.delete_points_suspended
          ? "Deleted"
          : "Archived"
        : formatLabel(eventStatus(event, now.getTime()));

      return [
        event.name,
        event.event_date,
        formatEventSchedule(event.starts_at, event.ends_at),
        event.location,
        event.event_types?.name ?? "",
        branches,
        confirmedCount,
        event.max_volunteers ?? "",
        statusLabel,
      ];
    });

    const csv = buildCsv(EVENTS_CSV_HEADERS, csvRows);
    return csvResponse(
      csv,
      csvFilename("cappy-hub-events", today, selectedPeriod?.name),
      csvRows.length,
    );
  } catch (error) {
    console.error("Failed to export Events CSV", error);
    return exportErrorResponse("Could not export Events CSV", 500);
  }
}
