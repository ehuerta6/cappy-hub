import { getAuthorizationContext, canManagePoints } from "@/lib/authorization";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Route } from "next";
import TransactionForm from "./transaction-form";
import HistoryTable from "./history-table";
import { ListPagination } from "@/components/list-pagination";
import PointHistoryFilterControls from "./history-filters";
import RateForm from "./rate-form";
import { listPageUrl } from "@/lib/list-url";
import { literalSearchPattern } from "@/lib/list-search";
import {
  pointHistoryFiltersSchema,
  parsePointRankingPage,
  resolvePointsView,
  resolvePointHistoryStatus,
} from "./validation";
import {
  PageHeader,
  PointValue,
  SectionHeading,
  TableFrame,
} from "@/components/ui";

const POINT_HISTORY_PAGE_SIZE = 8;
const OFFICER_RANKING_PAGE_SIZE = 8;
type PointHistorySearchParams = Record<string, string | string[] | undefined>;

export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<PointHistorySearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const admin = canManagePoints(actor);
  const params = await searchParams;
  const view = resolvePointsView(params);
  const requestedRankPage = parsePointRankingPage(params.rankPage);
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
    const [activeOfficers, configuration, recentEvents] = await Promise.all([
      supabase
        .from("officers")
        .select("id,name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("application_config")
        .select("participation_points_per_hour")
        .eq("id", 1)
        .single(),
      admin
        ? supabase
            .from("events")
            .select("id,name,event_date")
            .is("deleted_at", null)
            .order("event_date", { ascending: false })
            .limit(5)
        : Promise.resolve(null),
    ]);
    if (activeOfficers.error || configuration.error || recentEvents?.error)
      throw new Error("Failed to load points");

    const totals = await supabase
      .from("officer_point_totals")
      .select("*", { count: "exact" })
      .in(
        "id",
        activeOfficers.data.map((officer) => officer.id),
      )
      .order("total_points", { ascending: false })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(
        (requestedRankPage - 1) * OFFICER_RANKING_PAGE_SIZE,
        requestedRankPage * OFFICER_RANKING_PAGE_SIZE - 1,
      );
    if (totals.error) throw new Error("Failed to load officer point totals");

    const rankingTotalPages = Math.max(
      1,
      Math.ceil((totals.count ?? 0) / OFFICER_RANKING_PAGE_SIZE),
    );
    const rankPage = Math.min(requestedRankPage, rankingTotalPages);
    if (rankPage !== requestedRankPage) {
      const search = new URLSearchParams();
      if (rankPage > 1) search.set("rankPage", String(rankPage));
      const query = search.toString();
      redirect(query ? `/points?${query}` : "/points");
    }

    return {
      activeOfficers,
      configuration,
      recentEvents,
      totals,
      rankingTotalPages,
      rankPage,
    };
  }

  async function loadHistoryData() {
    const [historyCount, visibleHistoryCount, officers, events] =
      await Promise.all([
        buildPointHistoryQuery(true, true),
        buildPointHistoryQuery(false, true),
        supabase.from("officers").select("id,name,status").order("name"),
        supabase
          .from("events")
          .select("id,name,event_date")
          .order("event_date", { ascending: false }),
      ]);
    if (
      historyCount.error ||
      visibleHistoryCount.error ||
      officers.error ||
      events.error
    )
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
      officers,
      events,
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
                <td className="w-20 tabular-nums text-muted">
                  {(overviewData!.rankPage - 1) * OFFICER_RANKING_PAGE_SIZE +
                    index +
                    1}
                </td>
                <td>
                  <Link href={`/officers/${officer.id}`}>{officer.name}</Link>
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
          href="/points?view=history"
          aria-current={view === "history" ? "page" : undefined}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${view === "history" ? "border-foreground text-foreground" : "border-transparent text-secondary hover:text-foreground"}`}
        >
          History
        </Link>
      </nav>
      {view === "overview" ? (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          {officerTotals}
          <section className="min-w-0 space-y-3">
            <SectionHeading
              title={admin ? "Point configuration" : "Participation rate"}
            />
            <p>
              Current participation rate:{" "}
              {overviewData!.configuration.data.participation_points_per_hour}{" "}
              points/hour
            </p>
            {admin && (
              <>
                <RateForm
                  rate={
                    overviewData!.configuration.data
                      .participation_points_per_hour
                  }
                />
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
            description="Search and filter all transactions, 8 per page."
          />
          <PointHistoryFilterControls
            officers={historyData!.officers.data}
            events={historyData!.events.data}
            isAdmin={admin}
            status={status}
            fromDate={fromDate ?? ""}
            toDate={toDate ?? ""}
            searchQuery={search}
            awardType={awardType}
            officerId={officerId}
            eventId={eventId}
            dateRangeIsReversed={dateRangeIsReversed}
          />
          {dateRangeIsReversed && (
            <p id="point-history-date-error" role="alert">
              Choose a From date on or before the To date.
            </p>
          )}
          <TableFrame compact label="Point history">
            <HistoryTable
              returnTo={listPageUrl(
                "/points",
                currentFilterSearch,
                historyData!.page,
              )}
              transactions={historyData!.transactions.data}
              isAdmin={admin}
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
