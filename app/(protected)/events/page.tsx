import { getAuthorizationContext, isAdmin, isLead } from "@/lib/authorization";
import Link from "next/link";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import { eventStatus, displayDate } from "@/lib/event-status";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
export default async function EventsPage() {
  const actor = await getAuthorizationContext();
  await connection();
  const { data, error } = await supabase
    .from("events")
    .select(
      "*,event_types(name),event_branches(branches(name)),event_officers(officer_id)",
    )
    .order("starts_at", { ascending: false });
  if (error) throw new Error("Failed to load events");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description="Scheduled club events and participation."
        action={
          isAdmin(actor) || (isLead(actor) && actor.branchIds.length > 0) ? (
            <ActionLink href="/events/new">+ New event</ActionLink>
          ) : undefined
        }
      />
      <TableFrame>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Start</th>
              <th>Type</th>
              <th>Branches</th>
              <th>Officers</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((event) => (
              <tr key={event.id}>
                <td>
                  <Link href={`/events/${event.id}`}>{event.name}</Link>
                </td>
                <td>{displayDate(event.starts_at)}</td>
                <td>{event.event_types.name}</td>
                <td>
                  <BranchBadges
                    branches={event.event_branches.map((x) => x.branches.name)}
                  />
                </td>
                <td className="tabular-nums">{event.event_officers.length}</td>
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
