import Link from "next/link";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import { processCompletedEvents, displayPoints } from "@/lib/participation";
import { displayDate } from "@/lib/event-status";
import TransactionTable from "./points/transaction-table";
export default async function DashboardPage() {
  await connection();
  await processCompletedEvents();
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
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(10),
  ]);
  if (summary.error || events.error || transactions.error)
    throw new Error("Failed to load dashboard");
  return (
    <>
      <h1>Cappy Hub</h1>
      <h2>Dashboard</h2>
      <p>Active officers: {summary.data.active_officer_count ?? 0}</p>
      <p>Upcoming events: {summary.data.upcoming_event_count ?? 0}</p>
      <p>
        Points this half-year:{" "}
        {displayPoints(summary.data.half_year_points ?? 0)}
      </p>
      <p>
        Half-year periods are January–June and July–December (UTC). Points
        include signed corrections.
      </p>
      <h2>Upcoming events (next 10)</h2>
      {!events.data.length && <p>No upcoming events.</p>}
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
      <h2>Recent point activity (10)</h2>
      <TransactionTable transactions={transactions.data} />
    </>
  );
}
