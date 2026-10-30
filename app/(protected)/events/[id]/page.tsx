import {
  safeReturnTo,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import ContextualBackLink from "@/components/contextual-back-link";
import { ListPagination } from "@/components/list-pagination";
import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import PointTransactionTable from "@/components/point-transaction-table";
import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventResourceLinks from "../event-resource-links";
import {
  eventStatus,
  eventSignupOpen,
  isSessionEventType,
} from "@/lib/event-status";
import { personalSignupState } from "../personal-signup-state";
import PresenterSlotsSection from "../presenter-slots-section";
import TimeSlotsSection from "../time-slots-section";
import {
  CorrectHistoricalTimeSlotAssignmentsForm,
  LeaveAllTimeSlotsForm,
} from "../time-slot-controls";
import {
  formatCalendarDate,
  formatDateTime,
  formatEventSchedule,
} from "@/lib/presentation";
import { recurrenceFromRule } from "@/lib/recurrence";
import {
  BulkAddOfficersForm,
  SignupForm,
  SelfSignupForm,
  RestoreCancelledEventForm,
  RestoreDeletedEventForm,
  DeleteEventForm,
} from "../event-controls";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  SectionHeading,
  StatusBadge,
  SuccessNotice,
  TableFrame,
} from "@/components/ui";

const RELATED_PAGE_SIZE = 6;
type EventSection = "overview" | "roster" | "tasks" | "points";

function requestedSection(value: string | string[] | undefined): EventSection {
  return value === "roster" || value === "tasks" || value === "points"
    ? value
    : "overview";
}

function requestedPage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function recurrenceSummary(rule: string) {
  const recurrence = recurrenceFromRule(rule);
  const interval =
    recurrence.interval === 1 ? "" : ` every ${recurrence.interval}`;
  const weekdays: Record<string, string> = {
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
    SU: "Sunday",
  };
  const days = recurrence.weekdays.map((day) => weekdays[day]).join(", ");
  const schedule = `${recurrence.frequency}${interval === "" ? "" : interval + (recurrence.frequency === "daily" ? " days" : " weeks")}`;
  const repeat =
    recurrence.frequency === "weekly" && days
      ? `${schedule} on ${days}`
      : schedule;
  const end = recurrence.count
    ? ` · ${recurrence.count} occurrences`
    : recurrence.until
      ? ` · through ${formatCalendarDate(recurrence.until)}`
      : "";
  return `${repeat}${end}`;
}

function sectionHref(
  eventId: string,
  section: EventSection,
  page: number,
  returnTo: unknown,
) {
  const params = new URLSearchParams();
  if (section !== "overview") params.set("section", section);
  if (page > 1) params.set("page", String(page));
  const safeDestination = safeReturnTo(returnTo);
  if (safeDestination) params.set("returnTo", safeDestination);
  const query = params.toString();
  return `/events/${eventId}${query ? `?${query}` : ""}` as Route;
}

function EventSectionNavigation({
  eventId,
  section,
  returnTo,
  counts,
}: {
  eventId: string;
  section: EventSection;
  returnTo: unknown;
  counts: { roster: number; tasks: number; points: number };
}) {
  const sections: { id: EventSection; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "roster", label: "Roster", count: counts.roster },
    ...(counts.tasks > 0
      ? [{ id: "tasks" as const, label: "Linked Tasks", count: counts.tasks }]
      : []),
    { id: "points", label: "Points", count: counts.points },
  ];

  return (
    <nav
      aria-label="Event sections"
      className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border text-sm"
    >
      {sections.map((item) => (
        <Link
          key={item.id}
          href={sectionHref(eventId, item.id, 1, returnTo)}
          aria-current={section === item.id ? "page" : undefined}
          className={`min-h-10 border-b-2 py-2 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted ${section === item.id ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted"}`}
        >
          {item.label}
          {item.count === undefined ? "" : ` (${item.count})`}
        </Link>
      ))}
    </nav>
  );
}

