import { formatEventSchedule, formatLabel } from "@/lib/presentation";
import {
  getAuthorizationContext,
  isLead,
  canSeeAllBranches,
} from "@/lib/authorization";
import { listReturnUrl, withReturnTo } from "@/lib/return-context";
import { listPageUrl } from "@/lib/list-url";
import Link from "next/link";
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
  LeaveWaitlistForm,
  SelfSignupForm,
  SignupForm,
} from "./event-controls";
import {
  eventSignupCountLabel,
  type EventListItem,
} from "@/lib/event-list";

const EVENT_PAGE_SIZE = 8;
type EventListSearchParams = Record<string, string | string[] | undefined>;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const params = await searchParams;
  const filters = eventListFiltersSchema.parse(params);
  const mayBrowseArchived =
    canSeeAllBranches(actor) || (isLead(actor) && actor.branchIds.length > 0);
  const status =
    filters.status === "archived" && !mayBrowseArchived
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

  const archivedLead =
    status === "archived" && isLead(actor) && !canSeeAllBranches(actor);
  const eventSelection =
    "id,name,event_date,starts_at,ends_at,status,deleted_at,max_volunteers,participation_points_per_hour_at_end,event_types(name),event_branches(branch_id,branches(name)),filter_branch:event_branches(branch_id),scope_branch:event_branches(branch_id),event_officers(officer_id),event_waitlist(officer_id)";
  const buildEventQuery = (includeFilters: boolean, countOnly = false) => {
    let query = supabase
      .from("events")
      .select(
        eventSelection,
        countOnly ? { count: "exact", head: true } : undefined,
      );
    query =
      status === "archived"
        ? query.not("deleted_at", "is", null)
        : query.is("deleted_at", null);
    if (archivedLead)
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
          : status === "cancelled" || status === "archived"
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
      counts.get(event.id)?.confirmed_count ?? event.event_officers.length,
    ),
    waitlist_count: Number(counts.get(event.id)?.waitlist_count ?? 0),
  }));
  // Presentation-only grouping: pagination remains schedule-ordered on the server.
  // Splitting by time period does not reorder the eight records on a page.
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
                  : status === "archived"
                    ? "Archived events"
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
        : status === "archived"
          ? "No archived Events."
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
            {mayBrowseArchived && <option value="archived">Archived</option>}
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
            .map((section) => (
              <section
                key={section.title}
                aria-label={section.title}
                className="space-y-3"
              >
                <SectionHeading title={section.title} />
                <TableFrame
                  compact
                  label={`Events table: ${section.title}`}
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
                      {section.events.map((event) => {
                        const signedUp = event.event_officers.some(
                          ({ officer_id }) => officer_id === actor.id,
                        );
                        const waitlisted = (event.event_waitlist ?? []).some(
                          ({ officer_id }) => officer_id === actor.id,
                        );
                        const yourEvent = signedUp || waitlisted;
                        const canAct =
                          signupActionsOpen &&
                          eventSignupOpen(event, now.getTime());
                        return (
                          <tr key={event.id}>
                            <td className="min-w-0">
                              <Link
                                href={withReturnTo(`/events/${event.id}`, returnTo)}
                                className="break-words"
                              >
                                {event.name}
                              </Link>
                              <span
                                className={
                                  yourEvent
                                    ? "ml-2 text-xs text-muted"
                                    : "sr-only"
                                }
                              >
                                {yourEvent ? "Your event" : "Other event"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap">
                              {formatEventSchedule(event.starts_at, event.ends_at)}
                            </td>
                            <td>{event.event_types.name}</td>
                            <td>
                              <BranchBadges
                                branches={event.event_branches.map(
                                  (eventBranch) => eventBranch.branches.name,
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
                                  (waitlisted ? (
                                    <LeaveWaitlistForm eventId={event.id} />
                                  ) : signedUp ? (
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
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          Page {page} of {totalPages} · {totalCount}{" "}
          {totalCount === 1 ? "event" : "events"}
        </span>
        <nav
          aria-label="Event pages"
          className="flex flex-wrap items-center gap-4"
        >
          {page > 1 && (
            <Link href={listPageUrl("/events", filtersInUrl, page - 1)}>
              Previous
            </Link>
          )}
          {page < totalPages && (
            <Link href={listPageUrl("/events", filtersInUrl, page + 1)}>
              Next
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
