import { getAuthorizationContext, canManagePoints } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import type { Route } from "next";
import TransactionForm from "./transaction-form";
import HistoryTable from "./history-table";
import PointHistoryFilterControls from "./history-filters";
import PointsRankingTableClient from "./ranking-table-client";
import GroupedPointsRankingClient from "./grouped-ranking-view";
import { literalSearchPattern } from "@/lib/list-search";
import { withPeriodParam } from "@/lib/period-url";
import {
  pointHistoryFiltersSchema,
  resolvePointsView,
  resolvePointHistoryStatus,
} from "./validation";
import {
  PageHeader,
  PointValue,
  SectionHeading,
  TableFrame,
} from "@/components/ui";
import { ExportCsvButton } from "@/components/export-csv-button";
import { ViewTabs } from "@/components/view-tabs";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import {
  groupRankingByBranch,
  groupRankingByPosition,
  type GroupedRankingBranch,
  type GroupedRankingOfficer,
} from "@/lib/points-ranking";

type PointHistorySearchParams = Record<string, string | string[] | undefined>;

const HISTORY_ROW_LIMIT = 500;

export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<PointHistorySearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const admin = canManagePoints(actor);
  const params = await searchParams;
  const periodData = await getAcademicPeriodData();
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  const selectedPeriod = periodSelection.period;
  const periodQuery = Array.isArray(params.period)
    ? params.period[0]
    : params.period;
  const view = resolvePointsView(params);
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

  const supabase = await createClient();
  const buildPointHistoryQuery = (
    includeFilters: boolean,
    countOnly = false,
  ) => {
    let history = supabase
      .from("point_history")
      .select("*", countOnly ? { count: "exact", head: true } : undefined);
    if ((!admin || includeFilters) && status === "active")
      history = history.is("removed_at", null);
    if (selectedPeriod)
      history = history
        .gte("activity_date", selectedPeriod.starts_on)
        .lte("activity_date", selectedPeriod.ends_on);
    if (includeFilters && status === "removed")
      history = history.not("removed_at", "is", null);
    if (includeFilters) {
      if (search)
        history = history.filter(
          "search_text",
          "imatch",
          literalSearchPattern(search),
        );
      if (awardType) history = history.eq("award_type", awardType);
      if (officerId !== undefined)
        history = history.eq("officer_id", officerId);
      if (eventId !== undefined) history = history.eq("event_id", eventId);
      if (!dateRangeIsReversed && fromDate)
        history = history.gte("activity_date", fromDate);
      if (!dateRangeIsReversed && toDate)
        history = history.lte("activity_date", toDate);
    }
    return history;
  };

  const currentFilterSearch = new URLSearchParams();
  currentFilterSearch.set("view", "history");
  if (periodQuery) currentFilterSearch.set("period", periodQuery);
  if (search) currentFilterSearch.set("q", search);
  if (awardType) currentFilterSearch.set("type", awardType);
  if (officerId !== undefined)
    currentFilterSearch.set("officer", String(officerId));
  if (eventId !== undefined) currentFilterSearch.set("event", String(eventId));
  if (admin && status !== "active") currentFilterSearch.set("status", status);
  if (fromDate) currentFilterSearch.set("from", fromDate);
  if (toDate) currentFilterSearch.set("to", toDate);

  const isRankingView =
    view === "overview" || view === "branch" || view === "position";
  const needsGroupMetadata = view === "branch" || view === "position";
  const canAddAdjustment =
    admin &&
    !periodSelection.isHistorical &&
    (selectedPeriod === null ||
      selectedPeriod.id === periodData.currentPeriodId);
  const [overviewData, historyData, historyAdjustmentContext] =
    await Promise.all([
      isRankingView ? loadOverviewData() : Promise.resolve(null),
      view === "history" ? loadHistoryData() : Promise.resolve(null),
      view === "history" && canAddAdjustment
        ? loadAdjustmentContext()
        : Promise.resolve(null),
    ]);

  async function loadAdjustmentContext() {
    const [activeOfficers, recentEvents, recentTasks] = await Promise.all([
      supabase
        .from("officers")
        .select("id,name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("events")
        .select("id,name,event_date")
        .is("deleted_at", null)
        .order("event_date", { ascending: false })
        .limit(5),
      supabase
        .from("tasks")
        .select("id,title,due_date")
        .is("removed_at", null)
        .order("due_date", { ascending: false }),
    ]);
    if (activeOfficers.error || recentEvents.error || recentTasks.error)
      throw new Error("Failed to load adjustment options");
    return {
      officers: activeOfficers.data ?? [],
      events: recentEvents.data ?? [],
      tasks: recentTasks.data ?? [],
    };
  }

  async function loadOverviewData() {
    const officerSelect = needsGroupMetadata
      ? "id,name,position_id,positions(id,name),officer_branches(branch_id,branches(id,name,color))"
      : "id,name";
    const [activeOfficers, recentEvents, recentTasks, periodPoints] =
      await Promise.all([
        supabase
          .from("officers")
          .select(officerSelect)
          .eq("status", "active")
          .order("name"),
        admin
          ? supabase
              .from("events")
              .select("id,name,event_date")
              .is("deleted_at", null)
              .order("event_date", { ascending: false })
              .limit(5)
          : Promise.resolve(null),
        admin
          ? supabase
              .from("tasks")
              .select("id,title,due_date")
              .is("removed_at", null)
              .order("due_date", { ascending: false })
          : Promise.resolve(null),
        selectedPeriod
          ? supabase
              .rpc("academic_period_point_summary", {
                p_period_id: selectedPeriod.id,
              })
              .single()
          : Promise.resolve({ data: null, error: null }),
      ]);
    if (
      activeOfficers.error ||
      recentEvents?.error ||
      recentTasks?.error ||
      periodPoints.error
    )
      throw new Error("Failed to load points");

    type OfficerRow = {
      id: number;
      name: string;
      position_id?: number | null;
      positions?: { id: number; name: string } | null;
      officer_branches?: Array<{
        branch_id: number;
        branches: { id: number; name: string; color?: string | null } | null;
      }>;
    };

    const officerList = (activeOfficers.data ?? []) as unknown as OfficerRow[];
    const officerById = new Map(
      officerList.map((officer) => [officer.id, officer]),
    );
    const ranking = selectedPeriod
      ? (
          periodPoints.data!.ranking as Array<{
            officer_id: number;
            officer_name: string;
            points: number;
            normal_points: number;
            negative_points: number;
          }>
        )
          .filter((row) => officerById.has(row.officer_id))
          .map((row): GroupedRankingOfficer => {
            const meta = officerById.get(row.officer_id);
            const branches: GroupedRankingBranch[] = (
              meta?.officer_branches ?? []
            )
              .map((membership) => membership.branches)
              .filter(
                (
                  branch,
                ): branch is {
                  id: number;
                  name: string;
                  color?: string | null;
                } => Boolean(branch),
              );
            return {
              id: row.officer_id,
              name: row.officer_name,
              total_points: row.points,
              normal_points: row.normal_points,
              negative_points: row.negative_points,
              positionId: meta?.positions?.id ?? meta?.position_id ?? null,
              positionName: meta?.positions?.name ?? "Unassigned",
              branches,
            };
          })
      : [];

    return {
      activeOfficers: {
        data: officerList.map((o) => ({ id: o.id, name: o.name })),
      },
      recentEvents,
      recentTasks,
      totals: { data: ranking, count: ranking.length },
    };
  }

  async function loadHistoryData() {
    const visibleHistoryCount = await buildPointHistoryQuery(false, true);
    if (visibleHistoryCount.error) throw new Error("Failed to load points");

    const transactions = await buildPointHistoryQuery(true)
      .order("activity_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(HISTORY_ROW_LIMIT + 1);
    if (transactions.error) throw new Error("Failed to load points");

    const rawRows = transactions.data ?? [];
    const truncated = rawRows.length > HISTORY_ROW_LIMIT;
    const rows = truncated ? rawRows.slice(0, HISTORY_ROW_LIMIT) : rawRows;

    const emptyMessage =
      (visibleHistoryCount.count ?? 0) > 0
        ? "No point transactions match these filters."
        : status === "active"
          ? "No active point transactions yet."
          : status === "removed"
            ? "No removed point transactions."
            : "No point transactions yet.";

    return {
      rows,
      truncated,
      emptyMessage,
    };
  }

  const myRankingIndex = overviewData
    ? overviewData.totals.data.findIndex((row) => row.id === actor.id)
    : -1;
  const myRankingRow =
    overviewData && myRankingIndex >= 0
      ? overviewData.totals.data[myRankingIndex]
      : null;

  const groupedViewData =
    overviewData && (view === "branch" || view === "position")
      ? view === "branch"
        ? groupRankingByBranch(overviewData.totals.data)
        : groupRankingByPosition(overviewData.totals.data)
      : null;

  const officerTotals = overviewData ? (
    <section
      aria-label={
        view === "branch"
          ? "Officer ranking by branch"
          : view === "position"
            ? "Officer ranking by position"
            : "Officer ranking"
      }
      className="space-y-3"
    >
      <SectionHeading
        title={
          view === "branch"
            ? "Points by branch"
            : view === "position"
              ? "Points by position"
              : "Officer ranking"
        }
        description={
          selectedPeriod
            ? `${overviewData.totals.count ?? 0} active officer${overviewData.totals.count === 1 ? "" : "s"} · ${selectedPeriod.name}`
            : "Select an academic period to see ranked points."
        }
        action={
          view === "overview" ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {myRankingRow && (
                <a
                  href="#my-rank"
                  className="inline-flex items-center gap-2 rounded-md border border-brand-border bg-brand-bg px-3 py-1.5 text-xs font-medium text-foreground hover:opacity-90"
                >
                  <span className="text-muted">Your rank</span>
                  <strong className="tabular-nums text-brand">
                    #{myRankingIndex + 1}
                  </strong>
                  <span aria-hidden="true" className="text-muted">
                    ·
                  </span>
                  <PointValue value={myRankingRow.total_points ?? 0} />
                </a>
              )}
              <ExportCsvButton
                href={
                  periodQuery
                    ? `/api/exports/points/leaderboard?period=${encodeURIComponent(periodQuery)}`
                    : "/api/exports/points/leaderboard"
                }
                label="Export leaderboard CSV"
                emptyMessage="No matching officers to export for this period."
              />
            </div>
          ) : undefined
        }
      />
      {selectedPeriod && overviewData.totals.data.length > 0 ? (
        view === "overview" ? (
          <PointsRankingTableClient
            rows={overviewData.totals.data}
            actorId={actor.id}
            periodQuery={periodQuery}
          />
        ) : (
          <GroupedPointsRankingClient
            mode={view === "branch" ? "branch" : "position"}
            groups={groupedViewData ?? []}
            actorId={actor.id}
            periodQuery={periodQuery}
            periodName={selectedPeriod.name}
          />
        )
      ) : (
        <p className="points-ranking-empty" role="status">
          {selectedPeriod
            ? "No active Officers have earned Points in this period yet."
            : "No period selected. Choose an academic period from the header."}
        </p>
      )}
    </section>
  ) : null;

  const historyReturnTo = `/points?${currentFilterSearch.toString()}` as Route;

  return (
    <div data-page-width="wide" data-nav-page="points" className="space-y-6">
      <PageHeader
        title="Points"
        description="Event participation earns 2 Points per hour for Volunteers and 1 for Attendees."
        action={
          canAddAdjustment && isRankingView ? (
            <TransactionForm
              officers={overviewData!.activeOfficers.data}
              events={overviewData!.recentEvents!.data}
              tasks={overviewData!.recentTasks!.data}
            />
          ) : canAddAdjustment && historyAdjustmentContext ? (
            <TransactionForm
              officers={historyAdjustmentContext.officers}
              events={historyAdjustmentContext.events}
              tasks={historyAdjustmentContext.tasks}
            />
          ) : undefined
        }
      />
      <ViewTabs
        label="Points views"
        className="points-view-tabs border-b border-border"
        items={[
          {
            key: "overview",
            label: "Overview",
            href: withPeriodParam("/points", periodQuery),
            active: view === "overview",
          },
          {
            key: "branch",
            label: "By branch",
            href: withPeriodParam("/points?view=branch", periodQuery),
            active: view === "branch",
          },
          {
            key: "position",
            label: "By position",
            href: withPeriodParam("/points?view=position", periodQuery),
            active: view === "position",
          },
          {
            key: "history",
            label: "History",
            href: withPeriodParam("/points?view=history", periodQuery),
            active: view === "history",
          },
        ]}
      />
      {isRankingView ? (
        <div>{officerTotals}</div>
      ) : (
        <section className="min-w-0 space-y-4">
          <SectionHeading
            title="Point history"
            description="Search by Officer, reason, Event, or Task. Filter by award type, date range, and history status."
            action={
              <ExportCsvButton
                href={`/api/exports/points/history?${currentFilterSearch.toString()}`}
                label="Export history CSV"
                emptyMessage="No matching point transactions to export."
              />
            }
          />
          <PointHistoryFilterControls
            isAdmin={admin}
            status={status}
            searchQuery={search}
            awardType={awardType}
            fromDate={fromDate}
            toDate={toDate}
            dateRangeIsReversed={dateRangeIsReversed}
            hasActiveFilters={currentFilterSearch.size > 1}
            period={params.period}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
            <span className="tabular-nums">
              {historyData!.rows.length}
              {historyData!.truncated ? "+" : ""}{" "}
              {historyData!.rows.length === 1 ? "transaction" : "transactions"}
            </span>
            {historyData!.rows.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Filtered net:{" "}
                  <PointValue
                    value={
                      Math.round(
                        historyData!.rows.reduce(
                          (sum, row) => sum + Number(row.points ?? 0),
                          0,
                        ) * 100,
                      ) / 100
                    }
                  />{" "}
                  pts
                </span>
              </>
            )}
            {historyData!.truncated && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Showing latest {HISTORY_ROW_LIMIT}. Narrow filters to view
                  older entries.
                </span>
              </>
            )}
          </div>
          <TableFrame compact label="Point history">
            <HistoryTable
              returnTo={historyReturnTo}
              transactions={historyData!.rows}
              isAdmin={admin}
              canMutate={
                admin &&
                !periodSelection.isHistorical &&
                (selectedPeriod === null ||
                  selectedPeriod.id === periodData.currentPeriodId)
              }
              emptyMessage={historyData!.emptyMessage}
            />
          </TableFrame>
        </section>
      )}
    </div>
  );
}
