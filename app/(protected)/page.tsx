import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  formatCalendarDate,
  formatDate,
  formatEventSchedule,
  formatTaskDueTime,
} from "@/lib/presentation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import { createClient } from "@/lib/supabase/server";
import { displayPoints } from "@/lib/participation";
import { eventSignupCountLabel } from "@/lib/event-list";
import { PageHeader, PointValue, SectionHeading } from "@/components/ui";
import { loadDashboardActionItems } from "./dashboard-action-items";
import { DASHBOARD_PREVIEW_LIMIT } from "./dashboard-limits";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import styles from "./dashboard.module.css";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const officer = await requireCurrentOfficer();
  const supabase = await createClient();
  const [params, periodData] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    getAcademicPeriodData(),
  ]);
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  const selectedPeriod = periodSelection.period;
  const periodHref = params.period
    ? `?period=${encodeURIComponent(String(params.period))}`
    : "";

  if (selectedPeriod && selectedPeriod.id !== periodData.currentPeriodId) {
    const [events, tasks, pointSummary] = await Promise.all([
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("event_date", selectedPeriod.starts_on)
        .lte("event_date", selectedPeriod.ends_on)
        .is("deleted_at", null)
        .neq("status", "cancelled"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .gte("due_date", selectedPeriod.starts_on)
        .lte("due_date", selectedPeriod.ends_on)
        .is("removed_at", null),
      supabase
        .rpc("academic_period_point_summary", {
          p_period_id: selectedPeriod.id,
        })
        .single(),
    ]);
    if (events.error || tasks.error || pointSummary.error)
      throw new Error("Failed to load academic period summary");
    const rankedOfficers = (
      pointSummary.data.ranking as Array<{
        officer_id: number;
        officer_name: string;
        points: number;
      }>
    ).map((row) => ({
      id: row.officer_id,
      name: row.officer_name,
      points: row.points,
    }));

    return (
      <div className={styles.dashboard} data-page-width="wide">
        <PageHeader
          title={selectedPeriod.name}
          description={
            periodSelection.isHistorical
              ? "Historical view · read only"
              : "Future period overview"
          }
          action={
            <span
              className={`${styles.periodState} ${periodSelection.isHistorical ? styles.periodHistorical : styles.periodFuture}`}
            >
              {periodSelection.isHistorical ? "Historical" : "Upcoming period"}
            </span>
          }
        />

        <section aria-label="Period summary">
          <dl className={styles.metricGrid}>
            <MetricCard label="Events" value={events.count ?? 0} />
            <MetricCard label="Tasks" value={tasks.count ?? 0} />
            <MetricCard
              label="Net points"
              value={<PointValue value={pointSummary.data.net_points} />}
            />
          </dl>
        </section>

        <section className={styles.panel} aria-label="Period ranking">
          <SectionHeading
            title="Points leaderboard"
            description="Officer totals for this academic period"
          />
          {rankedOfficers.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No active Points in this period yet.</p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.rankingTable}>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Officer</th>
                    <th scope="col" className={styles.alignRight}>
                      Net points
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rankedOfficers.map((row, index) => (
                    <tr key={row.id}>
                      <td>
                        <span
                          className={`${styles.rankNumber} ${[styles.rank1, styles.rank2, styles.rank3][index] ?? ""}`}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/officers/${row.id}${periodHref}`}
                          className={styles.personLink}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className={styles.alignRight}>
                        <strong className={styles.pointsValue}>
                          <PointValue value={row.points} />
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  let currentPeriodPoints: number | null = null;
  if (selectedPeriod) {
    const periodPoints = await supabase
      .rpc("academic_period_point_summary", {
        p_period_id: selectedPeriod.id,
      })
      .single();
    if (periodPoints.error) throw new Error("Failed to load period Points");
    currentPeriodPoints = periodPoints.data.net_points;
  }

  const [summary, events, transactions, total, actionItems] = await Promise.all(
    [
      supabase.from("dashboard_summary").select("*").single(),
      supabase
        .from("events")
        .select(
          "*,event_types(name),active_signup:event_officers!left(officer_id,removed_at)",
        )
        .eq("active_signup.officer_id", officer.id)
        .is("active_signup.removed_at", null)
        .is("active_signup", null)
        .neq("status", "cancelled")
        .is("deleted_at", null)
        .gt("starts_at", new Date().toISOString())
        .order("starts_at")
        .order("id")
        .limit(DASHBOARD_PREVIEW_LIMIT),
      supabase
        .from("point_transactions")
        .select(
          "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
        )
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(DASHBOARD_PREVIEW_LIMIT),
      supabase
        .from("officer_point_totals")
        .select("total_points")
        .eq("id", officer.id)
        .single(),
      loadDashboardActionItems(supabase, officer),
    ],
  );
  const discoveryEvents = events.data ?? [];
  const countsResult = discoveryEvents.length
    ? await supabase.rpc("event_signup_counts").in(
        "event_id",
        discoveryEvents.map((event) => event.id),
      )
    : { data: [], error: null };
  const signupCounts = new Map(
    (countsResult.data ?? []).map((row) => [row.event_id, row]),
  );

  return (
    <div className={styles.dashboard} data-page-width="wide">
      <PageHeader
        title="Dashboard"
        description={
          <>
            {officer.name} <span aria-hidden="true">·</span>{" "}
            {officer.positionName}
          </>
        }
        action={
          <Link
            href={`/officers/${officer.id}`}
            className={styles.personalCard}
          >
            <span className={styles.personalInfo}>
              <span className={styles.personalLabel}>Your points</span>
              {total.error ? (
                <span role="alert" className={styles.personalError}>
                  Unavailable · reload to retry
                </span>
              ) : (
                <span className={styles.personalValue}>
                  <PointValue value={total.data.total_points ?? 0} />
                  <span>pts</span>
                </span>
              )}
            </span>
            <span className="sr-only">View your profile</span>
          </Link>
        }
      />

      <section aria-label="Club summary">
        {summary.error ? (
          <p role="alert" className={styles.inlineError}>
            Summary unavailable. Reload this page to retry.
          </p>
        ) : (
          <dl className={styles.metricGrid}>
            <MetricCard
              label="Active officers"
              value={summary.data.active_officer_count ?? 0}
            />
            <MetricCard
              label="Upcoming events"
              value={summary.data.upcoming_event_count ?? 0}
            />
            <MetricCard
              label="Points this period"
              value={
                currentPeriodPoints === null
                  ? "—"
                  : displayPoints(currentPeriodPoints)
              }
            />
          </dl>
        )}
      </section>

      <p className={styles.periodNote}>
        {selectedPeriod
          ? `Points include signed transactions attributed to ${selectedPeriod.name}.`
          : "No current period. Dashboard activity is unfiltered."}
      </p>

      <section
        className={`${styles.panel} ${styles.actionsPanel}`}
        aria-labelledby="action-items-title"
      >
        <SectionHeading
          title="Your action items"
          id="action-items-title"
          action={
            <Link href="/tasks" className={styles.textLink}>
              View tasks
            </Link>
          }
        />
        {Object.values(actionItems.unavailableSources).some(Boolean) ? (
          <div className={styles.alertBox} role="alert">
            <span>Some action items are unavailable. Reload to retry.</span>
            <span>Showing available items only.</span>
          </div>
        ) : null}
        {actionItems.items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>
              {Object.values(actionItems.unavailableSources).some(Boolean)
                ? "Available action items may be incomplete. Reload to retry."
                : "You’re all caught up."}
            </p>
          </div>
        ) : (
          <ul className={styles.actionList}>
            {actionItems.items.map((item) => (
              <li key={item.key}>
                <Link href={item.href as Route} className={styles.actionRow}>
                  <span className={styles.actionMain}>
                    <span className={styles.actionTitle}>{item.title}</span>
                    <span className={styles.actionMeta}>
                      {item.dueDate ? (
                        <time dateTime={item.dueDate}>
                          {formatCalendarDate(item.dueDate)}
                          {item.dueTime
                            ? ` · ${formatTaskDueTime(item.dueTime)}`
                            : ""}
                        </time>
                      ) : item.reminder ? (
                        <span>{item.reminder}</span>
                      ) : (
                        <span>Needs your attention</span>
                      )}
                      {item.dueDate && item.reminder && (
                        <span aria-label="Reminder due"> · Reminder</span>
                      )}
                    </span>
                  </span>
                  <span
                    className={styles.actionStatusLabel}
                    data-status={item.status.toLowerCase().replaceAll(" ", "-")}
                  >
                    {item.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {actionItems.hasMore && (
          <p className={styles.listFootnote}>
            Showing the first {DASHBOARD_PREVIEW_LIMIT} items. Open the related
            Event, Task, Points, or Officer record for details.
          </p>
        )}
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.panel} aria-label="Upcoming events">
          <SectionHeading
            title="Upcoming events"
            action={
              <Link href="/events" className={styles.textLink}>
                View events
              </Link>
            }
          />
          {events.error ? (
            <div className={styles.alertBox} role="alert">
              Upcoming events unavailable. Reload this page to retry.
            </div>
          ) : !discoveryEvents.length ? (
            <div className={styles.emptyState}>
              <p>No upcoming events.</p>
            </div>
          ) : (
            <ul className={styles.eventList}>
              {discoveryEvents.map((event) => {
                return (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.id}`}
                      className={styles.eventRow}
                    >
                      <span className={styles.eventMain}>
                        <span className={styles.eventTitle}>{event.name}</span>
                        <span className={styles.eventMeta}>
                          {formatEventSchedule(event.starts_at, event.ends_at)}
                        </span>
                      </span>
                      <span className={styles.eventDetails}>
                        <span className={styles.eventCapacity}>
                          {countsResult.error ||
                          signupCounts.get(event.id)?.confirmed_count == null
                            ? "Signups unavailable"
                            : eventSignupCountLabel({
                                max_volunteers: event.max_volunteers,
                                confirmed_count: Number(
                                  signupCounts.get(event.id)?.confirmed_count,
                                ),
                              })}
                        </span>
                        <span className={styles.statusNeutral}>
                          Not signed up
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.panel} aria-label="Recent point activity">
          <SectionHeading
            title="Recent point activity"
            action={
              <Link href="/points?view=history" className={styles.textLink}>
                View history
              </Link>
            }
          />
          {transactions.error ? (
            <div className={styles.alertBox} role="alert">
              Recent point activity unavailable. Reload this page to retry.
            </div>
          ) : !transactions.data.length ? (
            <div className={styles.emptyState}>
              <p>No point transactions yet.</p>
            </div>
          ) : (
            <ul className={styles.pointList}>
              {transactions.data.map((transaction) => (
                <li key={transaction.id}>
                  <div className={styles.pointRow}>
                    <span className={styles.pointMain}>
                      <Link
                        href={`/officers/${transaction.officers.id}`}
                        className={styles.pointOfficer}
                      >
                        {transaction.officers.name}
                      </Link>
                      <span className={styles.pointReason}>
                        {transaction.events ? (
                          <Link href={`/events/${transaction.events.id}`}>
                            {transaction.events.name}
                          </Link>
                        ) : transaction.tasks ? (
                          <Link href={`/tasks/${transaction.tasks.id}`}>
                            {transaction.tasks.title}
                          </Link>
                        ) : (
                          transaction.reason
                        )}
                      </span>
                    </span>
                    <span className={styles.pointRight}>
                      <strong
                        className={`${styles.pointAmount} ${transaction.points < 0 ? styles.negativeText : styles.positiveText}`}
                      >
                        <PointValue value={transaction.points} />
                      </strong>
                      <time dateTime={transaction.created_at}>
                        {formatDate(transaction.created_at)}
                      </time>
                    </span>
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

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.metricCard}>
      <dt className={styles.metricLabel}>{label}</dt>
      <dd className={styles.metricValue}>{value}</dd>
    </div>
  );
}