function EventSectionPagination({
  eventId,
  section,
  page,
  totalPages,
  returnTo,
}: {
  eventId: string;
  section: Exclude<EventSection, "overview">;
  page: number;
  totalPages: number;
  returnTo: unknown;
}) {
  if (totalPages <= 1) return null;
  const filters = new URLSearchParams();
  filters.set("section", section);
  const safeDestination = safeReturnTo(returnTo);
  if (safeDestination) filters.set("returnTo", safeDestination);
  return (
    <ListPagination
      pathname={`/events/${eventId}` as Route}
      label={`${section} list`}
      filters={filters}
      page={page}
      totalPages={totalPages}
      getPageHref={(target) => sectionHref(eventId, section, target, returnTo)}
    />
  );
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const query = (await searchParams) ?? {};
  const { returnTo, feedback } = query;
  const section = requestedSection(query.section);
  const requested = requestedPage(query.page);
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const { id: eventIdParam } = await params;
  if (!/^-?[1-9]\d*$/.test(eventIdParam)) notFound();
  const eventId = Number(eventIdParam);
  const result = await supabase
    .from("events")
    .select("*,event_types(name),event_branches(branch_id,branches(name))")
    .eq("id", eventId)
    .maybeSingle();
  if (result.error) throw new Error("Failed to load event");
  if (!result.data) notFound();
  const event = result.data;
  const status = eventStatus(event);
  const signupOpen = !event.deleted_at && eventSignupOpen(event);
  const past = status === "past";
  const canManage = canManageEvent(
    actor,
    event.event_branches.map((eventBranch) => eventBranch.branch_id),
  );
  if (event.deleted_at && !canManage) notFound();
  const eventPointsCountQuery = supabase
    .from("point_transactions")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);
  if (!event.delete_points_suspended)
    eventPointsCountQuery.is("removed_at", null);
  const [
    rosterCountResult,
    taskCountResult,
    pointCountResult,
    personalRosterResult,
    activeOfficerResult,
    series,
  ] = await Promise.all([
    supabase
      .from("event_officers")
      .select("officer_id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .is("removed_at", null),
    supabase
      .from("task_events")
      .select("task_id", { count: "exact", head: true })
      .eq("event_id", event.id),
    eventPointsCountQuery,
    supabase
      .from("event_officers")
      .select("officer_id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("officer_id", actor.id)
      .is("removed_at", null),
    supabase
      .from("officers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("id", actor.id),
    event.recurrence_series_id === null
      ? Promise.resolve(undefined)
      : supabase
          .from("event_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", event.recurrence_series_id)
          .single(),
  ]);
  if (
    rosterCountResult.error ||
    taskCountResult.error ||
    pointCountResult.error ||
    personalRosterResult.error ||
    activeOfficerResult.error
  )
    throw new Error("Failed to load event participation counts");
  if (series?.error) throw new Error("Failed to load recurring series");

  const confirmedCount = rosterCountResult.count ?? 0;
  const taskCount = taskCountResult.count ?? 0;
  const pointCount = pointCountResult.count ?? 0;
  const confirmed = (personalRosterResult.count ?? 0) > 0;
  const eligibleForSelfSignup = (activeOfficerResult.count ?? 0) > 0;
  const full =
    event.max_volunteers !== null && confirmedCount >= event.max_volunteers;
  const personalSignup = personalSignupState({
    open: signupOpen,
    confirmed,
    eligible: eligibleForSelfSignup,
    full,
  });
  const sectionCount =
    section === "roster"
      ? confirmedCount
      : section === "tasks"
        ? taskCount
        : pointCount;
  const totalPages = Math.max(1, Math.ceil(sectionCount / RELATED_PAGE_SIZE));
  const page = Math.min(requested, totalPages);
  const canonicalPage = page > 1 ? String(page) : undefined;
  if (query.page !== canonicalPage) {
    redirect(sectionHref(eventIdParam, section, page, returnTo));
  }
  const start = (page - 1) * RELATED_PAGE_SIZE;

  const canAddOfficers = canManage && !event.deleted_at && (signupOpen || past);
  const canCorrectTimeSlots =
    canManage && !event.deleted_at && event.status !== "cancelled";
  const showPresenters = section === "overview";
  const showTimeSlots =
    (section === "overview" || section === "roster") &&
    !isSessionEventType(event.event_types.name);
  const [
    candidateOfficersResult,
    presenterSlotsResult,
    timeSlotOfficerCandidatesResult,
    timeSlotsResult,
    rosterResult,
    tasksResult,
    transactionsResult,
  ] = await Promise.all([
    canAddOfficers
      ? supabase
          .from("officers")
          .select(
            "id,name,event_officers!event_officers_officer_id_fkey(event_id)",
          )
          .eq("status", "active")
          .eq("event_officers.event_id", event.id)
          .is("event_officers.removed_at", null)
          .is("event_officers", null)
          .order("name")
      : Promise.resolve(undefined),
    showPresenters
      ? supabase
          .from("presentation_slots")
          .select(
            "id,position,officer_id,presentation_title,difficulty,resource_url,prep_notes,officers!presentation_slots_officer_id_fkey(id,name)",
          )
          .eq("event_id", event.id)
          .order("position")
      : Promise.resolve(undefined),
    canManage && showTimeSlots
      ? supabase
          .from("officers")
          .select("id,name")
          .eq("status", "active")
          .order("name")
      : Promise.resolve(undefined),
    showTimeSlots
      ? supabase
          .from("event_time_slots")
          .select(
            "id,starts_at,ends_at,capacity,event_time_slot_officers(officer_id,officers!event_time_slot_officers_officer_id_fkey(id,name),event_officers!event_time_slot_officers_signup_fkey(removed_at))",
          )
          .eq("event_id", event.id)
          .order("starts_at")
      : Promise.resolve(undefined),
    section === "overview"
      ? supabase
          .from("event_officers")
          .select("officer_id,officers!event_officers_officer_id_fkey(id,name)")
          .eq("event_id", event.id)
          .is("removed_at", null)
          .order("officers(name)")
          .order("officer_id")
          .range(0, 2)
      : section === "roster"
        ? supabase
            .from("event_officers")
            .select(
              "officer_id,officers!event_officers_officer_id_fkey(id,name)",
            )
            .eq("event_id", event.id)
            .is("removed_at", null)
            .order("officers(name)")
            .order("officer_id")
            .range(start, start + RELATED_PAGE_SIZE - 1)
        : Promise.resolve(undefined),
    section === "tasks"
      ? supabase
          .from("task_events")
          .select("task_id,tasks!task_events_task_id_fkey(id,title,removed_at)")
          .eq("event_id", event.id)
          .order("tasks(title)")
          .order("task_id")
          .range(start, start + RELATED_PAGE_SIZE - 1)
      : Promise.resolve(undefined),
    section === "points"
      ? (() => {
          const query = supabase
            .from("point_transactions")
            .select(
              "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
            )
            .eq("event_id", event.id);
          if (!event.delete_points_suspended) query.is("removed_at", null);
          return query
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(start, start + RELATED_PAGE_SIZE - 1);
        })()
      : Promise.resolve(undefined),
  ]);
  if (
    candidateOfficersResult?.error ||
    presenterSlotsResult?.error ||
    timeSlotOfficerCandidatesResult?.error ||
    timeSlotsResult?.error ||
    rosterResult?.error ||
    tasksResult?.error ||
    transactionsResult?.error
  )
    throw new Error("Failed to load Event related records");
  const officersAvailableToAdd = candidateOfficersResult?.data ?? [];
  const officersAvailableForSlots =
    timeSlotOfficerCandidatesResult?.data ?? officersAvailableToAdd;
  const timeSlots = timeSlotsResult?.data ?? [];
  const rosterRows = rosterResult?.data ?? [];
  const linkedTasks = (tasksResult?.data ?? []).map(({ tasks }) => tasks);
  const transactions = transactionsResult?.data ?? [];
  const seriesData = series?.data;

  return (
    <div className="space-y-4">
      <ContextualBackLink href="/events" returnTo={returnTo}>
        Back to events
      </ContextualBackLink>
      <PageHeader
        title={event.name}
        action={
          canManage && !event.deleted_at && status !== "cancelled" ? (
            <ActionLink
              href={withReturnTo(`/events/${eventIdParam}/edit`, returnTo)}
            >
              Edit event
            </ActionLink>
          ) : undefined
        }
      />
      <SuccessNotice status={feedback} />
      <EventSectionNavigation
        eventId={eventIdParam}
        section={section}
        returnTo={returnTo}
        counts={{
          roster: confirmedCount,
          tasks: taskCount,
          points: pointCount,
        }}
      />

      {section === "overview" && (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-label="Event details" className="min-w-0 space-y-3">
              <SectionHeading title="Event details" />
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm [&>dt]:mt-0 [&>dt]:font-medium [&>dd]:mt-0 [&>dd]:min-w-0 [&>dd]:break-words">
                <dt>Date</dt>
                <dd>{formatCalendarDate(event.event_date)}</dd>
                <dt>Time</dt>
                <dd>{formatEventSchedule(event.starts_at, event.ends_at)}</dd>
                <dt>Location</dt>
                <dd>{event.location || "Not set"}</dd>
                <dt>Type</dt>
                <dd>{event.event_types.name}</dd>
                <dt>Status</dt>
                <dd>
                  <StatusBadge
                    status={
                      event.deleted_at
                        ? event.delete_points_suspended
                          ? "Deleted"
                          : "Archived"
                        : status
                    }
                  />
                </dd>
                <dt>Branches</dt>
                <dd>
                  <BranchBadges
                    branches={event.event_branches.map(
                      ({ branches }) => branches.name,
                    )}
                  />
                </dd>
                <dt>Processing rate</dt>
                <dd>
                  {event.participation_points_per_hour_at_end === null
                    ? "Not processed"
                    : `${event.participation_points_per_hour_at_end} points/hour`}
                </dd>
                {event.max_volunteers !== null && (
                  <>
                    <dt>Capacity</dt>
                    <dd>
                      {confirmedCount} / {event.max_volunteers} confirmed
                    </dd>
                  </>
                )}
                {seriesData && (
                  <>
                    <dt>Recurrence</dt>
                    <dd>{recurrenceSummary(seriesData.recurrence_rule)}</dd>
                  </>
                )}
                {event.deleted_at && (
                  <>
                    <dt>
                      {event.delete_points_suspended
                        ? "Deleted at"
                        : "Archived at"}
                    </dt>
                    <dd>{formatDateTime(event.deleted_at)}</dd>
                  </>
                )}
              </dl>
              {event.description ? (
                <div>
                  <h3 className="mb-1 text-sm font-medium">Description</h3>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {event.description}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">No description.</p>
              )}
              <EventResourceLinks
                slidesUrl={event.slides_url}
                meetingNotesUrl={event.meeting_notes_url}
                signupSheetUrl={event.signup_sheet_url}
              />
              {canManage && event.deleted_at && (
                <RestoreDeletedEventForm
                  eventId={event.id}
                  seriesId={seriesData?.id}
                  revision={seriesData?.revision}
                  requestKey={crypto.randomUUID()}
                />
              )}
              {canManage && !event.deleted_at && (
                <div className="flex flex-wrap gap-3 [&>form]:w-auto">
                  {status === "cancelled" && (
                    <RestoreCancelledEventForm eventId={event.id} />
                  )}
                  <DeleteEventForm
                    eventId={event.id}
                    seriesId={seriesData?.id}
                    revision={seriesData?.revision}
                    requestKey={crypto.randomUUID()}
                  />
                </div>
              )}
            </section>

            <section aria-label="Participation" className="min-w-0 space-y-3">
              <SectionHeading title="Participation" />
              <p className="text-sm">
                Your participation: {confirmed ? "Confirmed" : "Not signed up"}
              </p>
              <p className="text-sm text-muted">
                {event.max_volunteers === null
                  ? `${confirmedCount} confirmed`
                  : `${confirmedCount} / ${event.max_volunteers} confirmed`}
              </p>
              {full && !confirmed && signupOpen && (
                <p className="text-sm text-muted">
                  This Event is full. Signup is unavailable.
                </p>
              )}
              {personalSignup === "confirmed" &&
                signupOpen &&
                timeSlots.length === 0 && (
                  <SignupForm eventId={event.id} officerId={actor.id} remove />
                )}
              {timeSlots.length === 0 &&
                !canManage &&
                (personalSignup === "available" ||
                  personalSignup === "full") && (
                  <SelfSignupForm
                    eventId={event.id}
                    eventName={event.name}
                    full={personalSignup === "full"}
                  />
                )}
              {timeSlots.length > 0 && (
                <TimeSlotsSection
                  eventId={event.id}
                  slots={timeSlots}
                  actorId={actor.id}
                  canCorrectAssignments={canCorrectTimeSlots}
                  signupOpen={signupOpen}
                  confirmed={confirmed}
                  activeOfficer={eligibleForSelfSignup}
                  eventCapacityBlocked={full && !confirmed}
                  officers={officersAvailableForSlots}
                  past={past}
                />
              )}
              {confirmedCount > 0 ? (
                <div>
                  <h3 className="mb-1 text-sm font-medium">
                    Confirmed roster ({confirmedCount})
                  </h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {rosterRows.map(({ officers: officer }) => (
                      <li key={officer.id}>
                        <Link
                          href={`/officers/${officer.id}`}
                          className="underline underline-offset-4"
                        >
                          {officer.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={sectionHref(eventIdParam, "roster", 1, returnTo)}
                    className="mt-1 inline-block text-sm underline underline-offset-4"
                  >
                    View full roster
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted">No officers signed up.</p>
              )}
              {canManage &&
                timeSlots.length === 0 &&
                signupOpen &&
                (officersAvailableToAdd.length > 0 ? (
                  <details className="event-roster-disclosure">
                    <summary>
                      Add officers ({officersAvailableToAdd.length} available)
                    </summary>
                    <BulkAddOfficersForm
                      eventId={event.id}
                      officers={officersAvailableToAdd}
                    />
                  </details>
                ) : (
                  <p className="text-sm text-muted">
                    No active officers are available to add.
                  </p>
                ))}
              {canManage &&
                timeSlots.length === 0 &&
                past &&
                !event.deleted_at &&
                (officersAvailableToAdd.length > 0 ? (
                  <details className="event-roster-disclosure">
                    <summary>Add attendees and award points</summary>
                    <BulkAddOfficersForm
                      eventId={event.id}
                      past
                      pointsPerOfficer={
                        event.participation_points_per_hour_at_end === null
                          ? undefined
                          : ((new Date(event.ends_at).getTime() -
                              new Date(event.starts_at).getTime()) /
                              3_600_000) *
                            event.participation_points_per_hour_at_end
                      }
                      officers={officersAvailableToAdd}
                    />
                  </details>
                ) : (
                  <p className="text-sm text-muted">
                    No active officers are available to add.
                  </p>
                ))}
              {canManage &&
                timeSlots.length > 0 &&
                (signupOpen || past) &&
                officersAvailableToAdd.length > 0 && (
                  <details className="event-roster-disclosure">
                    <summary>
                      {past
                        ? "Add attendees and award slot Points"
                        : "Add officers to Time Slots"}
                    </summary>
                    <BulkAddOfficersForm
                      eventId={event.id}
                      officers={officersAvailableToAdd}
                      timeSlots={timeSlots.map(({ id }) => ({ id }))}
                      pointsPerHour={event.participation_points_per_hour_at_end}
                      past={past}
                    />
                  </details>
                )}
            </section>
          </div>
          {showPresenters && (
            <PresenterSlotsSection slots={presenterSlotsResult?.data ?? []} />
          )}
          {taskCount > 0 && (
            <p className="text-sm">
              <Link
                href={sectionHref(eventIdParam, "tasks", 1, returnTo)}
                className="underline underline-offset-4"
              >
                Linked Tasks ({taskCount})
              </Link>
            </p>
          )}
          <p className="text-sm">
            <Link
              href={sectionHref(eventIdParam, "points", 1, returnTo)}
              className="underline underline-offset-4"
            >
              Event point history ({pointCount})
            </Link>
          </p>
        </>
      )}

      {section === "roster" && (
        <section aria-label="Confirmed roster" className="space-y-3">
          <SectionHeading
            title={`Confirmed roster (${confirmedCount})`}
            description="Officers are listed alphabetically."
          />
          <EventSectionPagination
            eventId={eventIdParam}
            section="roster"
            page={page}
            totalPages={totalPages}
            returnTo={returnTo}
          />
          {rosterRows.length ? (
            <TableFrame compact label="Event signups">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th scope="col">Officer</th>
                    {timeSlots.length > 0 && <th scope="col">Time Slots</th>}
                    <th scope="col">Signup</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterRows.map(({ officers: officer }) => (
                    <tr key={officer.id}>
                      <td>
                        <Link
                          href={`/officers/${officer.id}`}
                          className="underline underline-offset-4"
                        >
                          {officer.name}
                        </Link>
                      </td>
                      {timeSlots.length > 0 && (
                        <td>
                          {timeSlots
                            .map((slot, index) => ({
                              slot,
                              index,
                            }))
                            .filter(({ slot }) =>
                              slot.event_time_slot_officers.some(
                                ({ officer_id, event_officers: signup }) =>
                                  officer_id === officer.id &&
                                  signup?.removed_at == null,
                              ),
                            )
                            .map(
                              ({ slot, index }) =>
                                `Slot ${index + 1} (${formatEventSchedule(slot.starts_at, slot.ends_at)})`,
                            )
                            .join(", ") || "None"}
                          {canManage && past && !event.deleted_at && (
                            <CorrectHistoricalTimeSlotAssignmentsForm
                              eventId={event.id}
                              officerId={officer.id}
                              officerName={officer.name}
                              slots={timeSlots}
                              selectedSlotIds={timeSlots
                                .filter((slot) =>
                                  slot.event_time_slot_officers.some(
                                    ({ officer_id, event_officers: signup }) =>
                                      officer_id === officer.id &&
                                      signup?.removed_at == null,
                                  ),
                                )
                                .map(({ id }) => id)}
                            />
                          )}
                        </td>
                      )}
                      <td>
                        {timeSlots.length > 0 &&
                        (canManage ||
                          (signupOpen && officer.id === actor.id)) ? (
                          <LeaveAllTimeSlotsForm
                            eventId={event.id}
                            officerId={
                              officer.id === actor.id ? undefined : officer.id
                            }
                          />
                        ) : timeSlots.length === 0 &&
                          (canManage ||
                            (signupOpen && officer.id === actor.id)) ? (
                          <SignupForm
                            eventId={event.id}
                            officerId={officer.id}
                            remove
                          />
                        ) : (
                          "Closed"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
          ) : (
            <p>No officers signed up.</p>
          )}
          <EventSectionPagination
            eventId={eventIdParam}
            section="roster"
            page={page}
            totalPages={totalPages}
            returnTo={returnTo}
          />
        </section>
      )}

      {section === "tasks" && (
        <section aria-label="Linked Tasks" className="space-y-3">
          <SectionHeading title={`Linked Tasks (${taskCount})`} />
          {linkedTasks.length ? (
            <ul className="list-disc space-y-2 pl-5">
              {linkedTasks.map((linkedTask) => (
                <li key={linkedTask.id}>
                  {linkedTask.removed_at ? (
                    <>
                      {linkedTask.title}
                      <span className="ml-2 text-sm text-muted">Deleted</span>
                    </>
                  ) : (
                    <Link
                      href={`/tasks/${linkedTask.id}`}
                      className="underline underline-offset-4"
                    >
                      {linkedTask.title}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No linked Tasks.</p>
          )}
          <EventSectionPagination
            eventId={eventIdParam}
            section="tasks"
            page={page}
            totalPages={totalPages}
            returnTo={returnTo}
          />
        </section>
      )}

      {section === "points" && (
        <section aria-label="Event point history" className="space-y-3">
          <SectionHeading title={`Event point history (${pointCount})`} />
          <EventSectionPagination
            eventId={eventIdParam}
            section="points"
            page={page}
            totalPages={totalPages}
            returnTo={returnTo}
          />
          {transactions.length ? (
            <TableFrame compact label="Event point history">
              <PointTransactionTable transactions={transactions} />
            </TableFrame>
          ) : (
            <p>No Event point history.</p>
          )}
          {pointCount > 0 && (
            <Link
              href={`/points?event=${event.id}`}
              className="inline-block text-sm underline underline-offset-4"
            >
              View in Points history
            </Link>
          )}
          <EventSectionPagination
            eventId={eventIdParam}
            section="points"
            page={page}
            totalPages={totalPages}
            returnTo={returnTo}
          />
        </section>
      )}
    </div>
  );
}
