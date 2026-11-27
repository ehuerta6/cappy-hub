import {
  formatEventSchedule,
  formatLabel,
  formatRelativeDayCue,
} from "@/lib/presentation";
import {
  getAuthorizationContext,
  isLead,
  canSeeAllBranches,
  canEditEvent,
  canRecoverEventCalendarSync,
} from "@/lib/authorization";
import { listReturnUrl, withReturnTo } from "@/lib/return-context";
import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { eventStatus, eventSignupOpen } from "@/lib/event-status";
import {
  ActionLink,
  BranchBadges,
  CatalogValueBadge,
  ListFilterBar,
  PageHeader,
  SectionHeading,
  StatusBadge,
  TableFrame,
  type ActiveFilterChip,
} from "@/components/ui";
import { ExportCsvButton } from "@/components/export-csv-button";
import { searchOrFilter } from "@/lib/list-search";
import { eventListFiltersSchema } from "./filter-validation";
import { currentDenverWeek } from "@/lib/current-denver-week";
import {
  academicPeriodForDate,
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import {
  RetryGoogleCalendarSyncForm,
  SelfSignupForm,
  SignupForm,
} from "./event-controls";
import { eventSignupCountLabel, type EventListItem } from "@/lib/event-list";

type EventListSearchParams = Record<string, string | string[] | undefined>;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<EventListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const params = await searchParams;
  const periodData = await getAcademicPeriodData();
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  const selectedPeriod = periodSelection.period;
  const filters = eventListFiltersSchema.parse(params);
  const mayBrowseDeleted =
    canSeeAllBranches(actor) || (isLead(actor) && actor.branchIds.length > 0);
  const status =
    filters.status === "deleted" && !mayBrowseDeleted
      ? undefined
      : filters.status;
  const { q: search, type: typeId, branch: branchId, scope } = filters;
  const hasOwnBranches = actor.branchIds.length > 0;
  const effectiveScope = scope === "branch" && !hasOwnBranches ? "all" : scope;
  const now = new Date();
  const nowIso = now.toISOString();
  const { today } = currentDenverWeek(now);
  const supabase = await createClient();
  const filtersInUrl = new URLSearchParams();
  if (params.period !== undefined)
    filtersInUrl.set("period", String(params.period));
  if (search) filtersInUrl.set("q", search);
  if (effectiveScope !== "all") filtersInUrl.set("scope", effectiveScope);
  if (status) filtersInUrl.set("status", status);
  if (typeId !== undefined) filtersInUrl.set("type", String(typeId));
  if (branchId !== undefined) filtersInUrl.set("branch", String(branchId));
  const deletedLead =
    status === "deleted" && isLead(actor) && !canSeeAllBranches(actor);
  const eventSelection =
    "id,name,event_date,starts_at,ends_at,status,deleted_at,delete_points_suspended,max_volunteers,participation_points_per_hour_at_end,event_types(name,color),event_branches(branch_id,branches(name,color)),filter_branch:event_branches(branch_id),scope_branch:event_branches(branch_id),event_officers(officer_id,removed_at,participation_type),my_signup:event_officers(officer_id,removed_at,participation_type)" as const;
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

    if (selectedPeriod && status !== "cancelled" && status !== "deleted")
      query = query
        .gte("event_date", selectedPeriod.starts_on)
        .lte("event_date", selectedPeriod.ends_on);
    if (status === undefined) {
      query = query.neq("status", "cancelled");
      if (!selectedPeriod || !periodSelection.isHistorical)
        query = query.gte("event_date", today).gt("ends_at", nowIso);
    }
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
      if (effectiveScope === "mine")
        query = query
          .eq("my_signup.officer_id", actor.id)
          .is("my_signup.removed_at", null)
          .not("my_signup", "is", null)
          .in("my_signup.participation_type", ["attendee", "volunteer"]);
      if (effectiveScope === "branch")
        query = query
          .in("scope_branch.branch_id", actor.branchIds)
          .not("scope_branch", "is", null);
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

  const [
    pageEventsResult,
    baseCount,
    eventTypesResult,
    branchesResult,
    calendarFailuresResult,
  ] = await Promise.all([
    buildEventQuery(true),
    buildEventQuery(false, true),
    supabase.from("event_types").select("id,name").order("name"),
    supabase.from("branches").select("id,name").order("name"),
    supabase
      .from("event_calendar_sync_failures")
      .select(
        "event_id,failed_at,event:events(id,name,event_date,status,deleted_at,event_branches(branch_id))",
        { count: "exact" },
      )
      .order("failed_at", { ascending: true })
      .order("event_id", { ascending: true }),
  ]);
  if (
    pageEventsResult.error ||
    baseCount.error ||
    eventTypesResult.error ||
    branchesResult.error
  )
    throw new Error("Failed to load events");
  if (calendarFailuresResult.error)
    throw new Error("Failed to load Calendar recovery items");

  const pageEvents = pageEventsResult.data ?? [];
  const totalCount = pageEvents.length;
  const eventIds = pageEvents.map((event) => event.id);
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
  const calendarFailures = (calendarFailuresResult.data ?? []).filter(
    (failure) =>
      failure.event &&
      canRecoverEventCalendarSync(
        actor,
        failure.event.event_branches.map((branch) => branch.branch_id),
        failure.event,
      ),
  );
  const sections = [{ title: selectedPeriod?.name ?? "Events", events }];
  const returnTo = listReturnUrl("/events", {
    q: search,
    status,
    type: typeId?.toString(),
    branch: branchId?.toString(),
    period: params.period,
    scope: effectiveScope !== "all" ? effectiveScope : undefined,
  });
  const clearFiltersQuery = new URLSearchParams();
  if (params.period !== undefined)
    clearFiltersQuery.set("period", String(params.period));
  const clearFiltersHref = clearFiltersQuery.size
    ? (`/events?${clearFiltersQuery.toString()}` as Route)
    : "/events";
  const hasFilters = Boolean(
    search || status || typeId || branchId || effectiveScope !== "all",
  );
  const filteredToNothing =
    totalCount === 0 &&
    (baseCount.count ?? 0) > 0 &&
    Boolean(
      search ||
      typeId !== undefined ||
      branchId !== undefined ||
      effectiveScope !== "all",
    );
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
              : selectedPeriod
                ? `No Events in ${selectedPeriod.name}.`
                : "No current events.";
  const signupActionsOpen =
    !periodSelection.isHistorical &&
    (status === undefined || status === "upcoming" || status === "happening");
  const renderSignupControls = (event: EventListItem) => {
    const personalSignup = event.event_officers.find(
      ({ officer_id, removed_at }) =>
        officer_id === actor.id && removed_at == null,
    );
    const signedUp = personalSignup !== undefined;
    const canAct = signupActionsOpen && eventSignupOpen(event, now.getTime());
    return canAct ? (
      <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
        <SelfSignupForm
          eventId={event.id}
          eventName={event.name}
          compact
          full={
            !signedUp &&
            event.max_volunteers != null &&
            (event.confirmed_count ?? 0) >= event.max_volunteers
          }
          currentType={
            personalSignup?.participation_type === "attendee"
              ? "attendee"
              : signedUp
                ? "volunteer"
                : undefined
          }
        />
        {signedUp && (
          <SignupForm eventId={event.id} officerId={actor.id} remove compact />
        )}
      </div>
    ) : null;
  };

  return (
    <div data-page-width="wide" data-nav-page="events" className="space-y-5">
      <PageHeader
        title="Events"
        description="Club events and participation."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExportCsvButton
              href={
                filtersInUrl.size
                  ? `/api/exports/events?${filtersInUrl.toString()}`
                  : "/api/exports/events"
              }
              emptyMessage="No matching events to export."
            />
            {!periodSelection.isHistorical && canEditEvent(actor) && (
              <ActionLink
                href={
                  `/events/new${params.period ? `?period=${params.period}` : ""}` as Route
                }
              >
                + New event
              </ActionLink>
            )}
          </div>
        }
      />
      {calendarFailures.length > 0 && !periodSelection.isHistorical && (
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
            {calendarFailures.map(({ event }) => {
              const failureEvent = event!;
              const eventPeriod = academicPeriodForDate(
                failureEvent.event_date,
                periodData.periods,
              );
              const detailParams = new URLSearchParams({
                returnTo,
                period: eventPeriod ? String(eventPeriod.id) : "none",
              });
              return (
                <li
                  key={failureEvent.id}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <Link
                    href={`/events/${failureEvent.id}?${detailParams}`}
                    className="font-medium underline"
                  >
                    {failureEvent.name}
                    {failureEvent.deleted_at ? " (deleted)" : ""}
                  </Link>
                  <RetryGoogleCalendarSyncForm
                    eventId={failureEvent.id}
                    compact
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <nav
        aria-label="Event quick views"
        className="flex flex-wrap gap-5 border-b border-border"
      >
        {[
          { scope: "all" as const, label: "All events" },
          { scope: "mine" as const, label: "My events" },
          ...(hasOwnBranches
            ? [
                {
                  scope: "branch" as const,
                  label:
                    actor.branchIds.length === 1 ? "My branch" : "My branches",
                },
              ]
            : []),
        ].map(({ scope: itemScope, label }) => {
          const query = new URLSearchParams(filtersInUrl);
          if (itemScope !== "all") query.set("scope", itemScope);
          else query.delete("scope");
          const serialized = query.toString();
          return (
            <Link
              key={itemScope}
              href={(serialized ? `/events?${serialized}` : "/events") as Route}
              aria-current={effectiveScope === itemScope ? "page" : undefined}
              className={`min-h-10 border-b-2 px-1 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${effectiveScope === itemScope ? "border-brand text-brand" : "border-transparent text-secondary hover:text-foreground"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <ListFilterBar
        key={JSON.stringify([search, status, typeId, branchId, effectiveScope])}
        action="/events"
        label="Event filters"
        active={hasFilters}
        clearHref={clearFiltersHref}
        activeFilters={(() => {
          const chips: ActiveFilterChip[] = [];
          const without = (key: string): Route => {
            const next = new URLSearchParams(filtersInUrl);
            next.delete(key);
            const qs = next.toString();
            return (qs ? `/events?${qs}` : "/events") as Route;
          };
          if (search)
            chips.push({
              label: `Search: "${search}"`,
              removeHref: without("q"),
            });
          if (status)
            chips.push({
              label: `Status: ${formatLabel(status)}`,
              removeHref: without("status"),
            });
          if (typeId !== undefined) {
            const name =
              eventTypesResult.data.find((t) => t.id === typeId)?.name ??
              String(typeId);
            chips.push({
              label: `Type: ${name}`,
              removeHref: without("type"),
            });
          }
          if (branchId !== undefined) {
            const name =
              branchesResult.data.find((b) => b.id === branchId)?.name ??
              String(branchId);
            chips.push({
              label: `Branch: ${formatLabel(name)}`,
              removeHref: without("branch"),
            });
          }
          return chips;
        })()}
      >
        {params.period !== undefined && (
          <input type="hidden" name="period" value={String(params.period)} />
        )}
        {effectiveScope !== "all" && (
          <input type="hidden" name="scope" value={effectiveScope} />
        )}
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
            <option value="">
              {selectedPeriod && periodSelection.isHistorical
                ? "All events in period"
                : "Current events"}
            </option>
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
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
          <p className="text-sm text-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {pageEvents.length >= 1000 && (
            <p role="status" className="text-xs text-muted">
              Showing first {pageEvents.length} events. Narrow your filters to
              see more.
            </p>
          )}
          {sections.map((section) => {
            return (
              <section
                key={section.title}
                aria-label={section.title}
                className="space-y-4"
              >
                <SectionHeading
                  title={section.title}
                  description={`${section.events.length} event${section.events.length === 1 ? "" : "s"}`}
                />
                <TableFrame compact label="Events table">
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
                      {section.events.map((event) => (
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
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <span>
                                {formatEventSchedule(
                                  event.starts_at,
                                  event.ends_at,
                                )}
                              </span>
                              {(() => {
                                const cue = formatRelativeDayCue(
                                  event.event_date,
                                  now,
                                );
                                return cue ? (
                                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-muted">
                                    {cue}
                                  </span>
                                ) : null;
                              })()}
                            </span>
                          </td>
                          <td>
                            <CatalogValueBadge color={event.event_types.color}>
                              {event.event_types.name}
                            </CatalogValueBadge>
                          </td>
                          <td>
                            <BranchBadges
                              branches={event.event_branches.map(
                                (eventBranch) => eventBranch.branches,
                              )}
                            />
                          </td>
                          <td className="tabular-nums">
                            {eventSignupCountLabel(event)}
                          </td>
                          <td className="whitespace-nowrap">
                            {(() => {
                              const currentEventStatus = eventStatus(
                                event,
                                now.getTime(),
                              );
                              return (
                                <span className="inline-flex items-center gap-1.5">
                                  {currentEventStatus === "happening" && (
                                    <span
                                      aria-hidden="true"
                                      className="inline-block size-2 rounded-full bg-success"
                                    />
                                  )}
                                  <StatusBadge status={currentEventStatus} />
                                </span>
                              );
                            })()}
                          </td>
                          {signupActionsOpen && (
                            <td className="min-w-0">
                              {renderSignupControls(event)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableFrame>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
