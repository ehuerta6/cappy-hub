import Link from "next/link";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  processCompletedEvents,
  participationPointsPerHour,
} from "@/lib/participation";
import TransactionForm from "./transaction-form";
import TransactionTable from "./transaction-table";
import {
  PageHeader,
  PointValue,
  SectionHeading,
  TableFrame,
} from "@/components/ui";
export default async function PointsPage() {
  await connection();
  await processCompletedEvents();
  const rateUnit = participationPointsPerHour === 1 ? "point" : "points";
  const [transactions, totals, officers, events] = await Promise.all([
    supabase
      .from("point_transactions")
      .select("*,officers(id,name),events(id,name)")
      .is("removed_at", null)
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
    <div className="space-y-8">
      <PageHeader
        title="Points"
        description={`Participation: ${participationPointsPerHour} ${rateUnit} per scheduled hour. Ended events are processed when data is loaded.`}
      />
      <section>
        <SectionHeading title="Officer totals" />
        <TableFrame>
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
                  <td>
                    <PointValue value={officer.total_points ?? 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </section>
      <section>
        <SectionHeading title="Add manual transaction or correction" />
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
          <TransactionForm officers={officers.data} events={events.data} />
        </div>
      </section>
      <section>
        <SectionHeading
          title="Recent transactions"
          description="Latest 50 transactions"
        />
        <TableFrame>
          <TransactionTable transactions={transactions.data} />
        </TableFrame>
      </section>
    </div>
  );
}
