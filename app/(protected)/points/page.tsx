import { getAuthorizationContext, canManagePoints } from "@/lib/authorization";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import TransactionForm from "./transaction-form";
import HistoryTable from "./history-table";
import RateForm from "./rate-form";
import {
  PageHeader,
  PointValue,
  SectionHeading,
  TableFrame,
} from "@/components/ui";

const PAGE_SIZE = 25;
type Params = Record<string, string | string[] | undefined>;
const first = (value: Params[string]) =>
  typeof value === "string" ? value : "";
const positiveId = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export default async function PointsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const actor = await getAuthorizationContext();
  await connection();
  const admin = canManagePoints(actor);
  const params = await searchParams;
  const search = first(params.q).trim().slice(0, 100);
  const awardType = first(params.type);
  const officerId = positiveId(first(params.officer));
  const eventId = positiveId(first(params.event));
  const requestedStatus = first(params.status);
  const status =
    admin && ["active", "removed", "all"].includes(requestedStatus)
      ? requestedStatus
      : "active";
  const requestedPage = positiveId(first(params.page)) ?? 1;
  const page = Math.min(requestedPage, 100000);

  const supabase = await createClient();
  let history = supabase.from("point_history").select("*", { count: "exact" });
  if (status === "active") history = history.is("removed_at", null);
  if (status === "removed") history = history.not("removed_at", "is", null);
  if (search) {
    const literal = search.replace(/[\\%_]/g, "\\$&");
    history = history.ilike("search_text", `%${literal}%`);
  }
  if (["participation", "manual", "correction"].includes(awardType))
    history = history.eq("award_type", awardType);
  if (officerId) history = history.eq("officer_id", officerId);
  if (eventId) history = history.eq("event_id", eventId);

  const [transactions, totals, officers, events, recentEvents, configuration] =
    await Promise.all([
      history
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
      supabase.from("officer_point_totals").select("*").order("name"),
      supabase.from("officers").select("id,name").order("name"),
      supabase
        .from("events")
        .select("id,name")
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
    transactions.error ||
    totals.error ||
    officers.error ||
    events.error ||
    recentEvents.error ||
    configuration.error
  )
    throw new Error("Failed to load points");

  const totalPages = Math.max(
    1,
    Math.ceil((transactions.count ?? 0) / PAGE_SIZE),
  );
  const pageUrl = (nextPage: number) => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (["participation", "manual", "correction"].includes(awardType))
      next.set("type", awardType);
    if (officerId) next.set("officer", String(officerId));
    if (eventId) next.set("event", String(eventId));
    if (admin && status !== "active") next.set("status", status);
    next.set("page", String(nextPage));
    return `/points?${next}`;
  };

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
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label>
            Search officer, reason, or event
            <input name="q" type="search" defaultValue={search} />
          </label>
          <label>
            Type
            <select name="type" defaultValue={awardType}>
              <option value="">All types</option>
              <option value="participation">Participation</option>
              <option value="manual">Manual</option>
              <option value="correction">Correction</option>
            </select>
          </label>
          <label>
            Officer
            <select name="officer" defaultValue={officerId ?? ""}>
              <option value="">All officers</option>
              {officers.data.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Event
            <select name="event" defaultValue={eventId ?? ""}>
              <option value="">All events</option>
              {events.data.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </label>
          {admin && (
            <label>
              Status
              <select name="status" defaultValue={status}>
                <option value="active">Active</option>
                <option value="removed">Removed</option>
                <option value="all">All</option>
              </select>
            </label>
          )}
          <button type="submit">Apply filters</button>
        </form>
        <TableFrame>
          <HistoryTable transactions={transactions.data} isAdmin={admin} />
        </TableFrame>
        <nav
          aria-label="Point history pages"
          className="flex items-center gap-4 text-sm"
        >
          {page > 1 && <Link href={pageUrl(page - 1)}>Previous</Link>}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages && <Link href={pageUrl(page + 1)}>Next</Link>}
        </nav>
      </section>
    </div>
  );
}
