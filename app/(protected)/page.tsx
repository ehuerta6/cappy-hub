import { formatEventSchedule } from "@/lib/presentation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { displayPoints } from "@/lib/participation";
import { participationLabel } from "@/lib/event-status";
import TransactionTable from "./points/transaction-table";
import {
  ActionLink,
  PageHeader,
  SectionHeading,
  TableFrame,
} from "@/components/ui";
export default async function DashboardPage() {
  const officer = await requireCurrentOfficer();
  const supabase = await createClient();
  const [summary, events, transactions, total] = await Promise.all([
    supabase.from("dashboard_summary").select("*").single(),
    supabase
      .from("events")
      .select("*,event_officers(officer_id)")
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .gt("starts_at", new Date().toISOString())
      .order("event_date"),
    supabase
      .from("point_transactions")
      .select("*,officers(id,name),events(id,name),tasks(id,title)")
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(10),
    supabase
      .from("officer_point_totals")
      .select("total_points")
      .eq("id", officer.id)
      .single(),
  ]);
  if (summary.error || events.error || transactions.error || total.error)
    throw new Error("Failed to load dashboard");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A current view of club activity."
      />
      <section
        aria-label="Your profile"
        className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <h2 className="break-words">{officer.name}</h2>
          <p>{officer.positionName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div>
            <p className="text-sm">Your total points</p>
            <p className="text-2xl font-semibold tabular-nums text-zinc-100">
              {displayPoints(total.data.total_points ?? 0)}
            </p>
          </div>
          <ActionLink href={`/officers/${officer.id}`}>View profile</ActionLink>
        </div>
      </section>
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
      <p className="-mt-3 text-xs text-zinc-500">
        Half-year periods are January–June and July–December (America/Denver).
        Points include signed corrections.
      </p>
      <section>
        <SectionHeading
          title="Upcoming events"
          description="All upcoming events"
        />
        {!events.data.length && <p>No upcoming events.</p>}
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Schedule (El Paso)</th>
                <th>Officers</th>
                <th>Your signup</th>
              </tr>
            </thead>
            <tbody>
              {events.data.map((event) => (
                <tr key={event.id}>
                  <td>
                    <Link href={`/events/${event.id}`}>{event.name}</Link>
                  </td>
                  <td>{formatEventSchedule(event.starts_at, event.ends_at)}</td>
                  <td>{event.event_officers.length}</td>
                  <td>
                    {participationLabel(
                      event.event_officers.some(
                        (signup) => signup.officer_id === officer.id,
                      ),
                    )}
                  </td>
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
