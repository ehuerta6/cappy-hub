import { formatEventSchedule } from "@/lib/presentation";
import {
  getAuthorizationContext,
  isAdmin,
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
import { SelfSignupForm } from "./event-controls";

type EventListSearchParams = Record<string, string | string[] | undefined>;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const admin = isAdmin(actor);
  const params = await searchParams;
  const returnTo = listReturnUrl("/events", params);
  const parsedFilters = eventListFiltersSchema.parse({
    ...params,
    status: params.status ?? (params.removed === "1" ? "removed" : undefined),
  });
  // A non-admin request for removed history is ignored, and the active-row
  // predicate below stays in place regardless of any user-supplied status.
  const status =
    parsedFilters.status === "removed" && !admin
      ? undefined
      : parsedFilters.status;
  const { q: search, type: typeId, branch: branchId } = parsedFilters;
  const showRemoved = admin && status === "removed";
  const now = new Date();
  const nowIso = now.toISOString();
  const supabase = await createClient();
  const eventSelection =
    "*,event_types(name),event_branches(branch_id,branches(name)),filter_branch:event_branches(branch_id),event_officers(officer_id)";

  const buildEventQuery = (countOnly = false) => {
    let query = supabase
      .from("events")
      .select(
        eventSelection,
        countOnly ? { count: "exact", head: true } : undefined,
      );
    if (!countOnly || !admin) {
      if (showRemoved) query = query.not("deleted_at", "is", null);
      else query = query.is("deleted_at", null);
    }

    // Keep the default browsing groups focused on current events. Cancelled
    // and removed history remains available through its explicit filters.
    if (!countOnly && !showRemoved && status === undefined)
      query = query.neq("status", "cancelled");

    if (!countOnly && status === "upcoming")
      query = query.neq("status", "cancelled").gt("starts_at", nowIso);
    if (!countOnly && status === "happening")
      query = query
        .neq("status", "cancelled")
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso);
    if (!countOnly && status === "past")
      query = query.neq("status", "cancelled").lte("ends_at", nowIso);
    if (!countOnly && status === "cancelled")
      query = query.eq("status", "cancelled");

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
      query = query.order("event_date", { ascending: false });
    }
    return query;
  };

  const [eventsResult, eventCountResult, eventTypesResult, branchesResult] =
    await Promise.all([
      buildEventQuery(),
      buildEventQuery(true),
      supabase.from("event_types").select("id,name").order("name"),
      supabase.from("branches").select("id,name").order("name"),
    ]);
  if (
    eventsResult.error ||
    eventCountResult.error ||
    eventTypesResult.error ||
    branchesResult.error
  )
    throw new Error("Failed to load events");

  const events = eventsResult.data;
  const yourEvents = events.filter((event) =>
    event.event_officers.some((signup) => signup.officer_id === actor.id),
  );
  const otherEvents = events.filter(
    (event) =>
      !event.event_officers.some((signup) => signup.officer_id === actor.id),
  );
  const hasFilters = Boolean(search || status || typeId || branchId);

  return (
    <div className="space-y-6">
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
            <option value="">All statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="happening">Happening</option>
            <option value="past">Past</option>
            <option value="cancelled">Cancelled</option>
            {admin && <option value="removed">Removed</option>}
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

      {events.length === 0 ? (
        <p>
          {hasFilters && (eventCountResult.count ?? 0) > 0
            ? "No events match these filters."
            : showRemoved
              ? "No removed events."
              : "No events yet."}
        </p>
      ) : (
        [
          {
            title: "Your events",
            events: yourEvents,
            empty: "No events in this group.",
            allowSignup: false,
          },
          {
            title: "Other events",
            events: otherEvents,
            empty: "No events in this group.",
            allowSignup: true,
          },
        ].map(({ title, events: groupEvents, empty, allowSignup }) => (
          <section key={title} aria-label={title}>
            <SectionHeading title={title} />
            {!groupEvents.length ? (
              <p>{empty}</p>
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
                      {allowSignup && <th scope="col">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groupEvents.map((event) => (
                      <tr
                        key={event.id}
                        className="grid grid-cols-1 md:table-row"
                      >
                        <td className="min-w-0">
                          <Link
                            href={withReturnTo(`/events/${event.id}`, returnTo)}
                            className="block break-words"
                          >
                            {event.name}
                          </Link>
                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted xl:hidden">
                            <span>
                              {formatEventSchedule(
                                event.starts_at,
                                event.ends_at,
                              )}
                            </span>
                            <span>{event.event_types.name}</span>
                            <BranchBadges
                              branches={event.event_branches.map(
                                (eventBranch) => eventBranch.branches.name,
                              )}
                            />
                            <span>
                              {event.event_officers.length}{" "}
                              {event.event_officers.length === 1
                                ? "officer"
                                : "officers"}
                            </span>
                            <StatusBadge
                              status={eventStatus(event, now.getTime())}
                            />
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
                          {event.event_officers.length}
                        </td>
                        <td className="hidden xl:table-cell">
                          <StatusBadge
                            status={eventStatus(event, now.getTime())}
                          />
                        </td>
                        {allowSignup && (
                          <td className="min-w-0">
                            {eventSignupOpen(event, now.getTime()) && (
                              <SelfSignupForm
                                eventId={event.id}
                                eventName={event.name}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            )}
          </section>
        ))
      )}
    </div>
  );
}
