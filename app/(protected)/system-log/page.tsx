import { canViewSystemLog, getAuthorizationContext } from "@/lib/authorization";
import { PageHeader, ListFilterBar, TableFrame } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { formatLabel } from "@/lib/presentation";
import { searchOrFilter, literalSearchPattern } from "@/lib/list-search";
import { listPageUrl } from "@/lib/list-url";
import { denverTimestamp } from "@/lib/event-time";
import { systemLogFiltersSchema } from "./filter-validation";
import Link from "next/link";
import { redirect } from "next/navigation";

type AuditDetails =
  Database["public"]["Tables"]["audit_logs"]["Row"]["details"];
type SystemLogSearchParams = Record<string, string | string[] | undefined>;
const SYSTEM_LOG_PAGE_SIZE = 50;

function describeDetails(details: AuditDetails) {
  if (!details || typeof details !== "object" || Array.isArray(details))
    return "View details";
  const values = details as Record<string, AuditDetails>;
  if (values.old_role && values.new_role)
    return `${values.old_role} → ${values.new_role}`;
  if (values.before && values.after) {
    const before = values.before as Record<string, AuditDetails>;
    const after = values.after as Record<string, AuditDetails>;
    const changed = Object.keys(after).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    );
    return changed.length ? `Changed ${changed.join(", ")}` : "View changes";
  }
  if (values.points != null)
    return `${values.points} points for officer #${values.officer_id}`;
  if (values.target_officer_id != null)
    return `Officer #${values.target_officer_id}`;
  if (values.officer_name) return String(values.officer_name);
  if (
    values.after &&
    typeof values.after === "object" &&
    !Array.isArray(values.after)
  ) {
    const after = values.after as Record<string, AuditDetails>;
    if (after.name) return String(after.name);
  }
  if (values.name) return String(values.name);
  return "View details";
}

