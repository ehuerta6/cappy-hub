import type { NextRequest } from "next/server";
import { isAdmin, isLead } from "@/lib/authorization";
import {
  exportErrorResponse,
  requireExportActor,
  searchParamsToRecord,
} from "@/lib/csv-export-auth";
import { buildCsv, csvFilename, csvResponse, fetchAllPages } from "@/lib/csv";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { searchOrFilter } from "@/lib/list-search";
import { formatLabel } from "@/lib/presentation";
import { officerListFiltersSchema } from "@/app/(protected)/officers/filter-validation";

type OfficerExportRow = {
  id: number;
  name: string;
  utep_email: string | null;
  classification: string | null;
  positions: { name: string } | null;
};

const OFFICERS_CSV_HEADERS = [
  "Name",
  "Email",
  "Classification",
  "Position",
] as const;

export async function GET(request: NextRequest) {
  const auth = await requireExportActor();
  if (!auth.ok) return auth.response;
  const { actor, supabase } = auth;
  if (!isAdmin(actor)) {
    return exportErrorResponse("Admin access required", 403);
  }

  try {
    const params = searchParamsToRecord(request.nextUrl.searchParams);
    const filters = officerListFiltersSchema.parse(params);
    const {
      q: search,
      scope,
      status,
      position: positionId,
      branch: branchId,
      warnings: warningFilter,
    } = filters;
    const showBranchScope = isLead(actor) && actor.branchIds.length > 0;
    const effectiveScope =
      scope === "branch" && !showBranchScope ? "all" : scope;

    const officerSelection =
      "id,name,utep_email,classification,positions(name),filter_branch:officer_branches(branch_id),scope_branch:officer_branches(branch_id)";

    const [rows, warningsResult] = await Promise.all([
      fetchAllPages<OfficerExportRow>((from, to) => {
        let query = supabase.from("officers").select(officerSelection);
        if (search)
          query = query.or(
            searchOrFilter(search, ["name", "utep_email", "personal_email"]),
          );
        if (status !== "all") query = query.eq("status", status);
        if (positionId !== undefined)
          query = query.eq("position_id", positionId);
        if (branchId !== undefined)
          query = query
            .eq("filter_branch.branch_id", branchId)
            .not("filter_branch", "is", null);
        if (effectiveScope === "branch" && actor.branchIds.length > 0)
          query = query
            .in("scope_branch.branch_id", actor.branchIds)
            .not("scope_branch", "is", null);
        return query.order("name").order("id").range(from, to) as PromiseLike<{
          data: OfficerExportRow[] | null;
          error: { message: string } | null;
        }>;
      }),
      warningFilter === "review"
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

    let matchingOfficers = rows;
    if (warningFilter === "review") {
      const warningCounts = new Map<number, number>();
      for (const row of warningsResult) {
        warningCounts.set(
          row.officer_id,
          (warningCounts.get(row.officer_id) ?? 0) + 1,
        );
      }
      matchingOfficers = rows.filter(
        (officer) => (warningCounts.get(officer.id) ?? 0) >= 3,
      );
    }

    const csvRows = matchingOfficers.map((officer) => [
      officer.name,
      officer.utep_email ?? "",
      officer.classification ? formatLabel(officer.classification) : "",
      officer.positions?.name ?? "",
    ]);

    const { today } = currentDenverWeek(new Date());
    const csv = buildCsv(OFFICERS_CSV_HEADERS, csvRows);
    return csvResponse(
      csv,
      csvFilename("cappy-hub-officers", today),
      csvRows.length,
    );
  } catch (error) {
    console.error("Failed to export Officers CSV", error);
    return exportErrorResponse("Could not export Officers CSV", 500);
  }
}
