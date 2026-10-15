import {
  safeReturnTo,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import ContextualBackLink from "@/components/contextual-back-link";
import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import PointTransactionTable from "@/components/point-transaction-table";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventResourceLinks from "../event-resource-links";
import { eventStatus, eventSignupOpen } from "@/lib/event-status";
import { personalSignupState } from "../personal-signup-state";
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
  CancelForm,
  RestoreCancelledEventForm,
  RestoreArchivedEventForm,
  RemoveEventForm,
  LeaveWaitlistForm,
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
type EventSection = "overview" | "roster" | "waitlist" | "tasks" | "points";

function requestedSection(value: string | string[] | undefined): EventSection {
  return value === "roster" ||
    value === "waitlist" ||
    value === "tasks" ||
    value === "points"
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
  counts: { roster: number; waitlist?: number; tasks: number; points: number };
}) {
  const sections: { id: EventSection; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "roster", label: "Roster", count: counts.roster },
    ...(counts.waitlist === undefined
      ? []
      : [
          {
            id: "waitlist" as const,
            label: "Waitlist",
            count: counts.waitlist,
          },
        ]),
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
  return (
    <nav
      aria-label={`${section} pages`}
      className="flex items-center justify-between gap-4 text-sm"
    >
      {page > 1 ? (
        <Link
          href={sectionHref(eventId, section, page - 1, returnTo)}
          className="min-h-9 underline underline-offset-4"
        >
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span aria-live="polite">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={sectionHref(eventId, section, page + 1, returnTo)}
          className="min-h-9 underline underline-offset-4"
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
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
  const requestedSectionName = requestedSection(query.section);
  const requested = requestedPage(query.page);
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const { id: eventIdParam } = await params;
  if (!/^-?[1-9]\d*$/.test(eventIdParam)) notFound();
  const eventId = Number(eventIdParam);
  const [result, officers] = await Promise.all([
    supabase
      .from("events")
      .select(
        "*,event_types(name),event_branches(branch_id,branches(name)),event_officers(officers(id,name)),event_waitlist(id,joined_at,officer_id,officers(id,name,status)),task_events(tasks(id,title,removed_at))",
      )
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("officers")
      .select("id,name")
      .eq("status", "active")
      .order("name"),
  ]);
  const countsResult = await supabase.rpc("event_signup_counts");
  if (result.error || officers.error || countsResult.error)
    throw new Error("Failed to load event");
  if (!result.data) notFound();
  const event = result.data;
  const signupCounts = countsResult.data.find(
    (row) => row.event_id === event.id,
  );
  const confirmedCount = Number(
    signupCounts?.confirmed_count ?? event.event_officers.length,
  );
  const waitlistCount = Number(
    signupCounts?.waitlist_count ?? event.event_waitlist.length,
  );
  const waitlisted = event.event_waitlist.some(
    ({ officer_id }) => officer_id === actor.id,
  );
  const confirmed = event.event_officers.some(
    ({ officers: officer }) => officer.id === actor.id,
  );
  const sortedWaitlist = [...event.event_waitlist].sort(
    (left, right) =>
      left.joined_at.localeCompare(right.joined_at) || left.id - right.id,
  );
  const sortedEventOfficers = [...event.event_officers].sort(
    (left, right) =>
      left.officers.name.localeCompare(right.officers.name, "en", {
        sensitivity: "base",
      }) ||
      left.officers.name.localeCompare(right.officers.name, "en") ||
      left.officers.id - right.officers.id,
  );
  const linkedTasks = event.task_events
    .map(({ tasks }) => tasks)
    .sort(
      (left, right) =>
        left.title.localeCompare(right.title, "en", { sensitivity: "base" }) ||
        left.id - right.id,
    );
  const status = eventStatus(event);
  const signupOpen = !event.deleted_at && eventSignupOpen(event);
  const past = status === "past";
  const canManage = canManageEvent(
    actor,
    event.event_branches.map((eventBranch) => eventBranch.branch_id),
  );
  const section =
    requestedSectionName === "waitlist" && !canManage
      ? "overview"
      : requestedSectionName;
  const eligibleForSelfSignup = officers.data.some(
    (officer) => officer.id === actor.id,
  );
  const full =
    event.max_volunteers !== null && confirmedCount >= event.max_volunteers;
  const personalSignup = personalSignupState({
    open: signupOpen,
    confirmed,
    waitlisted,
    eligible: eligibleForSelfSignup,
    full,
  });
  const officersAvailableToAdd = officers.data.filter(
    (officer) =>
      !event.event_officers.some(
        (eventSignup) => eventSignup.officers.id === officer.id,
      ) &&
      !event.event_waitlist.some((entry) => entry.officer_id === officer.id),
  );
  if (event.deleted_at && !canManage) notFound();

  const [pointCountResult, series] = await Promise.all([
    supabase
      .from("point_transactions")
      .select("id", { count: "exact", head: true })
      .is("removed_at", null)
      .eq("event_id", event.id),
    event.recurrence_series_id === null
      ? Promise.resolve(undefined)
      : supabase
          .from("event_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", event.recurrence_series_id)
          .single(),
  ]);
  if (pointCountResult.error)
    throw new Error("Failed to load event point count");
  if (series?.error) throw new Error("Failed to load recurring series");

  const pointCount = pointCountResult.count ?? 0;
  const sectionCount =
    section === "roster"
      ? sortedEventOfficers.length
      : section === "waitlist"
        ? sortedWaitlist.length
        : section === "tasks"
          ? linkedTasks.length
          : pointCount;
  const totalPages = Math.max(1, Math.ceil(sectionCount / RELATED_PAGE_SIZE));
  const page = Math.min(requested, totalPages);
  const start = (page - 1) * RELATED_PAGE_SIZE;
  const transactionsResult =
    section === "points"
      ? await supabase
          .from("point_transactions")
          .select(
            "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
          )
          .is("removed_at", null)
          .eq("event_id", event.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(start, start + RELATED_PAGE_SIZE - 1)
      : undefined;
  if (transactionsResult?.error) throw new Error("Failed to load event points");
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
          roster: event.event_officers.length,
          ...(canManage && waitlistCount > 0
            ? { waitlist: waitlistCount }
            : {}),
          tasks: linkedTasks.length,
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
                    status={event.deleted_at ? "Archived" : status}
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
                    <dt>Archived at</dt>
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
                <RestoreArchivedEventForm eventId={event.id} />
              )}
              {canManage && !event.deleted_at && (
                <div className="flex flex-wrap gap-3 [&>form]:w-auto">
                  {status === "cancelled" && (
                    <RestoreCancelledEventForm eventId={event.id} />
                  )}
                  {signupOpen && (
                    <CancelForm
                      eventId={event.id}
                      series={seriesData}
                      requestKey={crypto.randomUUID()}
                    />
                  )}
                  <RemoveEventForm
                    eventId={event.id}
                    series={seriesData}
                    requestKey={crypto.randomUUID()}
                  />
                </div>
              )}
            </section>

            <section aria-label="Participation" className="min-w-0 space-y-3">
              <SectionHeading title="Participation" />
              <p className="text-sm">
                Your participation:{" "}
                {confirmed
                  ? "Confirmed"
                  : waitlisted
                    ? "Waitlisted"
                    : "Not signed up"}
              </p>
              <p className="text-sm text-muted">
                {event.max_volunteers === null
                  ? `${confirmedCount} confirmed`
                  : `${confirmedCount} / ${event.max_volunteers} confirmed`}
                {waitlistCount > 0 ? ` · ${waitlistCount} waitlisted` : ""}
              </p>
              {personalSignup === "waitlisted" && (
                <LeaveWaitlistForm eventId={event.id} />
              )}
              {!canManage &&
                (personalSignup === "available" ||
                  personalSignup === "full") && (
                  <SelfSignupForm
                    eventId={event.id}
                    eventName={event.name}
                    full={personalSignup === "full"}
                  />
                )}
              {event.event_officers.length > 0 ? (
                <div>
                  <h3 className="mb-1 text-sm font-medium">
                    Confirmed roster ({event.event_officers.length})
                  </h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {sortedEventOfficers
                      .slice(0, 3)
                      .map(({ officers: officer }) => (
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
              {canManage && waitlistCount > 0 && (
                <Link
                  href={sectionHref(eventIdParam, "waitlist", 1, returnTo)}
                  className="inline-block text-sm underline underline-offset-4"
                >
                  View waitlist ({waitlistCount})
                </Link>
              )}
              {canManage &&
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
            </section>
          </div>
          {linkedTasks.length > 0 && (
            <p className="text-sm">
              <Link
                href={sectionHref(eventIdParam, "tasks", 1, returnTo)}
                className="underline underline-offset-4"
              >
                Linked Tasks ({linkedTasks.length})
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
            title={`Confirmed roster (${event.event_officers.length})`}
            description="Officers are listed alphabetically."
          />
          <EventSectionPagination
            eventId={eventIdParam}
            section="roster"
            page={page}
            totalPages={totalPages}
            returnTo={returnTo}
          />
          {sortedEventOfficers.length ? (
            <TableFrame compact label="Event signups">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th scope="col">Officer</th>
                    <th scope="col">Signup</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEventOfficers
                    .slice(start, start + RELATED_PAGE_SIZE)
                    .map(({ officers: officer }) => (
                      <tr key={officer.id}>
                        <td>
                          <Link
                            href={`/officers/${officer.id}`}
                            className="underline underline-offset-4"
                          >
                            {officer.name}
                          </Link>
                        </td>
                        <td>
                          {signupOpen &&
                          (canManage || officer.id === actor.id) ? (
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

      {section === "waitlist" && canManage && (
        <section aria-label="Waitlist" className="space-y-3">
          <SectionHeading
            title={`Waitlist (${sortedWaitlist.length})`}
            description="Order is based on when each Officer joined."
          />
          <EventSectionPagination
            eventId={eventIdParam}
            section="waitlist"
            page={page}
            totalPages={totalPages}
            returnTo={returnTo}
          />
          {sortedWaitlist.length ? (
            <ol start={start + 1} className="list-decimal space-y-2 pl-5">
              {sortedWaitlist
                .slice(start, start + RELATED_PAGE_SIZE)
                .map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/officers/${entry.officers.id}`}
                      className="underline underline-offset-4"
                    >
                      {entry.officers.name}
                    </Link>
                    {entry.officers.status !== "active" && (
                      <span className="ml-2 text-sm text-muted">
                        Inactive; skipped for promotion
                      </span>
                    )}
                  </li>
                ))}
            </ol>
          ) : (
            <p>No officers are waitlisted.</p>
          )}
          <EventSectionPagination
            eventId={eventIdParam}
            section="waitlist"
            page={page}
            totalPages={totalPages}
            returnTo={returnTo}
          />
        </section>
      )}

      {section === "tasks" && (
        <section aria-label="Linked Tasks" className="space-y-3">
          <SectionHeading title={`Linked Tasks (${linkedTasks.length})`} />
          {linkedTasks.length ? (
            <ul className="list-disc space-y-2 pl-5">
              {linkedTasks
                .slice(start, start + RELATED_PAGE_SIZE)
                .map((linkedTask) => (
                  <li key={linkedTask.id}>
                    <Link
                      href={`/tasks/${linkedTask.id}`}
                      className="underline underline-offset-4"
                    >
                      {linkedTask.title}
                    </Link>
                    {linkedTask.removed_at && (
                      <span className="ml-2 text-sm text-muted">Archived</span>
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
