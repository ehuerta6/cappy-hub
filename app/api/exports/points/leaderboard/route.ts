import type { NextRequest } from "next/server";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { exportErrorResponse, requireExportActor } from "@/lib/csv-export-auth";
import { buildCsv, csvFilename, csvResponse, fetchAllPages } from "@/lib/csv";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { formatLabel } from "@/lib/presentation";

const LEADERBOARD_CSV_HEADERS = [
  "Rank",
  "Officer",
  "Position",
  "Branches",
  "Total Points",
  "Positive Points",
  "Negative Points",
  "Academic Period",
] as const;

function parseOptionalId(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw.trim());
  return Number.isSafeInteger(parsed) && parsed !== 0 ? parsed : null;
}

type OfficerMetaRow = {
  id: number;
  position_id?: number | null;
  positions?: { name: string } | null;
  officer_branches?: Array<{
    branch_id: number;
    branches: { name: string } | null;
  }>;
};

export async function GET(request: NextRequest) {
  const auth = await requireExportActor();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  try {
    const periodParam = request.nextUrl.searchParams.get("period") ?? undefined;
    const rawBranch =
      request.nextUrl.searchParams.get("branch")?.trim() ?? null;
    const onlyUnassignedBranch = rawBranch === "none";
    const branchId = onlyUnassignedBranch ? null : parseOptionalId(rawBranch);
    const positionId = parseOptionalId(
      request.nextUrl.searchParams.get("position"),
    );
    const periodData = await getAcademicPeriodData();
    const periodSelection = resolveAcademicPeriod(periodParam, periodData);
    const selectedPeriod = periodSelection.period;

    const { today } = currentDenverWeek(new Date());
    if (!selectedPeriod) {
      const csv = buildCsv(LEADERBOARD_CSV_HEADERS, []);
      return csvResponse(
        csv,
        csvFilename("cappy-hub-points-leaderboard", today),
        0,
      );
    }

    const [activeOfficers, periodPoints] = await Promise.all([
      fetchAllPages<OfficerMetaRow>((from, to) => {
        let query = supabase
          .from("officers")
          .select(
            "id,position_id,positions(name),officer_branches(branch_id,branches(name))",
          )
          .eq("status", "active");
        if (positionId !== null) {
          query = query.eq("position_id", positionId);
        }
        return query.order("id").range(from, to);
      }),
      supabase
        .rpc("academic_period_point_summary", {
          p_period_id: selectedPeriod.id,
        })
        .single(),
    ]);
    if (periodPoints.error || !periodPoints.data) {
      throw new Error(
        periodPoints.error?.message ?? "Failed to load period points",
      );
    }

    const eligibleById = new Map<
      number,
      { positionName: string; branchesLabel: string }
    >();
    for (const officer of activeOfficers) {
      const memberships = officer.officer_branches ?? [];
      if (onlyUnassignedBranch && memberships.length > 0) continue;
      if (
        branchId !== null &&
        !memberships.some((membership) => membership.branch_id === branchId)
      ) {
        continue;
      }
      const branchNames = Array.from(
        new Set(
          memberships
            .map((membership) => membership.branches?.name)
            .filter((name): name is string => Boolean(name))
            .map((name) => formatLabel(name)),
        ),
      ).sort((a, b) => a.localeCompare(b));
      eligibleById.set(officer.id, {
        positionName: officer.positions?.name ?? "",
        branchesLabel: branchNames.join(", "),
      });
    }

    const ranking = (
      periodPoints.data.ranking as Array<{
        officer_id: number;
        officer_name: string;
        points: number;
        normal_points: number;
        negative_points: number;
      }>
    ).filter((row) => eligibleById.has(row.officer_id));

    const csvRows = ranking.map((row, index) => {
      const meta = eligibleById.get(row.officer_id)!;
      return [
        index + 1,
        row.officer_name,
        meta.positionName,
        meta.branchesLabel,
        Number(row.points ?? 0),
        Number(row.normal_points ?? 0),
        Number(row.negative_points ?? 0),
        selectedPeriod.name,
      ];
    });

    const csv = buildCsv(LEADERBOARD_CSV_HEADERS, csvRows);
    return csvResponse(
      csv,
      csvFilename("cappy-hub-points-leaderboard", today, selectedPeriod.name),
      csvRows.length,
    );
  } catch (error) {
    console.error("Failed to export Points leaderboard CSV", error);
    return exportErrorResponse("Could not export Points leaderboard CSV", 500);
  }
}
