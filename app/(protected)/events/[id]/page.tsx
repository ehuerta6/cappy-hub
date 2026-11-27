import {
  safeReturnTo,
  listReturnUrl,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import ContextualBackLink from "@/components/contextual-back-link";
import { CopyCanonicalLinkButton } from "@/components/copy-button";
import EventRosterTableClient from "../event-roster-client";
import {
  getAuthorizationContext,
  canEditEvent,
  canManageEvent,
  canRecoverEventCalendarSync,
  canSeeAllBranches,
  isLead,
} from "@/lib/authorization";
import {
  EventLinkedTasksSection,
  EventPointHistorySection,
} from "./event-detail-sections";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  academicPeriodForDate,
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { ResourceLinksList } from "@/components/resource-links-list";
import {
  eventStatus,
  eventSignupOpen,
  isSessionEventType,
} from "@/lib/event-status";
import { personalSignupState } from "../personal-signup-state";
import PresenterSlotsSection from "../presenter-slots-section";
import TimeSlotsSection, { isSelfTimeSlotSignup } from "../time-slots-section";
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
  RetryGoogleCalendarSyncForm,
} from "../event-controls";
import {
  ActionLink,
  BranchBadges,
  CatalogValueBadge,
  PageHeader,
  SectionHeading,
  StatusBadge,
  SuccessNotice,
} from "@/components/ui";

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

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const query = (await searchParams) ?? {};
  const { returnTo, feedback } = query;
  const [periodData, actor, supabase, { id: eventIdParam }] = await Promise.all(
    [
      getAcademicPeriodData(),
      getAuthorizationContext(),
      createClient(),
      params,
    ],
  );
  const periodSelection = resolveAcademicPeriod(query.period, periodData);
  const selectedPeriod = periodSelection.period;
  const contextualReturnTo =
    safeReturnTo(returnTo) ?? listReturnUrl("/events", query);
  if (!/^-?[1-9]\d*$/.test(eventIdParam)) notFound();
  const eventId = Number(eventIdParam);
  const result = await supabase
    .from("events")
    .select(
      "*,event_types(name,color),event_branches(branch_id,branches(name,color))",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (result.error) throw new Error("Failed to load event");
  if (!result.data) notFound();
  const event = result.data;
  if (
    selectedPeriod &&
    (event.event_date < selectedPeriod.starts_on ||
      event.event_date > selectedPeriod.ends_on)
  )
    notFound();
  const status = eventStatus(event);
  const signupOpen = !event.deleted_at && eventSignupOpen(event);
  const past = status === "past";
  const eventBranches = event.event_branches.map(({ branch_id }) => branch_id);
  const eventPeriod = academicPeriodForDate(
    event.event_date,
    periodData.periods,
  );
  const isHistorical =
    eventPeriod !== undefined && eventPeriod.ends_on < periodData.currentDate;
  const canManage = !isHistorical && canManageEvent(actor, eventBranches);
  const canEdit = !isHistorical && canEditEvent(actor);
  const editPeriod = eventPeriod
    ? eventPeriod.id === periodData.currentPeriodId &&
      query.period === undefined
      ? null
      : String(eventPeriod.id)
    : periodSelection.explicitNoPeriod
      ? "none"
      : null;
  const createPeriod =
    editPeriod === "none" && periodData.currentPeriodId !== null
      ? null
      : editPeriod;
  const createPeriodQuery =
    createPeriod === null ? "" : `&period=${createPeriod}`;
  const canRecoverCalendar =
    !isHistorical && canRecoverEventCalendarSync(actor, eventBranches, event);
  const canManageCurrentRoster = canManage || (canEdit && !past);
  if (event.deleted_at && !canManage) notFound();

  const canAddOfficers =
    canManageCurrentRoster && !event.deleted_at && (signupOpen || past);
  const canCorrectTimeSlots =
    (canManage || (canEdit && !past)) &&
    !event.deleted_at &&
    event.status !== "cancelled";
  const showTimeSlots = !isSessionEventType(event.event_types.name);

  const eventPointsQuery = supabase
    .from("point_transactions")
    .select(
      "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
    )
    .eq("event_id", event.id);
  if (!event.delete_points_suspended) eventPointsQuery.is("removed_at", null);

  const [
    calendarSyncFailure,
    personalRosterResult,
    activeOfficerResult,
    series,
    resourceLinksResult,
    candidateOfficersResult,
    presenterSlotsResult,
    timeSlotOfficerCandidatesResult,
    timeSlotsResult,
    rosterResult,
    tasksResult,
    transactionsResult,
  ] = await Promise.all([
    canRecoverCalendar
      ? supabase
          .from("event_calendar_sync_failures")
          .select("failed_at")
          .eq("event_id", event.id)
          .maybeSingle()
      : Promise.resolve(null),
    supabase
      .from("event_officers")
      .select("officer_id,participation_type", { count: "exact" })
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
    supabase
      .from("resource_links")
      .select("id,kind,label,url,legacy_key,sort_order")
      .eq("event_id", event.id)
      .order("sort_order")
      .order("id"),
    canAddOfficers
      ? supabase
          .from("officers")
          .select(
            "id,name,officer_branches(branches(name)),event_officers!event_officers_officer_id_fkey(event_id)",
          )
          .eq("status", "active")
          .eq("event_officers.event_id", event.id)
          .is("event_officers.removed_at", null)
          .is("event_officers", null)
          .order("name")
      : Promise.resolve(undefined),
    supabase
      .from("presentation_slots")
      .select(
        "id,position,officer_id,presentation_title,difficulty,resource_url,prep_notes,officers!presentation_slots_officer_id_fkey(id,name)",
      )
      .eq("event_id", event.id)
      .order("position"),
    canManageCurrentRoster && showTimeSlots
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
            "id,starts_at,ends_at,capacity,event_time_slot_officers(officer_id,created_by,officers!event_time_slot_officers_officer_id_fkey(id,name),event_officers!event_time_slot_officers_signup_fkey(removed_at))",
          )
          .eq("event_id", event.id)
          .order("starts_at")
      : Promise.resolve(undefined),
    supabase
      .from("event_officers")
      .select(
        "officer_id,participation_type,officers!event_officers_officer_id_fkey(id,name,utep_email,personal_email)",
      )
      .eq("event_id", event.id)
      .is("removed_at", null)
      .order("officers(name)")
      .order("officer_id"),
    supabase
      .from("task_events")
      .select(
        "task_id,tasks!task_events_task_id_fkey(id,title,due_date,removed_at)",
      )
      .eq("event_id", event.id)
      .order("tasks(title)")
      .order("task_id"),
    eventPointsQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  if (calendarSyncFailure?.error)
    throw new Error("Failed to load Calendar sync status");
  if (personalRosterResult.error || activeOfficerResult.error)
    throw new Error("Failed to load event participation");
  if (series?.error) throw new Error("Failed to load recurring series");
  if (resourceLinksResult.error)
    throw new Error("Failed to load Event resource links");
  if (
    candidateOfficersResult?.error ||
    presenterSlotsResult.error ||
    timeSlotOfficerCandidatesResult?.error ||
    timeSlotsResult?.error ||
    rosterResult.error ||
    tasksResult.error ||
    transactionsResult.error
  )
    throw new Error("Failed to load Event related records");

  const hasCalendarSyncFailure = Boolean(calendarSyncFailure?.data);
  const rosterRows = rosterResult.data ?? [];
  const confirmedCount = rosterRows.length;
  const volunteerCount = rosterRows.filter(
    ({ participation_type }) => participation_type !== "attendee",
  ).length;
  const attendeeCount = confirmedCount - volunteerCount;
  const durationHours = Math.max(
    0,
    (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) /
      3_600_000,
  );
  const volunteerRate = event.participation_points_per_hour_at_end ?? 2;
  const estimatedVolunteerPoints =
    Math.round(durationHours * volunteerRate * 100) / 100;
  const estimatedAttendeePoints =
    Math.round(durationHours * (volunteerRate / 2) * 100) / 100;
  const durationLabel = `${Math.round(durationHours * 100) / 100}h`;
  const linkedTasks = (tasksResult.data ?? []).map(({ tasks }) => {
    const taskPeriod =
      periodData.periods.length > 0 && tasks.due_date
        ? academicPeriodForDate(tasks.due_date, periodData.periods)
        : undefined;
    const period =
      periodData.periods.length === 0 || !tasks.due_date
        ? null
        : taskPeriod
          ? taskPeriod.id === periodData.currentPeriodId
            ? null
            : String(taskPeriod.id)
          : "none";
    return { ...tasks, period };
  });
  const transactions = transactionsResult.data ?? [];
  const confirmed = (personalRosterResult.count ?? 0) > 0;
  const personalParticipationType =
    personalRosterResult.data?.[0]?.participation_type ?? "volunteer";
  const eligibleForSelfSignup = (activeOfficerResult.count ?? 0) > 0;
  const full =
    event.max_volunteers !== null && confirmedCount >= event.max_volunteers;
  const personalSignup = personalSignupState({
    open: signupOpen,
    confirmed,
    eligible: eligibleForSelfSignup,
    full,
  });
  const officersAvailableToAdd = (candidateOfficersResult?.data ?? []).map(
    ({ id, name, officer_branches }) => ({
      id,
      name,
      branches: (officer_branches ?? [])
        .map((ob) => ob.branches?.name)
        .filter((b): b is string => Boolean(b)),
    }),
  );
  const officersAvailableForSlots =
    timeSlotOfficerCandidatesResult?.data ?? officersAvailableToAdd;
  const timeSlots = (timeSlotsResult?.data ?? []).map((slot) => ({
    ...slot,
    event_time_slot_officers: slot.event_time_slot_officers.map(
      ({ created_by, ...registration }) => ({
        ...registration,
        is_self_signup: isSelfTimeSlotSignup(created_by, actor.authUserId),
      }),
    ),
  }));
  const seriesData = series?.data;

  const statusDisplay = event.deleted_at
    ? event.delete_points_suspended
      ? "Deleted"
      : "Archived"
    : status;

  return (
    <div data-record-page="event" className="space-y-5">
      <ContextualBackLink href="/events" returnTo={contextualReturnTo}>
        Back to events
      </ContextualBackLink>
      <PageHeader
        title={event.name}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <CopyCanonicalLinkButton path={`/events/${eventIdParam}`} />
            {!isHistorical &&
              !event.deleted_at &&
              (canSeeAllBranches(actor) ||
                (isLead(actor) && actor.branchIds.length > 0)) && (
                <Link
                  href={
                    `/tasks/new?event=${event.id}${createPeriodQuery}` as Route
                  }
                  className="button-secondary inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium lg:min-h-0"
                >
                  + Linked task
                </Link>
              )}
            {canEdit && !event.deleted_at && (
              <Link
                href={
                  `/events/new?from=${event.id}${createPeriodQuery}` as Route
                }
                className="button-secondary inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium lg:min-h-0"
              >
                Duplicate
              </Link>
            )}
            {canEdit && !event.deleted_at && status !== "cancelled" && (
              <ActionLink
                href={withReturnTo(
                  `/events/${eventIdParam}/edit`,
                  contextualReturnTo,
                  editPeriod,
                )}
              >
                Edit event
              </ActionLink>
            )}
          </div>
        }
      />
      <SuccessNotice status={feedback} />

      {hasCalendarSyncFailure && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-border bg-danger-bg px-4 py-3"
        >
          <p className="text-sm text-foreground">
            This Event is not synchronized with the shared Google Calendar.
            Retry uses its current details and deleted status.
          </p>
          <RetryGoogleCalendarSyncForm
            eventId={event.id}
            detailReturnTo={contextualReturnTo}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Schedule
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatCalendarDate(event.event_date)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {formatEventSchedule(event.starts_at, event.ends_at)}
            {durationHours > 0 ? ` · ${durationLabel}` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Location
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-foreground">
            {event.location || "Not set"}
          </p>
          {seriesData && (
            <p className="mt-0.5 text-xs text-muted">
              {recurrenceSummary(seriesData.recurrence_rule)}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Status &amp; type
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={statusDisplay} />
            <CatalogValueBadge color={event.event_types.color}>
              {event.event_types.name}
            </CatalogValueBadge>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Attendance
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
            {event.max_volunteers === null
              ? `${confirmedCount} confirmed`
              : `${confirmedCount} / ${event.max_volunteers} confirmed`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {volunteerCount} Volunteer{volunteerCount === 1 ? "" : "s"} ·{" "}
            {attendeeCount} Attendee{attendeeCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,1fr)]">
        <section
          aria-label="Event details"
          className="min-w-0 space-y-4 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
        >
          <SectionHeading title="Event details" />
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Description
            </h3>
            {event.description ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {event.description}
              </p>
            ) : (
              <p className="text-sm text-muted">No description.</p>
            )}
          </div>

          <ResourceLinksList resources={resourceLinksResult.data} />

          <dl className="grid grid-cols-1 gap-x-6 border-t border-border pt-3 text-sm sm:grid-cols-2 [&>div]:border-b [&>div]:border-border/60 [&>div]:py-2">
            <div>
              <dt className="text-xs font-medium text-muted">Date</dt>
              <dd className="mt-0.5 text-foreground">
                {formatCalendarDate(event.event_date)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Time</dt>
              <dd className="mt-0.5 text-foreground">
                {formatEventSchedule(event.starts_at, event.ends_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Location</dt>
              <dd className="mt-0.5 break-words text-foreground">
                {event.location || "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Branches</dt>
              <dd className="mt-1">
                <BranchBadges
                  branches={event.event_branches.map(
                    ({ branches }) => branches,
                  )}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">
                Processing rate
              </dt>
              <dd className="mt-0.5 text-foreground">
                {event.participation_points_per_hour_at_end === null
                  ? "Not processed"
                  : `${event.participation_points_per_hour_at_end} points/hour`}
              </dd>
            </div>
            {event.max_volunteers !== null && (
              <div>
                <dt className="text-xs font-medium text-muted">Capacity</dt>
                <dd className="mt-0.5 tabular-nums text-foreground">
                  {confirmedCount} / {event.max_volunteers} confirmed
                </dd>
              </div>
            )}
            {seriesData && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted">Recurrence</dt>
                <dd className="mt-0.5 text-foreground">
                  {recurrenceSummary(seriesData.recurrence_rule)}
                </dd>
              </div>
            )}
            {event.deleted_at && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted">
                  {event.delete_points_suspended ? "Deleted at" : "Archived at"}
                </dt>
                <dd className="mt-0.5 text-foreground">
                  {formatDateTime(event.deleted_at)}
                </dd>
              </div>
            )}
          </dl>

          {canManage && event.deleted_at && (
            <div className="border-t border-border pt-3">
              <RestoreDeletedEventForm
                eventId={event.id}
                seriesId={seriesData?.id}
                revision={seriesData?.revision}
                requestKey={crypto.randomUUID()}
              />
            </div>
          )}
          {canManage && !event.deleted_at && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 [&>form]:w-auto">
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

        <section
          aria-label="Participation"
          className="min-w-0 space-y-3.5 rounded-lg border border-border bg-surface p-5 lg:sticky lg:top-6 [&>.section-heading:first-child]:mt-0"
        >
          <SectionHeading title="Participation" />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/40 px-3.5 py-2.5 text-sm">
            <span className="text-foreground">
              Your participation:{" "}
              <strong className="font-semibold">
                {confirmed
                  ? personalParticipationType === "volunteer"
                    ? "Volunteer"
                    : "Attend"
                  : "Not signed up"}
              </strong>
            </span>
            <span className="text-xs font-medium tabular-nums text-muted">
              {event.max_volunteers === null
                ? `${confirmedCount} confirmed`
                : `${confirmedCount} / ${event.max_volunteers} confirmed`}
            </span>
          </div>
          {durationHours > 0 && timeSlots.length === 0 && (
            <p className="text-xs text-muted">
              Estimated points ({durationLabel}):{" "}
              <strong className="font-medium text-foreground">
                +{estimatedVolunteerPoints} pts Volunteer
              </strong>{" "}
              ·{" "}
              <strong className="font-medium text-foreground">
                +{estimatedAttendeePoints} pts Attend
              </strong>
            </p>
          )}
          {full && !confirmed && signupOpen && (
            <p className="text-sm text-muted">
              This Event is full. Signup is unavailable.
            </p>
          )}
          {personalSignup === "confirmed" &&
            signupOpen &&
            timeSlots.length === 0 && (
              <div className="flex flex-wrap items-center gap-2 [&>form]:w-auto">
                <SelfSignupForm
                  eventId={event.id}
                  eventName={event.name}
                  currentType={
                    personalParticipationType === "attendee"
                      ? "attendee"
                      : "volunteer"
                  }
                />
                <SignupForm eventId={event.id} officerId={actor.id} remove />
              </div>
            )}
          {timeSlots.length === 0 &&
            (personalSignup === "available" || personalSignup === "full") && (
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
              pointsPerHour={volunteerRate}
              period={
                typeof query.period === "string" ? query.period : undefined
              }
            />
          )}
          {canManageCurrentRoster &&
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
          {canManageCurrentRoster &&
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
                  timeSlots={timeSlots.map(
                    ({
                      id,
                      starts_at,
                      ends_at,
                      capacity,
                      event_time_slot_officers,
                    }) => ({
                      id,
                      starts_at,
                      ends_at,
                      capacity,
                      registeredCount: event_time_slot_officers.filter(
                        ({ event_officers }) =>
                          event_officers?.removed_at == null,
                      ).length,
                    }),
                  )}
                  pointsPerHour={event.participation_points_per_hour_at_end}
                  past={past}
                />
              </details>
            )}
        </section>
      </div>

      <section
        aria-label="Confirmed roster"
        className="space-y-3 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
      >
        <SectionHeading
          title={`Confirmed roster (${confirmedCount})`}
          description={
            confirmedCount > 0
              ? `${volunteerCount} Volunteer${volunteerCount === 1 ? "" : "s"} · ${attendeeCount} Attendee${attendeeCount === 1 ? "" : "s"} · Listed alphabetically.`
              : "Officers are listed alphabetically."
          }
        />
        {rosterRows.length ? (
          <EventRosterTableClient
            showTimeSlots={timeSlots.length > 0}
            canCopyEmails={canManageCurrentRoster}
            rows={rosterRows.map(
              ({ officers: officer, participation_type }) => ({
                id: officer.id,
                participationType:
                  participation_type === "attendee" ? "attendee" : "volunteer",
                email: officer.utep_email ?? officer.personal_email ?? null,
                row: (
                  <tr key={officer.id}>
                    <td>
                      <Link
                        href={withReturnTo(
                          `/officers/${officer.id}`,
                          contextualReturnTo,
                        )}
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
                      <div className="flex flex-wrap items-center gap-3 [&>form]:w-auto">
                        <span>
                          {participation_type === "volunteer"
                            ? "Volunteer"
                            : "Attend"}
                        </span>
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
                          <span className="text-xs text-muted">Closed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              }),
            )}
          />
        ) : (
          <p className="text-sm text-muted">No officers signed up.</p>
        )}
      </section>

      <PresenterSlotsSection
        slots={presenterSlotsResult.data ?? []}
        period={typeof query.period === "string" ? query.period : undefined}
      />

      <EventLinkedTasksSection
        linkedTasks={linkedTasks}
        contextualReturnTo={contextualReturnTo}
      />

      <EventPointHistorySection
        eventId={event.id}
        transactions={transactions}
        period={typeof query.period === "string" ? query.period : undefined}
      />
    </div>
  );
}
