import {
  getAuthorizationContext,
  isAdmin,
  isLead,
  canSeeAllBranches,
} from "@/lib/authorization";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eventStatus, participationLabel } from "@/lib/event-status";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const showRemoved = isAdmin(actor) && (await searchParams).removed === "1";
  let query = supabase
    .from("events")
    .select(
      "*,event_types(name),event_branches(branches(name)),event_officers(officer_id)",
    )
    .order("event_date", { ascending: false });
  query = showRemoved
    ? query.not("deleted_at", "is", null)
    : query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) throw new Error("Failed to load events");
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
      {isAdmin(actor) && (
        <Link
          href={showRemoved ? "/events" : "/events?removed=1"}
          className="text-sm underline"
        >
          {showRemoved ? "Active events" : "Removed event history"}
        </Link>
      )}
      <TableFrame>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Date</th>
              <th>Type</th>
              <th>Branches</th>
              <th>Officers</th>
              <th>Your participation</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((event) => (
              <tr key={event.id}>
                <td>
                  <Link href={`/events/${event.id}`}>{event.name}</Link>
                </td>
                <td>{event.event_date}</td>
                <td>{event.event_types.name}</td>
                <td>
                  <BranchBadges
                    branches={event.event_branches.map((x) => x.branches.name)}
                  />
                </td>
                <td className="tabular-nums">{event.event_officers.length}</td>
                <td>
                  {participationLabel(
                    event.event_officers.some(
                      (signup) => signup.officer_id === actor.id,
                    ),
                  )}
                </td>
                <td>
                  <StatusBadge status={eventStatus(event)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
      {!data.length && <p>No events yet.</p>}
    </div>
  );
}
