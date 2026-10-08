import { getAuthorizationContext, canManagePoints } from "@/lib/authorization";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TransactionForm from "./transaction-form";
import HistoryTable from "./history-table";
import PointHistoryFilterControls from "./history-filters";
import RateForm from "./rate-form";
import { listPageUrl } from "@/lib/list-url";
import { literalSearchPattern } from "@/lib/list-search";
import {
  pointHistoryFiltersSchema,
  resolvePointHistoryStatus,
} from "./validation";
import {
  PageHeader,
  PointValue,
  SectionHeading,
  TableFrame,
} from "@/components/ui";

const POINT_HISTORY_PAGE_SIZE = 25;
type PointHistorySearchParams = Record<string, string | string[] | undefined>;

export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<PointHistorySearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const admin = canManagePoints(actor);
  const params = await searchParams;
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
  if (search) currentFilterSearch.set("q", search);
  if (awardType) currentFilterSearch.set("type", awardType);
  if (officerId !== undefined)
    currentFilterSearch.set("officer", String(officerId));
  if (eventId !== undefined) currentFilterSearch.set("event", String(eventId));
  if (admin && status !== "active") currentFilterSearch.set("status", status);
  if (fromDate) currentFilterSearch.set("from", fromDate);
  if (toDate) currentFilterSearch.set("to", toDate);

  const [
    historyCount,
    visibleHistoryCount,
    officers,
    activeOfficers,
    events,
    recentEvents,
    configuration,
  ] = await Promise.all([
    buildPointHistoryQuery(true, true),
    buildPointHistoryQuery(false, true),
    supabase.from("officers").select("id,name,status").order("name"),
    supabase
      .from("officers")
      .select("id,name")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("events")
      .select("id,name,event_date")
      .order("event_date", { ascending: false }),
    supabase
      .from("events")
      .select("id,name,event_date")
      .is("deleted_at", null)
      .order("event_date", { ascending: false })
      .limit(5),
    supabase
      .from("application_config")
      .select("participation_points_per_hour")
      .eq("id", 1)
      .single(),
  ]);
  if (
    historyCount.error ||
    visibleHistoryCount.error ||
    officers.error ||
    activeOfficers.error ||
    events.error ||
    recentEvents.error ||
    configuration.error
  )
    throw new Error("Failed to load points");

  const totals = await supabase
    .from("officer_point_totals")
    .select("*")
    .in(
      "id",
      activeOfficers.data.map((officer) => officer.id),
    )
    .order("total_points", { ascending: false })
    .order("name", { ascending: true });
  if (totals.error) throw new Error("Failed to load officer point totals");

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

  const historyEmptyMessage =
    (visibleHistoryCount.count ?? 0) > 0
      ? "No point transactions match these filters."
      : status === "active"
        ? "No active point transactions yet."
        : status === "removed"
          ? "No removed point transactions."
          : "No point transactions yet.";

  return (
    <div data-page-width="wide" className="space-y-6">
      <PageHeader
        title="Points"
        description="Finished events receive participation awards automatically from the scheduled database processor."
      />
      <section className="space-y-2">
        <SectionHeading title="Point configuration" />
        <p>
          Current participation rate:{" "}
          {configuration.data.participation_points_per_hour} points/hour
        </p>
        {admin && (
          <RateForm rate={configuration.data.participation_points_per_hour} />
        )}
      </section>
      <section>
        <SectionHeading title="Officer totals" />
        <TableFrame compact>
          <table>
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
              {totals.data.map((officer, index) => (
                <tr key={officer.id}>
                  <td className="w-20 tabular-nums text-muted">{index + 1}</td>
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
        </TableFrame>
      </section>
      {admin && (
        <section>
          <SectionHeading title="Add manual transaction or correction" />
          <div className="rounded-lg border border-border bg-surface/40 p-4 sm:p-5">
            <TransactionForm
              officers={activeOfficers.data}
              events={recentEvents.data}
            />
          </div>
        </section>
      )}
      <section className="space-y-4">
        <SectionHeading
          title="Point history"
          description="Search and filter all transactions, 25 per page."
        />
        <PointHistoryFilterControls
          officers={officers.data}
          events={events.data}
          isAdmin={admin}
          status={status}
          fromDate={fromDate ?? ""}
          toDate={toDate ?? ""}
          searchQuery={search}
          awardType={awardType}
          officerId={officerId}
          eventId={eventId}
        />
        {dateRangeIsReversed && (
          <p role="status">Choose a From date on or before the To date.</p>
        )}
        <TableFrame compact>
          <HistoryTable
            returnTo={listPageUrl("/points", currentFilterSearch, page)}
            transactions={transactions.data}
            isAdmin={admin}
            emptyMessage={historyEmptyMessage}
          />
        </TableFrame>
        <nav
          aria-label="Point history pages"
          className="flex flex-wrap items-center gap-4 text-sm"
        >
          {page > 1 && (
            <Link href={listPageUrl("/points", currentFilterSearch, page - 1)}>
              Previous
            </Link>
          )}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={listPageUrl("/points", currentFilterSearch, page + 1)}>
              Next
            </Link>
          )}
        </nav>
      </section>
    </div>
  );
}
