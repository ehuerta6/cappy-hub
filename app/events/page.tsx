import Link from "next/link";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import { eventStatus, displayDate } from "@/lib/event-status";
export default async function EventsPage() {
  await connection();
  const { data, error } = await supabase
    .from("events")
    .select("*,event_branches(branches(name)),event_officers(officer_id)")
    .order("starts_at", { ascending: false });
  if (error) throw new Error("Failed to load events");
  return (
    <>
      <h1>Events</h1>
      <Link href="/events/new">New event</Link>
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
              <td>{event.type}</td>
              <td>
                {event.event_branches.map((x) => x.branches.name).join(", ")}
              </td>
              <td>{event.event_officers.length}</td>
              <td>{eventStatus(event)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && <p>No events yet.</p>}
    </>
  );
}
