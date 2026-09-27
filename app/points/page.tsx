import Link from "next/link";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  processCompletedEvents,
  displayPoints,
  participationPointsPerHour,
} from "@/lib/participation";
import TransactionForm from "./transaction-form";
import TransactionTable from "./transaction-table";
export default async function PointsPage() {
  await connection();
  await processCompletedEvents();
  const [transactions, totals, officers, events] = await Promise.all([
    supabase
      .from("point_transactions")
      .select("*,officers(id,name),events(id,name)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50),
    supabase.from("officer_point_totals").select("*").order("name"),
    supabase.from("officers").select("id,name").order("name"),
    supabase
      .from("events")
      .select("id,name")
      .order("starts_at", { ascending: false }),
  ]);
  if (transactions.error || totals.error || officers.error || events.error)
    throw new Error("Failed to load points");
  return (
    <>
      <h1>Points</h1>
      <p>
        Participation: {participationPointsPerHour} points per scheduled hour.
        Ended events are processed when data is loaded.
      </p>
      <h2>Officer totals</h2>
      <table>
        <thead>
          <tr>
            <th>Officer</th>
            <th>Total points</th>
          </tr>
        </thead>
        <tbody>
          {totals.data.map((officer) => (
            <tr key={officer.id}>
              <td>
                <Link href={`/officers/${officer.id}`}>{officer.name}</Link>
              </td>
              <td>{displayPoints(officer.total_points ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Add manual transaction / correction</h2>
      <TransactionForm officers={officers.data} events={events.data} />
      <h2>Recent transactions (50)</h2>
      <TransactionTable transactions={transactions.data} />
    </>
  );
}
