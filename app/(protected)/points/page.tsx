import { getAuthorizationContext, canManagePoints } from "@/lib/authorization";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TransactionForm from "./transaction-form";
import HistoryTable from "./history-table";
import PointHistoryFilterControls from "./history-filters";
import RateForm from "./rate-form";
import { pointHistoryUrl } from "./history-url";
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

const PAGE_SIZE = 25;
type Params = Record<string, string | string[] | undefined>;

export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const actor = await getAuthorizationContext();
  const admin = canManagePoints(actor);
  const params = await searchParams;
  const rawPointHistoryFilters = pointHistoryFiltersSchema.safeParse(params);
  const validatedPointHistoryFilters = rawPointHistoryFilters.success
    ? rawPointHistoryFilters.data
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
  } = validatedPointHistoryFilters;
  const status = resolvePointHistoryStatus(
    validatedPointHistoryFilters.status,
    admin,
  );

  const supabase = await createClient();
  const buildPointHistoryQuery = (selectOptions?: {
    count: "exact";
    head: true;
  }) => {
    let history = supabase.from("point_history").select("*", selectOptions);
    if (status === "active") history = history.is("removed_at", null);
    if (status === "removed") history = history.not("removed_at", "is", null);
    if (search) {
      const literal = search.replace(/[\\%_]/g, "\\$&");
      history = history.ilike("search_text", `%${literal}%`);
    }
    if (awardType) history = history.eq("award_type", awardType);
    if (officerId !== undefined) history = history.eq("officer_id", officerId);
    if (eventId !== undefined) history = history.eq("event_id", eventId);
    if (!dateRangeIsReversed && fromDate)
      history = history.gte("activity_date", fromDate);
    if (!dateRangeIsReversed && toDate)
      history = history.lte("activity_date", toDate);
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

  const [historyCount, totals, officers, events, recentEvents, configuration] =
    await Promise.all([
      buildPointHistoryQuery({ count: "exact", head: true }),
      supabase.from("officer_point_totals").select("*").order("name"),
      supabase.from("officers").select("id,name").order("name"),
      supabase
        .from("events")
        .select("id,name,event_date")
        .order("event_date", { ascending: false }),
      supabase
        .from("events")
        .select("id,name")
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
    totals.error ||
    officers.error ||
    events.error ||
    recentEvents.error ||
    configuration.error
  )
    throw new Error("Failed to load points");

  const totalPages = Math.max(
    1,
    Math.ceil((historyCount.count ?? 0) / PAGE_SIZE),
  );
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage)
    redirect(
      pointHistoryUrl("/points", currentFilterSearch.toString(), {}, page),
    );

  const transactions = await buildPointHistoryQuery()
    .order("activity_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (transactions.error) throw new Error("Failed to load points");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Points"
        description="Finished events receive participation awards automatically from the scheduled database processor."
      />
      <section className="space-y-3">
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
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th>Officer</th>
                <th>Total points</th>
              </tr>
            </thead>
            <tbody>
              {totals.data.map((officer) => (
                <tr key={officer.id}>
                  <td>
                    <Link href={`/officers/${officer.id}`}>{officer.name}</Link>
                  </td>
                  <td>
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
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
            <TransactionForm
              officers={officers.data}
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
          key={search}
          officers={officers.data}
          events={events.data}
          isAdmin={admin}
          status={status}
          fromDate={fromDate ?? ""}
          toDate={toDate ?? ""}
          searchQuery={search}
        />
        {dateRangeIsReversed && (
          <p role="status">Choose a From date on or before the To date.</p>
        )}
        <TableFrame>
          <HistoryTable transactions={transactions.data} isAdmin={admin} />
        </TableFrame>
        <nav
          aria-label="Point history pages"
          className="flex items-center gap-4 text-sm"
        >
          {page > 1 && (
            <Link
              href={pointHistoryUrl(
                "/points",
                currentFilterSearch.toString(),
                {},
                page - 1,
              )}
            >
              Previous
            </Link>
          )}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pointHistoryUrl(
                "/points",
                currentFilterSearch.toString(),
                {},
                page + 1,
              )}
            >
              Next
            </Link>
          )}
        </nav>
      </section>
    </div>
  );
}
