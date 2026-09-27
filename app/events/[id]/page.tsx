import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { eventStatus, displayDate } from "@/lib/event-status";
import { SignupForm, CancelForm } from "../event-controls";
export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const [result, officers] = await Promise.all([
    supabase
      .from("events")
      .select(
        "*,event_branches(branches(name)),event_officers(officers(id,name))",
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
  const signupOpen = status === "upcoming" || status === "happening";
  return (
    <>
      <h1>{event.name}</h1>
      <p>{event.description || "No description"}</p>
      <dl>
        <dt>Type</dt>
        <dd>{event.type}</dd>
        <dt>Location</dt>
        <dd>{event.location || "Not set"}</dd>
        <dt>Start</dt>
        <dd>{displayDate(event.starts_at)}</dd>
        <dt>End</dt>
        <dd>{displayDate(event.ends_at)}</dd>
        <dt>Status</dt>
        <dd>{status}</dd>
        <dt>Branches</dt>
        <dd>{event.event_branches.map((x) => x.branches.name).join(", ")}</dd>
      </dl>
      {status === "upcoming" && (
        <p>
          <Link href={`/events/${id}/edit`}>Edit event</Link>
        </p>
      )}
      {signupOpen && <CancelForm eventId={event.id} />}
      <h2>Signed-up officers</h2>
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
                {signupOpen ? (
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
      {!event.event_officers.length && <p>No officers signed up.</p>}
      {signupOpen && (
        <SignupForm
          eventId={event.id}
          officers={officers.data.filter(
            (officer) =>
              !event.event_officers.some((x) => x.officers.id === officer.id),
          )}
        />
      )}
    </>
  );
}