function nextDate(date: string) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export default async function SystemLogPage({
  searchParams,
}: {
  searchParams: Promise<SystemLogSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  if (!canViewSystemLog(actor)) redirect("/access-denied");

  const params = await searchParams;
  const filters = systemLogFiltersSchema.parse(params);
  const {
    q: search,
    actor: actorFilter,
    action,
    entity,
    from: fromDate,
    to: toDate,
    page: requestedPage,
    dateRangeIsReversed,
  } = filters;
  const supabase = await createClient();
  const fromBoundary =
    !dateRangeIsReversed && fromDate
      ? denverTimestamp(fromDate, "00:00")
      : null;
  const toNextDate = !dateRangeIsReversed && toDate ? nextDate(toDate) : null;
  const toBoundary = toNextDate ? denverTimestamp(toNextDate, "00:00") : null;
  const filterSearch = new URLSearchParams();
  if (search) filterSearch.set("q", search);
  if (actorFilter) filterSearch.set("actor", String(actorFilter));
  if (action) filterSearch.set("action", action);
  if (entity) filterSearch.set("entity", entity);
  if (fromDate) filterSearch.set("from", fromDate);
  if (toDate) filterSearch.set("to", toDate);

  const buildLogQuery = (includeFilters: boolean, countOnly = false) => {
    let query = supabase
      .from("audit_logs")
      .select(
        "id,actor_id,actor_officer_id,action,entity_type,entity_id,details,created_at",
        countOnly ? { count: "exact", head: true } : undefined,
      );
    if (includeFilters) {
      if (search)
        query = query.or(
          searchOrFilter(search, ["action", "entity_type", "entity_id"]),
        );
      if (actorFilter === "system")
        query = query.is("actor_id", null).is("actor_officer_id", null);
      else if (typeof actorFilter === "string")
        query = query.eq("actor_id", actorFilter);
      else if (actorFilter !== undefined)
        query = query.eq("actor_officer_id", actorFilter);
      if (action)
        query = query.filter("action", "imatch", literalSearchPattern(action));
      if (entity) query = query.eq("entity_type", entity);
      if (!dateRangeIsReversed && fromBoundary)
        query = query.gte("created_at", fromBoundary);
      if (!dateRangeIsReversed && toBoundary)
        query = query.lt("created_at", toBoundary);
    }
    if (!countOnly)
      query = query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    return query;
  };

  const [filteredCount, visibleCount, actorResult] = await Promise.all([
    buildLogQuery(true, true),
    buildLogQuery(false, true),
    supabase.from("officers").select("id,name").order("name"),
  ]);
  if (filteredCount.error || visibleCount.error || actorResult.error)
    throw new Error("Failed to load System Log");

  const totalPages = Math.max(
    1,
    Math.ceil((filteredCount.count ?? 0) / SYSTEM_LOG_PAGE_SIZE),
  );
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage)
    redirect(listPageUrl("/system-log", filterSearch, page));

  const { data: entries, error } = await buildLogQuery(true).range(
    (page - 1) * SYSTEM_LOG_PAGE_SIZE,
    page * SYSTEM_LOG_PAGE_SIZE - 1,
  );
  if (error) throw new Error(`Failed to load System Log: ${error.message}`);

  const officerNames = new Map(
    actorResult.data.map((officer) => [officer.id, officer.name]),
  );
  const hasFilters = Boolean(
    search || actorFilter || action || entity || fromDate || toDate,
  );
  const emptyMessage =
    hasFilters && (visibleCount.count ?? 0) > 0
      ? "No System Log entries match these filters."
      : "No System Log entries yet.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Log"
        description="Changes made in Cappy Hub, newest first."
      />
      <ListFilterBar
        key={JSON.stringify(filters)}
        action="/system-log"
        label="System Log filters"
        active={hasFilters}
        clearHref="/system-log"
      >
        <label className="w-full min-w-0 sm:w-auto sm:min-w-56 sm:flex-1">
          Search log
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={100}
            placeholder="Action or record ID"
          />
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-44">
          Actor
          <select name="actor" defaultValue={actorFilter ?? ""}>
            <option value="">All actors</option>
            <option value="system">System</option>
            {actorResult.data.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-44">
          Action contains
          <input
            type="search"
            name="action"
            defaultValue={action}
            maxLength={80}
            placeholder="e.g. event.cancelled"
          />
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-44">
          Entity type
          <select name="entity" defaultValue={entity ?? ""}>
            <option value="">All entity types</option>
            <option value="application_config">
              Application configuration
            </option>
            <option value="branch">Branch</option>
            <option value="event">Event</option>
            <option value="event_location">Event location</option>
            <option value="event_series">Event series</option>
            <option value="event_type">Event type</option>
            <option value="officer">Officer</option>
            <option value="point_transaction">Point transaction</option>
            <option value="position">Position</option>
            <option value="task">Task</option>
            <option value="task_series">Task series</option>
            <option value="warning">Warning</option>
          </select>
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
          From date
          <input name="from" type="date" defaultValue={fromDate ?? ""} />
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
          To date
          <input name="to" type="date" defaultValue={toDate ?? ""} />
        </label>
      </ListFilterBar>
      {dateRangeIsReversed && (
        <p role="status">Choose a From date on or before the To date.</p>
      )}
      {entries.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <TableFrame label="System Log entries">
          <table>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Entity</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap text-muted">
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "America/Denver",
                    })}
                  </td>
                  <td>
                    {entry.actor_officer_id !== null
                      ? (officerNames.get(entry.actor_officer_id) ??
                        `Officer #${entry.actor_officer_id}`)
                      : entry.actor_id === null
                        ? "System"
                        : `Unmapped account ${entry.actor_id.slice(0, 8)}…`}
                  </td>
                  <td>{formatLabel(entry.action.replaceAll(".", " "))}</td>
                  <td>
                    {formatLabel(entry.entity_type)} #{entry.entity_id}
                  </td>
                  <td>
                    <details>
                      <summary className="flex min-h-11 cursor-pointer items-center">
                        {describeDetails(entry.details)}
                      </summary>
                      <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap text-xs text-muted">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          Page {page} · {filteredCount.count ?? 0} entries
        </span>
        <nav
          aria-label="System Log pages"
          className="flex flex-wrap items-center gap-4"
        >
          {page > 1 && (
            <Link href={listPageUrl("/system-log", filterSearch, page - 1)}>
              Previous
            </Link>
          )}
          {page < totalPages && (
            <Link href={listPageUrl("/system-log", filterSearch, page + 1)}>
              Next
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
