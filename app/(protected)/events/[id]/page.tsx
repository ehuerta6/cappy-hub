import {
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import ContextualBackLink from "@/components/contextual-back-link";
import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import PointTransactionTable from "@/components/point-transaction-table";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventResourceLinks from "../event-resource-links";
import {
  eventStatus,
  eventSignupOpen,
  participationLabel,
} from "@/lib/event-status";
import { formatDateTime } from "@/lib/presentation";
import {
  BulkAddOfficersForm,
  SignupForm,
  CancelForm,
  RestoreEventForm,
  RemoveEventForm,
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
export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const { returnTo, feedback } = (await searchParams) ?? {};
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const { id: eventIdParam } = await params;
  if (!/^-?[1-9]\d*$/.test(eventIdParam)) notFound();
  const eventId = Number(eventIdParam);
  const [result, officers] = await Promise.all([
    supabase
      .from("events")
      .select(
        "*,event_types(name),event_branches(branch_id,branches(name)),event_officers(officers(id,name))",
      )
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("officers")
      .select("id,name")
      .eq("status", "active")
      .order("name"),
  ]);
  if (result.error || officers.error) throw new Error("Failed to load event");
  if (!result.data) notFound();
  const event = result.data;
  const sortedEventOfficers = [...event.event_officers].sort(
    (left, right) =>
      left.officers.name.localeCompare(right.officers.name, "en", {
        sensitivity: "base",
      }) ||
      left.officers.name.localeCompare(right.officers.name, "en") ||
      left.officers.id - right.officers.id,
  );
  const status = eventStatus(event);
  const signupOpen = eventSignupOpen(event);
  const past = status === "past";
  const canManage = canManageEvent(
    actor,
    event.event_branches.map((eventBranch) => eventBranch.branch_id),
  );
  const transactions = await supabase
    .from("point_transactions")
    .select(
      "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
    )
    .is("removed_at", null)
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (transactions.error) throw new Error("Failed to load event points");
  const series =
    event.recurrence_series_id === null
      ? undefined
      : await supabase
          .from("event_series")
          .select("id,revision,recurrence_rule")
          .eq("id", event.recurrence_series_id)
          .single();
  if (series?.error) throw new Error("Failed to load recurring series");
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
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section
          aria-label="Event details"
          className="min-w-0 space-y-4 rounded-lg border border-border p-4"
        >
          <SectionHeading title="Event details" />
          <p className="whitespace-pre-wrap break-words">
            {event.description || "No description"}
          </p>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm [&>dt]:mt-0 [&>dd]:mt-0 [&>dd]:min-w-0 [&>dd]:break-words">
            <dt>Type</dt>
            <dd>{event.event_types.name}</dd>
            <dt>Location</dt>
            <dd className="break-words">{event.location || "Not set"}</dd>
            <dt>Date</dt>
            <dd>{event.event_date}</dd>
            <dt>Start</dt>
            <dd>{formatDateTime(event.starts_at)}</dd>
            <dt>End</dt>
            <dd>{formatDateTime(event.ends_at)}</dd>
            {event.deleted_at && (
              <>
                <dt>Removed at</dt>
                <dd>{formatDateTime(event.deleted_at)}</dd>
              </>
            )}
            <dt>Processing</dt>
            <dd>
              {event.participation_points_per_hour_at_end === null
                ? "Not processed"
                : `${event.participation_points_per_hour_at_end} points/hour`}
            </dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={status} />
            </dd>
            <dt>Branches</dt>
            <dd>
              <BranchBadges
                branches={event.event_branches.map(
                  (eventBranch) => eventBranch.branches.name,
                )}
              />
            </dd>
          </dl>
          <EventResourceLinks
            slidesUrl={event.slides_url}
            meetingNotesUrl={event.meeting_notes_url}
            signupSheetUrl={event.signup_sheet_url}
          />
          {canManage && !event.deleted_at && (
            <div className="flex flex-wrap gap-3 [&>form]:w-auto">
              {status === "cancelled" && (
                <RestoreEventForm eventId={event.id} />
              )}
              {signupOpen && (
                <CancelForm
                  eventId={event.id}
                  series={series?.data ?? undefined}
                  requestKey={crypto.randomUUID()}
                />
              )}
              <RemoveEventForm
                eventId={event.id}
                series={series?.data ?? undefined}
                requestKey={crypto.randomUUID()}
              />
            </div>
          )}
        </section>
        <section
          aria-label="Participation"
          className="min-w-0 space-y-4 rounded-lg border border-border p-4"
        >
          <p>
            Your participation:{" "}
            {participationLabel(
              event.event_officers.some(
                ({ officers: officer }) => officer.id === actor.id,
              ),
            )}
          </p>
          <section className="space-y-3">
            <SectionHeading title="Signed-up officers" />
            {event.event_officers.length ? (
              <TableFrame compact>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th>Officer</th>
                      <th>Signup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEventOfficers.map(({ officers: officer }) => (
                      <tr key={officer.id}>
                        <td>
                          <Link href={`/officers/${officer.id}`}>
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
            {signupOpen && canManage && (
              <BulkAddOfficersForm
                eventId={event.id}
                officers={officers.data.filter(
                  (officer) =>
                    !event.event_officers.some(
                      (eventSignup) => eventSignup.officers.id === officer.id,
                    ),
                )}
              />
            )}
            {signupOpen && !canManage && (
              <SignupForm
                eventId={event.id}
                officers={officers.data.filter(
                  (officer) =>
                    officer.id === actor.id &&
                    !event.event_officers.some(
                      (eventSignup) => eventSignup.officers.id === officer.id,
                    ),
                )}
              />
            )}
            {canManage && past && !event.deleted_at && (
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
                officers={officers.data.filter(
                  (officer) =>
                    !event.event_officers.some(
                      (eventSignup) => eventSignup.officers.id === officer.id,
                    ),
                )}
              />
            )}
          </section>
        </section>
      </div>
      <section>
        <SectionHeading
          title="Event point history"
          description="Latest 100 transactions"
        />
        <TableFrame compact>
          <PointTransactionTable transactions={transactions.data} />
        </TableFrame>
        <Link
          href={`/points?event=${event.id}`}
          className="mt-3 inline-block text-sm underline"
        >
          View all event point history
        </Link>
      </section>
    </div>
  );
}
