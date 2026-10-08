import { formatEventSchedule } from "@/lib/presentation";
import {
  getAuthorizationContext,
  isLead,
  canSeeAllBranches,
} from "@/lib/authorization";
import { listReturnUrl, withReturnTo } from "@/lib/return-context";
import Link from "next/link";
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
import { formatLabel } from "@/lib/presentation";
import { searchOrFilter } from "@/lib/list-search";
import { eventListFiltersSchema } from "./filter-validation";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { SelfSignupForm } from "./event-controls";
import {
  eventSignupCountLabel,
  organizeEventList,
  type EventListItem,
} from "@/lib/event-list";

type EventListSearchParams = Record<string, string | string[] | undefined>;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const params = await searchParams;
  const parsedFilters = eventListFiltersSchema.parse(params);
  const mayBrowseArchived =
    canSeeAllBranches(actor) || (isLead(actor) && actor.branchIds.length > 0);
  const status =
    parsedFilters.status === "archived" && !mayBrowseArchived
      ? undefined
      : parsedFilters.status;
  const returnTo = listReturnUrl("/events", {
    ...params,
    status,
  });
  const { q: search, type: typeId, branch: branchId } = parsedFilters;
  const now = new Date();
  const nowIso = now.toISOString();
  const { today } = currentDenverWeek(now);
  const supabase = await createClient();
  const eventSelection =
    "*,event_types(name),event_branches(branch_id,branches(name)),filter_branch:event_branches(branch_id),event_officers(officer_id),event_waitlist(officer_id)";
  const authorizedEventIds =
    status === "archived" && isLead(actor) && !canSeeAllBranches(actor)
      ? await supabase
          .from("event_branches")
          .select("event_id")
          .in("branch_id", actor.branchIds)
      : undefined;
  if (authorizedEventIds?.error)
    throw new Error("Failed to load archived Events");

  const buildEventQuery = (countOnly = false) => {
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
    if (authorizedEventIds)
      query = query.in(
        "id",
        authorizedEventIds.data.length
          ? authorizedEventIds.data.map(({ event_id }) => event_id)
          : [-1],
      );

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
    if (status === "archived" && branchId !== undefined)
      query = query
        .eq("filter_branch.branch_id", branchId)
        .not("filter_branch", "is", null);

    if (!countOnly) {
      if (search)
        query = query.or(
          searchOrFilter(search, ["name", "description", "location"]),
        );
      if (typeId !== undefined) query = query.eq("event_type_id", typeId);
      if (branchId !== undefined)
        query = query
          .eq("filter_branch.branch_id", branchId)
          .not("filter_branch", "is", null);
      query =
        status === "past"
          ? query.order("ends_at", { ascending: false })
          : status === "cancelled"
            ? query.order("event_date", { ascending: false })
            : query.order("starts_at", { ascending: true });
    }
    return query;
  };

  const [
    eventsResult,
    eventCountResult,
    eventTypesResult,
    branchesResult,
    countsResult,
  ] = await Promise.all([
    buildEventQuery(),
    buildEventQuery(true),
    supabase.from("event_types").select("id,name").order("name"),
    supabase.from("branches").select("id,name").order("name"),
    supabase.rpc("event_signup_counts"),
  ]);
  if (
    eventsResult.error ||
    eventCountResult.error ||
    eventTypesResult.error ||
    branchesResult.error ||
    countsResult.error
  )
    throw new Error("Failed to load events");

  const counts = new Map(countsResult.data.map((row) => [row.event_id, row]));
  const events = (eventsResult.data as EventListItem[]).map((event) => ({
    ...event,
    confirmed_count: Number(
      counts.get(event.id)?.confirmed_count ?? event.event_officers.length,
    ),
    waitlist_count: Number(counts.get(event.id)?.waitlist_count ?? 0),
  }));
  const organizedEvents = organizeEventList(events, status, now);
  const splitEvents = (items: EventListItem[]) => ({
    your: items.filter(
      (event) =>
        event.event_officers.some((signup) => signup.officer_id === actor.id) ||
        (event.event_waitlist ?? []).some(
          (entry) => entry.officer_id === actor.id,
        ),
    ),
    other: items.filter(
      (event) =>
        !event.event_officers.some(
          (signup) => signup.officer_id === actor.id,
        ) &&
        !(event.event_waitlist ?? []).some(
          (entry) => entry.officer_id === actor.id,
        ),
    ),
  });
  const hasFilters = Boolean(search || status || typeId || branchId);
  const maySignUp = (title: string) =>
    title === "Other events" &&
    (status === undefined || status === "upcoming" || status === "happening");
  const renderGroup = (title: string, groupEvents: EventListItem[]) => (
    <section key={title} aria-label={title} className="space-y-3">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {!groupEvents.length ? (
        <p>No events in this group.</p>
      ) : (
        <TableFrame compact>
          <table>
            <thead>
              <tr className="grid grid-cols-1 md:table-row">
                <th scope="col">Event</th>
                <th scope="col" className="hidden xl:table-cell">
                  Schedule (El Paso)
                </th>
                <th scope="col" className="hidden xl:table-cell">
                  Type
                </th>
                <th scope="col" className="hidden xl:table-cell">
                  Branches
                </th>
                <th scope="col" className="hidden xl:table-cell">
                  Officers
                </th>
                <th scope="col" className="hidden xl:table-cell">
                  Status
                </th>
                {maySignUp(title) && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {groupEvents.map((event) => (
                <tr key={event.id} className="grid grid-cols-1 md:table-row">
                  <td className="min-w-0">
                    <Link
                      href={withReturnTo(`/events/${event.id}`, returnTo)}
                      className="block break-words"
                    >
                      {event.name}
                    </Link>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted xl:hidden">
                      <span>
                        {formatEventSchedule(event.starts_at, event.ends_at)}
                      </span>
                      <span>{event.event_types.name}</span>
                      <BranchBadges
                        branches={event.event_branches.map(
                          (eventBranch) => eventBranch.branches.name,
                        )}
                      />
                      <span>{eventSignupCountLabel(event)}</span>
                      <StatusBadge status={eventStatus(event, now.getTime())} />
                    </div>
                  </td>
                  <td className="hidden xl:table-cell">
                    {formatEventSchedule(event.starts_at, event.ends_at)}
                  </td>
                  <td className="hidden xl:table-cell">
                    {event.event_types.name}
                  </td>
                  <td className="hidden xl:table-cell">
                    <BranchBadges
                      branches={event.event_branches.map(
                        (eventBranch) => eventBranch.branches.name,
                      )}
                    />
                  </td>
                  <td className="hidden xl:table-cell tabular-nums">
                    {eventSignupCountLabel(event)}
                  </td>
                  <td className="hidden xl:table-cell">
                    <StatusBadge status={eventStatus(event, now.getTime())} />
                  </td>
                  {maySignUp(title) && (
                    <td className="min-w-0">
                      {eventSignupOpen(event, now.getTime()) &&
                        ((event.event_waitlist ?? []).some(
                          (entry) => entry.officer_id === actor.id,
                        ) ? (
                          <span>Waitlisted</span>
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
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}
    </section>
  );

  return (
    <div data-page-width="wide" className="space-y-5">
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
        <label className="w-full min-w-0 sm:w-auto sm:min-w-56 sm:flex-1">
          Search events
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={100}
            placeholder="Name, description, or location"
          />
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
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
        <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
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
        <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
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

      {organizedEvents.view === "current" ? (
        <>
          {!organizedEvents.thisWeek.length &&
          !organizedEvents.upcoming.length &&
          hasFilters &&
          (eventCountResult.count ?? 0) > 0 ? (
            <p>No events match these filters.</p>
          ) : (
            <>
              <section aria-label="This week's events" className="space-y-4">
                <SectionHeading title="This week's events" />
                {!organizedEvents.thisWeek.length ? (
                  <p>No events this week.</p>
                ) : (
                  <>
                    {renderGroup(
                      "Your events",
                      splitEvents(organizedEvents.thisWeek).your,
                    )}
                    {renderGroup(
                      "Other events",
                      splitEvents(organizedEvents.thisWeek).other,
                    )}
                  </>
                )}
              </section>
              <section aria-label="Upcoming events" className="space-y-4">
                <SectionHeading title="Upcoming events" />
                {!organizedEvents.upcoming.length ? (
                  <p>No upcoming events.</p>
                ) : (
                  <>
                    {renderGroup(
                      "Your events",
                      splitEvents(organizedEvents.upcoming).your,
                    )}
                    {renderGroup(
                      "Other events",
                      splitEvents(organizedEvents.upcoming).other,
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </>
      ) : organizedEvents.events.length === 0 ? (
        <p>
          {hasFilters && (eventCountResult.count ?? 0) > 0
            ? "No events match these filters."
            : status === "past"
              ? "No past events."
              : status === "cancelled"
                ? "No cancelled events."
                : status === "archived"
                  ? "No archived Events."
                  : "No events in this group."}
        </p>
      ) : (
        <>
          {renderGroup("Your events", splitEvents(organizedEvents.events).your)}
          {renderGroup(
            "Other events",
            splitEvents(organizedEvents.events).other,
          )}
        </>
      )}
    </div>
  );
}
