import { getAuthorizationContext, canManagePoints } from "@/lib/authorization";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Route } from "next";
import TransactionForm from "./transaction-form";
import HistoryTable from "./history-table";
import { ListPagination } from "@/components/list-pagination";
import PointHistoryFilterControls from "./history-filters";
import { listPageUrl } from "@/lib/list-url";
import { literalSearchPattern } from "@/lib/list-search";
import {
  pointHistoryFiltersSchema,
  resolvePointsView,
  resolvePointHistoryStatus,
} from "./validation";
import {
  NegativePointValue,
  PageHeader,
  PointValue,
  SectionHeading,
  TableFrame,
} from "@/components/ui";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";

const POINT_HISTORY_PAGE_SIZE = 8;
type PointHistorySearchParams = Record<string, string | string[] | undefined>;

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
    page: requestedPage,
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
  if (params.period !== undefined)
    currentFilterSearch.set("period", String(params.period));
  if (search) currentFilterSearch.set("q", search);
  if (awardType) currentFilterSearch.set("type", awardType);
  if (officerId !== undefined)
    currentFilterSearch.set("officer", String(officerId));
  if (eventId !== undefined) currentFilterSearch.set("event", String(eventId));
  if (admin && status !== "active") currentFilterSearch.set("status", status);
  if (fromDate) currentFilterSearch.set("from", fromDate);
  if (toDate) currentFilterSearch.set("to", toDate);

  const overviewData = view === "overview" ? await loadOverviewData() : null;
  const historyData = view === "history" ? await loadHistoryData() : null;

  async function loadOverviewData() {
    const [activeOfficers, recentEvents, recentTasks, periodPoints] =
      await Promise.all([
        supabase
          .from("officers")
          .select("id,name")
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
    const activeOfficerIds = new Set(
      (activeOfficers.data ?? []).map((officer) => officer.id),
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
          .map((row) => ({
            id: row.officer_id,
            name: row.officer_name,
            total_points: row.points,
            normal_points: row.normal_points,
            negative_points: row.negative_points,
          }))
          .filter((officer) => activeOfficerIds.has(officer.id))
      : [];

    return {
      activeOfficers,
      recentEvents,
      recentTasks,
      totals: { data: ranking, count: ranking.length },
      rankingTotalPages: 1,
      rankPage: 1,
    };
  }

  async function loadHistoryData() {
    const [historyCount, visibleHistoryCount] = await Promise.all([
      buildPointHistoryQuery(true, true),
      buildPointHistoryQuery(false, true),
    ]);
    if (historyCount.error || visibleHistoryCount.error)
      throw new Error("Failed to load points");

    const totalPages = Math.max(
      1,
      Math.ceil((historyCount.count ?? 0) / POINT_HISTORY_PAGE_SIZE),
    );
    const page = Math.min(requestedPage, totalPages);
    if (page !== requestedPage)
      redirect(listPageUrl("/points", currentFilterSearch, page));

    const transactions = await buildPointHistoryQuery(true)
      .order("activity_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(
        (page - 1) * POINT_HISTORY_PAGE_SIZE,
        page * POINT_HISTORY_PAGE_SIZE - 1,
      );
    if (transactions.error) throw new Error("Failed to load points");

    const emptyMessage =
      (visibleHistoryCount.count ?? 0) > 0
        ? "No point transactions match these filters."
        : status === "active"
          ? "No active point transactions yet."
          : status === "removed"
            ? "No removed point transactions."
            : "No point transactions yet.";

    return {
      historyCount,
      totalPages,
      page,
      transactions,
      emptyMessage,
    };
  }

  const officerTotals = overviewData ? (
    <section aria-label="Officer ranking">
      <SectionHeading
        title="Officer ranking"
        description={
          selectedPeriod
            ? `${overviewData.totals.count ?? 0} active officer${overviewData.totals.count === 1 ? "" : "s"} · ${selectedPeriod.name}`
            : "Select an academic period to see ranked points."
        }
      />
      {selectedPeriod && overviewData.totals.data.length > 0 ? (
        <div className="points-ranking-wrap">
          <TableFrame label="Officer ranking" compact>
            <table className="points-ranking-table">
              <colgroup>
                <col className="w-12" />
                <col />
                <col className="w-44" />
                <col className="w-44" />
                <col className="w-44" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Officer</th>
                  <th scope="col" className="text-right">
                    Normal Points
                  </th>
                  <th scope="col" className="text-right">
                    Negative Points
                  </th>
                  <th scope="col" className="text-right">
                    Overall Points
                  </th>
                </tr>
              </thead>
              <tbody>
                {overviewData.totals.data.map((officer, index) => {
                  const points = officer.total_points ?? 0;
                  return (
                    <tr key={officer.id}>
                      <td>
                        <span className="tabular-nums text-muted">
                          {index + 1}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="points-officer-link"
                          href={`/officers/${officer.id}${params.period ? `?period=${params.period}` : ""}`}
                        >
                          {officer.name}
                        </Link>
                      </td>
                      <td className="points-total text-right">
                        <PointValue value={officer.normal_points ?? 0} />
                      </td>
                      <td className="points-total text-right text-red-700">
                        <NegativePointValue
                          value={officer.negative_points ?? 0}
                        />
                      </td>
                      <td className="points-total text-right">
                        <PointValue value={points} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableFrame>
        </div>
      ) : (
        <p className="points-ranking-empty" role="status">
          {selectedPeriod
            ? "No active Officers have earned Points in this period yet."
            : "No period selected. Choose an academic period from the header."}
        </p>
      )}
    </section>
  ) : null;

  function rankingPageUrl(targetPage: number): Route<"/points"> {
    const search = new URLSearchParams();
    if (params.period !== undefined)
      search.set("period", String(params.period));
    if (targetPage > 1) search.set("rankPage", String(targetPage));
    const query = search.toString();
    return (query ? `/points?${query}` : "/points") as Route<"/points">;
  }

  return (
    <div data-page-width="wide" data-nav-page="points" className="space-y-6">
      <PageHeader
        title="Points"
        description="Event participation earns 2 Points per hour for Volunteers and 1 for Attendees."
        action={
          view === "overview" &&
          admin &&
          !periodSelection.isHistorical &&
          (selectedPeriod === null ||
            selectedPeriod.id === periodData.currentPeriodId) ? (
            <TransactionForm
              officers={overviewData!.activeOfficers.data}
              events={overviewData!.recentEvents!.data}
              tasks={overviewData!.recentTasks!.data}
            />
          ) : undefined
        }
      />
      <nav
        aria-label="Points views"
        className="points-view-tabs flex gap-5 border-b border-border"
      >
        <Link
          href={rankingPageUrl(1)}
          aria-current={view === "overview" ? "page" : undefined}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${view === "overview" ? "border-brand text-brand" : "border-transparent text-secondary hover:text-foreground"}`}
        >
          Overview
        </Link>
        <Link
          href={
            `/points?${new URLSearchParams({ ...(params.period === undefined ? {} : { period: String(params.period) }), view: "history" })}` as Route
          }
          aria-current={view === "history" ? "page" : undefined}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${view === "history" ? "border-brand text-brand" : "border-transparent text-secondary hover:text-foreground"}`}
        >
          History
        </Link>
      </nav>
      {view === "overview" && admin && periodSelection.isHistorical && (
        <p className="points-readonly-note">
          This academic period is read-only.
        </p>
      )}
      {view === "overview" ? (
        <div>{officerTotals}</div>
      ) : (
        <section className="min-w-0 space-y-4">
          <SectionHeading
            title="Point history"
            description="Search by Officer, reason, Event, or Task. Filter by award type and, for Admins, history status."
          />
          <PointHistoryFilterControls
            isAdmin={admin}
            status={status}
            searchQuery={search}
            awardType={awardType}
            hasActiveFilters={currentFilterSearch.size > 1}
            period={params.period}
          />
          <TableFrame compact label="Point history">
            <HistoryTable
              returnTo={listPageUrl(
                "/points",
                currentFilterSearch,
                historyData!.page,
              )}
              transactions={historyData!.transactions.data}
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
          <ListPagination
            pathname="/points"
            label="Point history"
            filters={currentFilterSearch}
            page={historyData!.page}
            totalPages={historyData!.totalPages}
            totalCount={historyData!.historyCount.count ?? 0}
            countLabel="transactions"
          />
        </section>
      )}
    </div>
  );
}
