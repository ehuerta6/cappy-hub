import { canViewSystemLog, getAuthorizationContext } from "@/lib/authorization";
import { PageHeader, ListFilterBar, TableFrame } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { searchOrFilter, literalSearchPattern } from "@/lib/list-search";
import { listPageUrl } from "@/lib/list-url";
import { denverTimestamp } from "@/lib/event-time";
import { presentAuditEntry } from "@/lib/system-log-presentation";
import { systemLogFiltersSchema } from "./filter-validation";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";

type SystemLogSearchParams = Record<string, string | string[] | undefined>;
const SYSTEM_LOG_PAGE_SIZE = 50;

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
  const eventIds = new Set<number>();
  const taskIds = new Set<number>();
  for (const entry of entries) {
    const details =
      entry.details !== null &&
      typeof entry.details === "object" &&
      !Array.isArray(entry.details)
        ? (entry.details as Record<string, unknown>)
        : undefined;
    const entityId = Number(entry.entity_id);
    if (Number.isSafeInteger(entityId)) {
      if (entry.entity_type === "event") eventIds.add(entityId);
      if (entry.entity_type === "task") taskIds.add(entityId);
    }
    for (const source of [
      details,
      details?.after as Record<string, unknown> | undefined,
      details?.before as Record<string, unknown> | undefined,
    ]) {
      for (const [key, ids] of [
        ["event_id", eventIds],
        [
          entry.entity_type === "event_series"
            ? "selected_occurrence_id"
            : "event_id",
          eventIds,
        ],
        ["task_id", taskIds],
        [
          entry.entity_type === "task_series"
            ? "selected_occurrence_id"
            : "task_id",
          taskIds,
        ],
      ] as const) {
        const value = source?.[key];
        const relatedId =
          typeof value === "number"
            ? value
            : typeof value === "string" && /^-?\d+$/.test(value)
              ? Number(value)
              : undefined;
        if (relatedId !== undefined && Number.isSafeInteger(relatedId))
          ids.add(relatedId);
      }
    }
  }
  const [eventResult, taskResult] = await Promise.all([
    eventIds.size > 0
      ? supabase
          .from("events")
          .select("id,name")
          .in("id", [...eventIds])
      : Promise.resolve({ data: [], error: null }),
    taskIds.size > 0
      ? supabase
          .from("tasks")
          .select("id,title")
          .is("removed_at", null)
          .in("id", [...taskIds])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventResult.error || taskResult.error)
    throw new Error("Failed to load System Log record context");
  const eventNames = new Map(
    eventResult.data.map((event) => [event.id, event.name]),
  );
  const taskNames = new Map(
    taskResult.data.map((task) => [task.id, task.title]),
  );
  const eventContext = {
    officerNames,
    eventNames,
    taskNames,
    availableEventIds: new Set(eventNames.keys()),
    availableTaskIds: new Set(taskNames.keys()),
    availableOfficerIds: new Set(officerNames.keys()),
  };
  const hasFilters = Boolean(
    search || actorFilter || action || entity || fromDate || toDate,
  );
  const emptyMessage =
    hasFilters && (visibleCount.count ?? 0) > 0
      ? "No System Log entries match these filters."
      : "No System Log entries yet.";

  return (
    <div data-page-width="wide" className="space-y-5">
      <PageHeader
        title="System Log"
        description="Review who changed each record and what changed, newest first."
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
          Activity or action code
          <input
            type="search"
            name="action"
            defaultValue={action}
            maxLength={80}
            placeholder="e.g. signup or event.cancelled"
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
          <table className="system-log-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Actor</th>
                <th scope="col">Activity</th>
                <th scope="col">Record</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const presentation = presentAuditEntry(entry, eventContext);
                return (
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
                    <td>{presentation.activity}</td>
                    <td>
                      {presentation.record.href ? (
                        <Link href={presentation.record.href as Route}>
                          {presentation.record.label}
                        </Link>
                      ) : (
                        presentation.record.label
                      )}
                    </td>
                    <td>
                      {presentation.changes.length === 0 ? (
                        <p>{presentation.detailSummary}</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-xs text-muted">
                          {presentation.changes.map((change) => (
                            <li key={change.label}>
                              {change.label}: {change.value}
                            </li>
                          ))}
                        </ul>
                      )}
                      <details className="mt-1 text-xs text-muted">
                        <summary className="min-h-11 cursor-pointer">
                          Technical details
                        </summary>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                          <dt>Action</dt>
                          <dd>{entry.action}</dd>
                          <dt>Entity type</dt>
                          <dd>{entry.entity_type}</dd>
                          <dt>Entity ID</dt>
                          <dd>{entry.entity_id}</dd>
                        </dl>
                        <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                );
              })}
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
