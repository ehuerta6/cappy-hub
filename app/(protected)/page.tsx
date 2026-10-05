import {
  formatCalendarDate,
  formatDate,
  formatEventSchedule,
} from "@/lib/presentation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { displayPoints } from "@/lib/participation";
import { participationLabel } from "@/lib/event-status";
import { SectionHeading, PointValue } from "@/components/ui";
import {
  ACTION_ITEM_LIMIT,
  loadDashboardActionItems,
} from "./dashboard-action-items";

export default async function DashboardPage() {
  const officer = await requireCurrentOfficer();
  const supabase = await createClient();
  const [summary, events, transactions, total, actionItems] = await Promise.all(
    [
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
        .select(
          "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
        )
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(10),
      supabase
        .from("officer_point_totals")
        .select("total_points")
        .eq("id", officer.id)
        .single(),
      loadDashboardActionItems(supabase, officer),
    ],
  );
  if (summary.error || events.error || transactions.error || total.error)
    throw new Error("Failed to load dashboard");
  return (
    <div data-page-width="wide" className="space-y-4">
      <header className="grid min-w-0 gap-4 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <section aria-label="Dashboard context" className="min-w-0">
          <h1 className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
            Dashboard
          </h1>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              {officer.name}
            </h2>
            <span className="break-words text-sm text-muted">
              · {officer.positionName}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            A current view of club activity.
          </p>
        </section>
        <section
          aria-label="Your profile"
          className="flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 sm:justify-end"
        >
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-muted">
              Personal total
            </p>
            <p className="mt-0.5 flex items-baseline gap-1 text-lg font-semibold tabular-nums text-foreground">
              <PointValue value={total.data.total_points ?? 0} />
              <span className="text-sm font-medium text-muted">pts</span>
            </p>
          </div>
          <Link
            href={`/officers/${officer.id}`}
            aria-label={`View ${officer.name}'s profile`}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-secondary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted lg:min-h-9"
          >
            View profile <span aria-hidden="true">→</span>
          </Link>
        </section>
      </header>
      <section
        aria-label="Summary"
        className="overflow-hidden rounded-md border border-border bg-surface/30"
      >
        <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
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
            <div key={stat.label} className="min-w-0 px-3 py-2.5 sm:px-4">
              <dt className="mt-0 text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-muted">
                {stat.label}
              </dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="px-1 text-xs text-muted">
        Half-year periods are January–June and July–December (America/Denver).
        Points include signed corrections.
      </p>
      <section
        aria-label="Your action items"
        className="min-w-0 border-y border-border py-3"
      >
        <SectionHeading
          title="Your action items"
          action={
            <div className="flex max-w-full flex-wrap gap-x-4 text-sm">
              <Link
                href="/tasks"
                className="inline-flex min-h-9 items-center underline underline-offset-4"
              >
                View all Tasks
              </Link>
              <Link
                href="/officers"
                className="inline-flex min-h-9 items-center underline underline-offset-4"
              >
                View warning decisions
              </Link>
            </div>
          }
        />
        {actionItems.items.length === 0 ? (
          <p className="text-sm">You&apos;re all caught up.</p>
        ) : (
          <ul className="divide-y divide-border">
            {actionItems.items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="grid min-h-11 min-w-0 gap-x-4 gap-y-1 py-2 text-sm hover:underline sm:grid-cols-[minmax(0,1fr)_max-content_max-content] sm:items-center"
                >
                  <span className="min-w-0 break-words font-medium text-foreground">
                    {item.title}
                  </span>
                  {item.dueDate ? (
                    <time dateTime={item.dueDate} className="text-muted">
                      Due {formatCalendarDate(item.dueDate)}
                    </time>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                  <span className="min-w-0 break-words text-muted sm:text-right">
                    {item.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {actionItems.hasMore && (
          <p className="mt-2 text-xs">
            Showing the first {ACTION_ITEM_LIMIT} items. View Tasks or warning
            decisions for more.
          </p>
        )}
      </section>
      <div className="grid min-w-0 items-start gap-5 border-t border-border pt-4 lg:grid-cols-2 lg:gap-0">
        <section aria-label="Upcoming events" className="min-w-0 lg:pr-6">
          <SectionHeading
            title="Upcoming events"
            description="All upcoming events · El Paso time"
            action={
              <Link
                href="/events"
                className="inline-flex min-h-9 items-center text-sm underline underline-offset-4"
              >
                View all Events
              </Link>
            }
          />
          {!events.data.length ? (
            <p>No upcoming events.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.data.map((event) => (
                <li
                  key={event.id}
                  className="grid min-w-0 gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/events/${event.id}`}
                      className="block break-words font-medium text-foreground hover:underline"
                    >
                      {event.name}
                    </Link>
                    <p className="text-sm">
                      {formatEventSchedule(event.starts_at, event.ends_at)}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted sm:flex-col sm:items-end sm:gap-y-0.5">
                    <span>
                      {event.event_officers.length}{" "}
                      {event.event_officers.length === 1
                        ? "officer"
                        : "officers"}
                    </span>
                    <span
                      className={
                        event.event_officers.some(
                          (signup) => signup.officer_id === officer.id,
                        )
                          ? "text-info"
                          : "text-muted"
                      }
                    >
                      {participationLabel(
                        event.event_officers.some(
                          (signup) => signup.officer_id === officer.id,
                        ),
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          aria-label="Recent point activity"
          className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:py-0 lg:pl-5"
        >
          <SectionHeading
            title="Recent point activity"
            description="Latest 10 transactions"
            action={
              <Link
                href="/points"
                className="inline-flex min-h-9 items-center text-sm underline underline-offset-4"
              >
                View all Points
              </Link>
            }
          />
          {!transactions.data.length ? (
            <p>No point transactions yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {transactions.data.map((transaction) => (
                <li
                  key={transaction.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 text-sm">
                    <Link
                      href={`/officers/${transaction.officers.id}`}
                      className="break-words font-medium text-foreground hover:underline"
                    >
                      {transaction.officers.name}
                    </Link>
                    <p className="break-words">
                      {transaction.events ? (
                        <Link
                          href={`/events/${transaction.events.id}`}
                          className="underline underline-offset-4"
                        >
                          {transaction.events.name}
                        </Link>
                      ) : transaction.tasks ? (
                        <Link
                          href={`/tasks/${transaction.tasks.id}`}
                          className="underline underline-offset-4"
                        >
                          {transaction.tasks.title}
                        </Link>
                      ) : (
                        transaction.reason
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-1 text-right text-sm">
                    <PointValue value={transaction.points} />
                    <span className="sr-only"> points</span>
                    <time
                      dateTime={transaction.created_at}
                      className="block text-xs text-muted"
                    >
                      {formatDate(transaction.created_at)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
