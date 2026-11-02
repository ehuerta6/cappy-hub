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
    const [activeOfficers, recentEvents, periodPoints] = await Promise.all([
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
      selectedPeriod
        ? supabase
            .from("point_history")
            .select("officer_id,officer_name,points")
            .gte("activity_date", selectedPeriod.starts_on)
            .lte("activity_date", selectedPeriod.ends_on)
            .is("removed_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (activeOfficers.error || recentEvents?.error || periodPoints.error)
      throw new Error("Failed to load points");
    const byOfficer = new Map<
      number,
      { id: number; name: string; total_points: number }
    >();
    for (const point of periodPoints.data) {
      if (point.officer_id === null || point.officer_name === null) continue;
      const row = byOfficer.get(point.officer_id) ?? {
        id: point.officer_id,
        name: point.officer_name,
        total_points: 0,
      };
      row.total_points += point.points ?? 0;
      byOfficer.set(point.officer_id, row);
    }
    const ranking = [...byOfficer.values()].sort(
      (left, right) =>
        right.total_points - left.total_points ||
        left.name.localeCompare(right.name),
    );

    return {
      activeOfficers,
      recentEvents,
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
    <section className="min-w-0">
      <SectionHeading title="Officer ranking" />
      <div className="rounded-lg border border-border">
        <table className="w-full min-w-0 table-fixed">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Officer</th>
              <th scope="col" className="text-right">
                Total points
              </th>
            </tr>
          </thead>
          <tbody>
            {overviewData!.totals.data.map((officer, index) => (
              <tr key={officer.id}>
                <td className="w-20 tabular-nums text-muted">{index + 1}</td>
                <td>
                  <Link
                    href={`/officers/${officer.id}${params.period ? `?period=${params.period}` : ""}`}
                  >
                    {officer.name}
                  </Link>
                </td>
                <td className="text-right">
                  <PointValue value={officer.total_points ?? 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-3">
        <ListPagination
          pathname="/points"
          label="Officer ranking"
          filters={new URLSearchParams()}
          page={overviewData!.rankPage}
          totalPages={overviewData!.rankingTotalPages}
          totalCount={overviewData!.totals.count ?? 0}
          countLabel="officers"
          pageParam="rankPage"
        />
      </div>
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
    <div data-page-width="wide" className="space-y-6">
      <PageHeader
        title="Points"
        description="Finished events receive participation awards automatically from the scheduled database processor."
      />
      <nav
        aria-label="Points views"
        className="flex gap-5 border-b border-border"
      >
        <Link
          href={rankingPageUrl(1)}
          aria-current={view === "overview" ? "page" : undefined}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${view === "overview" ? "border-foreground text-foreground" : "border-transparent text-secondary hover:text-foreground"}`}
        >
          Overview
        </Link>
        <Link
          href={
            `/points?${new URLSearchParams({ ...(params.period === undefined ? {} : { period: String(params.period) }), view: "history" })}` as Route
          }
          aria-current={view === "history" ? "page" : undefined}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${view === "history" ? "border-foreground text-foreground" : "border-transparent text-secondary hover:text-foreground"}`}
        >
          History
        </Link>
      </nav>
      {view === "overview" ? (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          {selectedPeriod ? (
            officerTotals
          ) : (
            <p className="text-sm text-muted">
              No period selected. Choose an academic period to see its ranking.
            </p>
          )}
          <section className="min-w-0 space-y-3">
            <SectionHeading title="Participation Points" />
            <p>Event participation earns exactly 1 Point per eligible hour.</p>
            {admin &&
              !periodSelection.isHistorical &&
              (selectedPeriod === null ||
                selectedPeriod.id === periodData.currentPeriodId) && (
                <>
                  <TransactionForm
                    officers={overviewData!.activeOfficers.data}
                    events={overviewData!.recentEvents!.data}
                  />
                </>
              )}
          </section>
        </div>
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
