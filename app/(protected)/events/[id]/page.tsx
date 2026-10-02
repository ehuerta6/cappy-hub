import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import TransactionTable from "@/app/(protected)/points/transaction-table";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  RemoveEventForm,
} from "../event-controls";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  SectionHeading,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const { id } = await params;
  if (!/^-?[1-9]\d*$/.test(id)) notFound();
  const [result, officers] = await Promise.all([
    supabase
      .from("events")
      .select(
        "*,event_types(name),event_branches(branch_id,branches(name)),event_officers(officers(id,name))",
      )
      .eq("id", Number(id))
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
  const status = eventStatus(event);
  const signupOpen = eventSignupOpen(event);
  const past = status === "past";
  const canManage = canManageEvent(
    actor,
    event.event_branches.map((x) => x.branch_id),
  );
  const transactions = await supabase
    .from("point_transactions")
    .select("*,officers(id,name),events(id,name),tasks(id,title)")
    .is("removed_at", null)
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (transactions.error) throw new Error("Failed to load event points");
  return (
    <div className="space-y-8">
      <PageHeader
        title={event.name}
        description={event.description || "No description"}
        action={
          canManage && !event.deleted_at && status !== "cancelled" ? (
            <ActionLink href={`/events/${id}/edit`}>Edit event</ActionLink>
          ) : undefined
        }
      />
      <dl className="grid max-w-2xl grid-cols-[7rem_1fr] gap-x-5 gap-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-sm">
        <dt>Type</dt>
        <dd>{event.event_types.name}</dd>
        <dt>Location</dt>
        <dd>{event.location || "Not set"}</dd>
        {event.slides_url && (
          <>
            <dt>Slides</dt>
            <dd>
              <a
                href={event.slides_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open slides
              </a>
            </dd>
          </>
        )}
        {event.meeting_notes_url && (
          <>
            <dt>Meeting notes</dt>
            <dd>
              <a
                href={event.meeting_notes_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open notes
              </a>
            </dd>
          </>
        )}
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
            branches={event.event_branches.map((x) => x.branches.name)}
          />
        </dd>
      </dl>
      {canManage && !event.deleted_at && (
        <div className="flex gap-3">
          {signupOpen && <CancelForm eventId={event.id} />}
          <RemoveEventForm eventId={event.id} />
        </div>
      )}
      <p>
        Your participation:{" "}
        {participationLabel(
          event.event_officers.some(
            ({ officers: officer }) => officer.id === actor.id,
          ),
        )}
      </p>
      <section>
        <SectionHeading title="Signed-up officers" />
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th>Officer</th>
                <th>Signup</th>
              </tr>
            </thead>
            <tbody>
              {event.event_officers.map(({ officers: officer }) => (
                <tr key={officer.id}>
                  <td>
                    <Link href={`/officers/${officer.id}`}>{officer.name}</Link>
                  </td>
                  <td>
                    {signupOpen && (canManage || officer.id === actor.id) ? (
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
        {!event.event_officers.length && <p>No officers signed up.</p>}
        {signupOpen && canManage && (
          <BulkAddOfficersForm
            eventId={event.id}
            officers={officers.data.filter(
              (officer) =>
                !event.event_officers.some((x) => x.officers.id === officer.id),
            )}
          />
        )}
        {signupOpen && !canManage && (
          <SignupForm
            eventId={event.id}
            officers={officers.data.filter(
              (officer) =>
                officer.id === actor.id &&
                !event.event_officers.some((x) => x.officers.id === officer.id),
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
                !event.event_officers.some((x) => x.officers.id === officer.id),
            )}
          />
        )}
      </section>
      <section>
        <SectionHeading
          title="Event point history"
          description="Latest 100 transactions"
        />
        <TableFrame>
          <TransactionTable transactions={transactions.data} />
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
