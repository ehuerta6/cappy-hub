import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import TransactionTable from "@/app/(protected)/points/transaction-table";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { eventStatus, displayDateTime } from "@/lib/event-status";
import { SignupForm, CancelForm } from "../event-controls";
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
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
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
  const signupOpen = status === "upcoming" || status === "happening";
  const canManage = canManageEvent(
    actor,
    event.event_branches.map((x) => x.branch_id),
  );
  const transactions = await supabase
    .from("point_transactions")
    .select("*,officers(id,name),events(id,name)")
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
          status === "upcoming" && canManage ? (
            <ActionLink href={`/events/${id}/edit`}>Edit event</ActionLink>
          ) : undefined
        }
      />
      <dl className="grid max-w-2xl grid-cols-[7rem_1fr] gap-x-5 gap-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-sm">
        <dt>Type</dt>
        <dd>{event.event_types.name}</dd>
        <dt>Location</dt>
        <dd>{event.location || "Not set"}</dd>
        <dt>Start</dt>
        <dd>{displayDateTime(event.starts_at)}</dd>
        <dt>End</dt>
        <dd>{displayDateTime(event.ends_at)}</dd>
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
      {signupOpen && canManage && <CancelForm eventId={event.id} />}
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
        {signupOpen && (
          <SignupForm
            eventId={event.id}
            officers={(canManage
              ? officers.data
              : officers.data.filter((officer) => officer.id === actor.id)
            ).filter(
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
      </section>
    </div>
  );
}
