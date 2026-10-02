import {
  getAuthorizationContext,
  isAdmin,
  isLead,
  canSeeAllBranches,
} from "@/lib/authorization";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eventStatus, eventSignupOpen } from "@/lib/event-status";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  SectionHeading,
  StatusBadge,
  TableFrame,
} from "@/components/ui";
import { SelfSignupForm } from "./event-controls";

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
  const yourEvents = data.filter((event) =>
    event.event_officers.some((signup) => signup.officer_id === actor.id),
  );
  const otherEvents = data.filter(
    (event) =>
      !event.event_officers.some((signup) => signup.officer_id === actor.id),
  );
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
      {[
        {
          title: "Your events",
          events: yourEvents,
          empty: "You are not signed up for any events.",
          allowSignup: false,
        },
        {
          title: "Other events",
          events: otherEvents,
          empty: "No other events available.",
          allowSignup: true,
        },
      ].map(({ title, events, empty, allowSignup }) => (
        <section key={title} aria-label={title}>
          <SectionHeading title={title} />
          {!events.length ? (
            <p>{empty}</p>
          ) : (
            <TableFrame>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Date</th>
                    <th scope="col">Type</th>
                    <th scope="col">Branches</th>
                    <th scope="col">Officers</th>
                    <th scope="col">Status</th>
                    {allowSignup && <th scope="col">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <Link href={`/events/${event.id}`}>{event.name}</Link>
                      </td>
                      <td>{event.event_date}</td>
                      <td>{event.event_types.name}</td>
                      <td>
                        <BranchBadges
                          branches={event.event_branches.map(
                            (x) => x.branches.name,
                          )}
                        />
                      </td>
                      <td className="tabular-nums">
                        {event.event_officers.length}
                      </td>
                      <td>
                        <StatusBadge status={eventStatus(event)} />
                      </td>
                      {allowSignup && (
                        <td>
                          {eventSignupOpen(event) && (
                            <SelfSignupForm
                              eventId={event.id}
                              eventName={event.name}
                            />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
          )}
        </section>
      ))}
    </div>
  );
}
