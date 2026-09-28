import { requireCurrentOfficer } from "@/lib/current-officer";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { displayPoints } from "@/lib/participation";
import { displayDate } from "@/lib/event-status";
import TransactionTable from "./points/transaction-table";
import { PageHeader, SectionHeading, TableFrame } from "@/components/ui";
export default async function DashboardPage() {
  await requireCurrentOfficer();
  await connection();
  const supabase = await createClient();
  const [summary, events, transactions] = await Promise.all([
    supabase.from("dashboard_summary").select("*").single(),
    supabase
      .from("events")
      .select("*,event_officers(officer_id)")
      .neq("status", "cancelled")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(10),
    supabase
      .from("point_transactions")
      .select("*,officers(id,name),events(id,name)")
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(10),
  ]);
  if (summary.error || events.error || transactions.error)
    throw new Error("Failed to load dashboard");
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="A current view of club activity."
      />
      <section
        aria-label="Summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {[
          {
            label: "Active officers",
            value: summary.data.active_officer_count ?? 0,
          },
          {
            label: "Upcoming events",
            value: summary.data.upcoming_event_count ?? 0,
          },
          {
            label: "Points this half-year",
            value: displayPoints(summary.data.half_year_points ?? 0),
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-100">
              {stat.value}
            </p>
          </div>
        ))}
      </section>
      <p className="-mt-5 text-xs text-zinc-500">
        Half-year periods are January–June and July–December (UTC). Points
        include signed corrections.
      </p>
      <section>
        <SectionHeading title="Upcoming events" description="Next 10 events" />
        {!events.data.length && <p>No upcoming events.</p>}
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Start</th>
                <th>Officers</th>
              </tr>
            </thead>
            <tbody>
              {events.data.map((event) => (
                <tr key={event.id}>
                  <td>
                    <Link href={`/events/${event.id}`}>{event.name}</Link>
                  </td>
                  <td>{displayDate(event.starts_at)}</td>
                  <td>{event.event_officers.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </section>
      <section>
        <SectionHeading
          title="Recent point activity"
          description="Latest 10 transactions"
        />
        <TableFrame>
          <TransactionTable transactions={transactions.data} />
        </TableFrame>
      </section>
    </div>
  );
}
