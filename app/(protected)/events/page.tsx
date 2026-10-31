import { formatEventSchedule, formatLabel } from "@/lib/presentation";
import {
  getAuthorizationContext,
  isLead,
  canSeeAllBranches,
  canManageEvent,
} from "@/lib/authorization";
import { listReturnUrl, withReturnTo } from "@/lib/return-context";
import { listPageUrl } from "@/lib/list-url";
import { ListPagination } from "@/components/list-pagination";
import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { eventStatus, eventSignupOpen } from "@/lib/event-status";
import {
  ActionLink,
  BranchBadges,
  ListFilterBar,
  PageHeader,
  SectionHeading,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
import { searchOrFilter } from "@/lib/list-search";
import { eventListFiltersSchema } from "./filter-validation";
import { currentDenverWeek } from "@/lib/current-denver-week";
import {
  RetryGoogleCalendarSyncForm,
  SelfSignupForm,
  SignupForm,
} from "./event-controls";
import { eventSignupCountLabel, type EventListItem } from "@/lib/event-list";

const EVENT_PAGE_SIZE = 8;
const CALENDAR_FAILURES_PAGE_SIZE = 200;
type EventListSearchParams = Record<string, string | string[] | undefined>;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const params = await searchParams;
  const filters = eventListFiltersSchema.parse(params);
  const requestedCalendarPage = Number(params.syncPage ?? "1");
  const calendarPage =
    Number.isSafeInteger(requestedCalendarPage) && requestedCalendarPage > 0
      ? requestedCalendarPage
      : 1;
  const mayBrowseDeleted =
    canSeeAllBranches(actor) || (isLead(actor) && actor.branchIds.length > 0);
  const status =
    filters.status === "deleted" && !mayBrowseDeleted
      ? undefined
      : filters.status;
  const {
    q: search,
    type: typeId,
    branch: branchId,
    page: requestedPage,
  } = filters;
  const now = new Date();
  const nowIso = now.toISOString();
  const { today, sunday } = currentDenverWeek(now);
  const supabase = await createClient();
  const filtersInUrl = new URLSearchParams();
  if (search) filtersInUrl.set("q", search);
  if (status) filtersInUrl.set("status", status);
  if (typeId !== undefined) filtersInUrl.set("type", String(typeId));
  if (branchId !== undefined) filtersInUrl.set("branch", String(branchId));
  const calendarSyncPageUrl = (page: number) => {
    const query = new URLSearchParams(filtersInUrl);
    if (page > 1) query.set("syncPage", String(page));
    const serialized = query.toString();
    return (serialized ? `/events?${serialized}` : "/events") as Route;
  };

  const deletedLead =
    status === "deleted" && isLead(actor) && !canSeeAllBranches(actor);
  const eventSelection =
    "id,name,event_date,starts_at,ends_at,status,deleted_at,delete_points_suspended,max_volunteers,participation_points_per_hour_at_end,event_types(name),event_branches(branch_id,branches(name)),filter_branch:event_branches(branch_id),scope_branch:event_branches(branch_id),event_officers(officer_id,removed_at)";
  const buildEventQuery = (includeFilters: boolean, countOnly = false) => {
    let query = supabase
      .from("events")
      .select(
        eventSelection,
        countOnly ? { count: "exact", head: true } : undefined,
      );
    query =
      status === "deleted"
        ? query.not("deleted_at", "is", null)
        : query.is("deleted_at", null);
    if (deletedLead)
      query = query
        .in("scope_branch.branch_id", actor.branchIds)
        .not("scope_branch", "is", null);

    if (status === undefined)
      query = query
        .neq("status", "cancelled")
        .gte("event_date", today)
        .gt("ends_at", nowIso);
    if (status === "upcoming")
      query = query.neq("status", "cancelled").gt("starts_at", nowIso);
    if (status === "happening")
      query = query
        .neq("status", "cancelled")
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso);
    if (status === "past")
      query = query.neq("status", "cancelled").lte("ends_at", nowIso);
    if (status === "cancelled") query = query.eq("status", "cancelled");

    if (includeFilters) {
      if (search)
        query = query.or(
          searchOrFilter(search, ["name", "description", "location"]),
        );
      if (typeId !== undefined) query = query.eq("event_type_id", typeId);
      if (branchId !== undefined)
        query = query
          .eq("filter_branch.branch_id", branchId)
          .not("filter_branch", "is", null);
    }
    if (!countOnly)
      query =
        status === "past"
          ? query
              .order("ends_at", { ascending: false })
              .order("id", { ascending: false })
          : status === "cancelled" || status === "deleted"
            ? query
                .order("event_date", { ascending: false })
                .order("starts_at", { ascending: false })
                .order("id", { ascending: false })
            : query
                .order("starts_at", { ascending: true })
                .order("id", { ascending: true });
    return query;
  };

  const [filteredCount, baseCount, eventTypesResult, branchesResult] =
    await Promise.all([
      buildEventQuery(true, true),
      buildEventQuery(false, true),
      supabase.from("event_types").select("id,name").order("name"),
      supabase.from("branches").select("id,name").order("name"),
    ]);
  if (
    filteredCount.error ||
    baseCount.error ||
    eventTypesResult.error ||
    branchesResult.error
  )
    throw new Error("Failed to load events");

  const totalCount = filteredCount.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / EVENT_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage)
    redirect(listPageUrl("/events", filtersInUrl, page));

  const { data: pageEvents, error: pageError } = await buildEventQuery(
    true,
  ).range((page - 1) * EVENT_PAGE_SIZE, page * EVENT_PAGE_SIZE - 1);
  if (pageError) throw new Error("Failed to load events");
  const eventIds = (pageEvents ?? []).map((event) => event.id);
  const signupCounts = eventIds.length
    ? await supabase.rpc("event_signup_counts").in("event_id", eventIds)
    : { data: [], error: null };
  if (signupCounts.error) throw new Error("Failed to load event signup counts");
  const counts = new Map(
    (signupCounts.data ?? []).map((row) => [row.event_id, row]),
  );
  const events = (pageEvents as EventListItem[]).map((event) => ({
    ...event,
    confirmed_count: Number(
      counts.get(event.id)?.confirmed_count ??
        event.event_officers.filter(({ removed_at }) => removed_at == null)
          .length,
    ),
  }));
  const calendarFailuresResult = await supabase
    .from("event_calendar_sync_failures")
    .select(
      "event_id,failed_at,event:events(id,name,starts_at,deleted_at,event_branches(branch_id))",
      { count: "exact" },
    )
    .order("failed_at", { ascending: true })
    .order("event_id", { ascending: true })
    .range(
      (calendarPage - 1) * CALENDAR_FAILURES_PAGE_SIZE,
      calendarPage * CALENDAR_FAILURES_PAGE_SIZE - 1,
    );
  if (calendarFailuresResult.error)
    throw new Error("Failed to load Calendar recovery items");
  const calendarFailures = (calendarFailuresResult.data ?? []).filter(
    (failure) =>
      failure.event &&
      canManageEvent(
        actor,
        failure.event.event_branches.map(
          (eventBranch) => eventBranch.branch_id,
        ),
      ),
  );
  const calendarFailurePageCount = Math.ceil(
    (calendarFailuresResult.count ?? 0) / CALENDAR_FAILURES_PAGE_SIZE,
  );
  const participates = (event: EventListItem) =>
    event.event_officers.some(
      ({ officer_id, removed_at }) =>
        officer_id === actor.id && removed_at == null,
    );
  // Pagination selects and orders the page first; presentation groups only
  // those eight Events and keeps their order within each group.
  const sections =
    status === undefined
      ? [
          {
            title: "This week's events",
            events: events.filter((event) => event.event_date <= sunday),
          },
          {
            title: "Upcoming events",
            events: events.filter((event) => event.event_date > sunday),
          },
        ]
      : [
          {
            title:
              status === "past"
                ? "Past events"
                : status === "cancelled"
                  ? "Cancelled events"
                  : status === "deleted"
                    ? "Deleted events"
                    : status === "happening"
                      ? "Happening events"
                      : "Upcoming events",
            events,
          },
        ];
  const returnTo = listReturnUrl("/events", {
    q: search,
    status,
    type: typeId?.toString(),
    branch: branchId?.toString(),
    page: page > 1 ? String(page) : undefined,
  });
  const hasFilters = Boolean(search || status || typeId || branchId);
  const filteredToNothing =
    totalCount === 0 &&
    (baseCount.count ?? 0) > 0 &&
    Boolean(search || typeId !== undefined || branchId !== undefined);
  const emptyMessage = filteredToNothing
    ? "No events match these filters."
    : status === "past"
      ? "No past events."
      : status === "cancelled"
        ? "No cancelled events."
        : status === "deleted"
          ? "No deleted Events."
          : status === "upcoming"
            ? "No upcoming events."
            : status === "happening"
              ? "No events happening now."
              : "No current events.";
  const signupActionsOpen =
    status === undefined || status === "upcoming" || status === "happening";

  return (
    <div data-page-width="wide" className="space-y-4">
      <PageHeader
        title="Events"
        description="Club events and participation."
        action={
          canSeeAllBranches(actor) ||
          (isLead(actor) && actor.branchIds.length > 0) ? (
            <ActionLink href="/events/new">+ New event</ActionLink>
          ) : undefined
        }
      />
      {calendarFailures.length > 0 && (
        <section
          aria-label="Google Calendar synchronization failures"
          className="rounded-lg border border-danger-border bg-danger-bg p-4"
          role="region"
        >
          <SectionHeading title="Google Calendar needs attention" />
          <p className="mb-3 text-sm">
            Cappy Hub saved these Events, but their shared Calendar entries did
            not synchronize. Retry uses each Event’s current details and deleted
            status.
          </p>
          <ul className="space-y-3">
            {calendarFailures.map((event) => (
              <li
                key={event.event_id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <Link
                  href={`/events/${event.event!.id}`}
                  className="font-medium underline"
                >
                  {event.event!.name}
                  {event.event!.deleted_at ? " (deleted)" : ""}
                </Link>
                <RetryGoogleCalendarSyncForm
                  eventId={event.event!.id}
                  compact
                />
              </li>
            ))}
          </ul>
          {(calendarPage > 1 || calendarPage < calendarFailurePageCount) && (
            <nav
              aria-label="Google Calendar recovery pages"
              className="mt-4 flex gap-3 text-sm"
            >
              {calendarPage > 1 && (
                <Link
                  href={calendarSyncPageUrl(calendarPage - 1)}
                  className="underline"
                >
                  Previous recovery page
                </Link>
              )}
              {calendarPage < calendarFailurePageCount && (
                <Link
                  href={calendarSyncPageUrl(calendarPage + 1)}
                  className="underline"
                >
                  More recovery items
                </Link>
              )}
            </nav>
          )}
        </section>
      )}
      <ListFilterBar
        key={JSON.stringify([search, status, typeId, branchId])}
        action="/events"
        label="Event filters"
        active={hasFilters}
        clearHref="/events"
      >
        <label className="min-w-56 flex-1">
          Search events
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={100}
            placeholder="Name, description, or location"
          />
        </label>
        <label className="min-w-36">
          Status
          <select name="status" defaultValue={status ?? ""}>
            <option value="">Current events</option>
            <option value="upcoming">Upcoming</option>
            <option value="happening">Happening</option>
            <option value="past">Past</option>
            <option value="cancelled">Cancelled</option>
            {mayBrowseDeleted && <option value="deleted">Deleted</option>}
          </select>
        </label>
        <label className="min-w-36">
          Event type
          <select name="type" defaultValue={typeId ?? ""}>
            <option value="">All event types</option>
            {eventTypesResult.data.map((eventType) => (
              <option key={eventType.id} value={eventType.id}>
                {eventType.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-36">
          Branch
          <select name="branch" defaultValue={branchId ?? ""}>
            <option value="">All branches</option>
            {branchesResult.data.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {formatLabel(branch.name)}
              </option>
            ))}
          </select>
        </label>
      </ListFilterBar>

      {events.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <div className="space-y-5">
          {sections
            .filter((section) => section.events.length > 0)
            .map((section) => {
              const groups = [
                {
                  title: "Your events",
                  events: section.events.filter(participates),
                },
                {
                  title: "Other events",
                  events: section.events.filter(
                    (event) => !participates(event),
                  ),
                },
              ].filter((group) => group.events.length > 0);

              return (
                <section
                  key={section.title}
                  aria-label={section.title}
                  className="space-y-4"
                >
                  <SectionHeading title={section.title} />
                  {groups.map((group) => (
                    <section
                      key={group.title}
                      aria-label={`${section.title}: ${group.title}`}
                      className="space-y-3"
                    >
                      <h3 className="font-semibold text-foreground">
                        {group.title}
                      </h3>
                      <TableFrame
                        compact
                        label={`Events table: ${section.title}: ${group.title}`}
                      >
                        <table>
                          <thead>
                            <tr>
                              <th scope="col">Event</th>
                              <th scope="col">Schedule (El Paso)</th>
                              <th scope="col">Type</th>
                              <th scope="col">Branches</th>
                              <th scope="col">Officers</th>
                              <th scope="col">Status</th>
                              {signupActionsOpen && <th scope="col">Action</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {group.events.map((event) => {
                              const signedUp = event.event_officers.some(
                                ({ officer_id, removed_at }) =>
                                  officer_id === actor.id && removed_at == null,
                              );
                              const canAct =
                                signupActionsOpen &&
                                eventSignupOpen(event, now.getTime());
                              return (
                                <tr key={event.id}>
                                  <td className="min-w-0">
                                    <Link
                                      href={withReturnTo(
                                        `/events/${event.id}`,
                                        returnTo,
                                      )}
                                      className="break-words"
                                    >
                                      {event.name}
                                    </Link>
                                  </td>
                                  <td className="whitespace-nowrap">
                                    {formatEventSchedule(
                                      event.starts_at,
                                      event.ends_at,
                                    )}
                                  </td>
                                  <td>{event.event_types.name}</td>
                                  <td>
                                    <BranchBadges
                                      branches={event.event_branches.map(
                                        (eventBranch) =>
                                          eventBranch.branches.name,
                                      )}
                                    />
                                  </td>
                                  <td className="tabular-nums">
                                    {eventSignupCountLabel(event)}
                                  </td>
                                  <td className="whitespace-nowrap">
                                    <StatusBadge
                                      status={eventStatus(event, now.getTime())}
                                    />
                                  </td>
                                  {signupActionsOpen && (
                                    <td className="min-w-0">
                                      {canAct &&
                                        (signedUp ? (
                                          <SignupForm
                                            eventId={event.id}
                                            officerId={actor.id}
                                            remove
                                          />
                                        ) : (
                                          <SelfSignupForm
                                            eventId={event.id}
                                            eventName={event.name}
                                            full={
                                              event.max_volunteers != null &&
                                              (event.confirmed_count ?? 0) >=
                                                event.max_volunteers
                                            }
                                          />
                                        ))}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </TableFrame>
                    </section>
                  ))}
                </section>
              );
            })}
        </div>
      )}
      <ListPagination
        pathname="/events"
        label="Event"
        filters={filtersInUrl}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        countLabel={totalCount === 1 ? "event" : "events"}
      />
    </div>
  );
}
