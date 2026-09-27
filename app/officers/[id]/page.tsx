import TransactionTable from "@/app/points/transaction-table";
import { displayPoints } from "@/lib/participation";
import { eventStatus, displayDate } from "@/lib/event-status";
import { processCompletedEvents } from "@/lib/participation";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default async function OfficerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  await processCompletedEvents();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const { data: officer, error } = await supabase
    .from("officers")
    .select("*, positions(name), officer_branches(branches(name))")
    .eq("id", Number(id))
    .maybeSingle();
  if (error) throw new Error(`Failed to load officer: ${error.message}`);
  if (!officer) notFound();
  const [total, events, transactions] = await Promise.all([
    supabase
      .from("officer_point_totals")
      .select("total_points")
      .eq("id", Number(id))
      .single(),
    supabase
      .from("event_officers")
      .select("events(*)")
      .eq("officer_id", Number(id)),
    supabase
      .from("point_transactions")
      .select("*,officers(id,name),events(id,name)")
      .eq("officer_id", Number(id))
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
  ]);
  if (total.error || events.error || transactions.error)
    throw new Error("Failed to load officer history");
  return (
    <>
      <h1>{officer.name}</h1>
      <p>
        <Link href={`/officers/${id}/edit`}>Edit officer / change status</Link>
      </p>
      <dl>
        <dt>Email</dt>
        <dd>{officer.email}</dd>
        <dt>Position</dt>
        <dd>{officer.positions.name}</dd>
        <dt>Classification</dt>
        <dd>{officer.classification}</dd>
        <dt>Status</dt>
        <dd>{officer.status}</dd>
        <dt>Branches</dt>
        <dd>
          {officer.officer_branches
            .map((membership) => membership.branches.name)
            .join(", ") || "None"}
        </dd>
      </dl>
      <h2>Total points: {displayPoints(total.data.total_points ?? 0)}</h2>
      <h2>Associated events</h2>
      {!events.data.length && <p>No associated events yet.</p>}
      <ul>
        {events.data.map(({ events: event }) => (
          <li key={event.id}>
            <Link href={`/events/${event.id}`}>{event.name}</Link> —{" "}
            {displayDate(event.starts_at)} — {eventStatus(event)}
          </li>
        ))}
      </ul>
      <h2>Point history (latest 100)</h2>
      <TransactionTable transactions={transactions.data} />
    </>
  );
}
