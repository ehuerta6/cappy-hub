import type { NextRequest } from "next/server";
import { canManagePoints } from "@/lib/authorization";
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
import { literalSearchPattern } from "@/lib/list-search";
import { formatDateTime, formatLabel } from "@/lib/presentation";
import type { Tables } from "@/lib/database.types";
import {
  pointHistoryFiltersSchema,
  resolvePointHistoryStatus,
} from "@/app/(protected)/points/validation";

const POINT_HISTORY_CSV_HEADERS = [
  "Activity Date",
  "Officer",
  "Award Type",
  "Points",
  "Reason",
  "Event",
  "Task",
  "Status",
  "Created At",
] as const;

export async function GET(request: NextRequest) {
  const auth = await requireExportActor();
  if (!auth.ok) return auth.response;
  const { actor, supabase } = auth;
  const admin = canManagePoints(actor);

  try {
    const params = searchParamsToRecord(request.nextUrl.searchParams);
    const periodData = await getAcademicPeriodData();
    const periodSelection = resolveAcademicPeriod(params.period, periodData);
    const selectedPeriod = periodSelection.period;

    const parsedFilters = pointHistoryFiltersSchema.safeParse(params);
    const filters = parsedFilters.success
      ? parsedFilters.data
      : pointHistoryFiltersSchema.parse({});
    const {
      q: search,
      type: awardType,
      officer: officerId,
      event: eventId,
      from: fromDate,
      to: toDate,
      dateRangeIsReversed,
    } = filters;
    const status = resolvePointHistoryStatus(filters.status, admin);

    const rows = await fetchAllPages<Tables<"point_history">>((from, to) => {
      let query = supabase.from("point_history").select("*");
      if (status === "active") query = query.is("removed_at", null);
      if (status === "removed") query = query.not("removed_at", "is", null);
      if (selectedPeriod)
        query = query
          .gte("activity_date", selectedPeriod.starts_on)
          .lte("activity_date", selectedPeriod.ends_on);
      if (search)
        query = query.filter(
          "search_text",
          "imatch",
          literalSearchPattern(search),
        );
      if (awardType) query = query.eq("award_type", awardType);
      if (officerId !== undefined) query = query.eq("officer_id", officerId);
      if (eventId !== undefined) query = query.eq("event_id", eventId);
      if (!dateRangeIsReversed && fromDate)
        query = query.gte("activity_date", fromDate);
      if (!dateRangeIsReversed && toDate)
        query = query.lte("activity_date", toDate);
      return query
        .order("activity_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
    });

    const csvRows = rows.map((row) => [
      row.activity_date ?? "",
      row.officer_name ?? "",
      row.award_type ? formatLabel(row.award_type) : "",
      row.points !== null ? Number(row.points) : "",
      row.reason ?? "",
      row.event_name ?? "",
      row.task_title ?? "",
      row.removed_at
        ? row.participation_schedule_suspended
          ? "Suspended"
          : "Removed"
        : "Active",
      row.created_at ? formatDateTime(row.created_at) : "",
    ]);

    const { today } = currentDenverWeek(new Date());
    const csv = buildCsv(POINT_HISTORY_CSV_HEADERS, csvRows);
    return csvResponse(
      csv,
      csvFilename("cappy-hub-point-history", today, selectedPeriod?.name),
      csvRows.length,
    );
  } catch (error) {
    console.error("Failed to export Point History CSV", error);
    return exportErrorResponse("Could not export Point History CSV", 500);
  }
}
