import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, CalendarDays, CheckSquare } from "lucide-react";
import {
  formatCalendarDate,
  formatDate,
  formatEventSchedule,
  formatRelativeDayCue,
  formatTaskDueTime,
} from "@/lib/presentation";
import { requireCurrentOfficer } from "@/lib/current-officer";
import { canManageEvent, canSeeAllBranches, isLead } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { displayPoints } from "@/lib/participation";
import { eventSignupCountLabel } from "@/lib/event-list";
import { Badge, PageHeader, PointValue, SectionHeading } from "@/components/ui";
import { SelfSignupForm } from "./events/event-controls";
import { TaskSelfCompletionForm } from "./tasks/task-action-form";
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
            <MetricCard
              label="Events"
              value={events.count ?? 0}
              href={`/events${periodHref}` as Route}
            />
            <MetricCard
              label="Tasks"
              value={tasks.count ?? 0}
              href={`/tasks${periodHref}` as Route}
            />
            <MetricCard
              label="Net points"
              value={<PointValue value={pointSummary.data.net_points} />}
              href={`/points${periodHref}` as Route}
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

  const canReviewBranch =
    canSeeAllBranches(officer) ||
    (isLead(officer) && officer.branchIds.length > 0);
  const pendingApprovalsQuery = () => {
    let query = supabase
      .from("tasks")
      .select(
        "id,title,due_date,branch_id,task_officer_assignments!inner(officer_id,completion_approval_pending,removed_at)",
      )
      .is("removed_at", null)
      .is("no_longer_needed_at", null)
      .eq("task_officer_assignments.completion_approval_pending", true)
      .is("task_officer_assignments.removed_at", null)
      .order("due_date")
      .limit(5);
    if (!canSeeAllBranches(officer) && officer.branchIds.length > 0)
      query = query.in("branch_id", officer.branchIds);
    return query;
  };
  const [
    periodPoints,
    summary,
    events,
    transactions,
    total,
    actionItems,
    pendingApprovalTasksResult,
    calendarFailuresResult,
  ] = await Promise.all([
    selectedPeriod
      ? supabase
          .rpc("academic_period_point_summary", {
            p_period_id: selectedPeriod.id,
          })
          .single()
      : Promise.resolve(null),
    supabase.from("dashboard_summary").select("*").single(),
    supabase
      .from("events")
      .select(
        "*,event_types(name,color),event_time_slots(id),active_signup:event_officers!left(officer_id,removed_at)",
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
    Promise.resolve().then(() => loadDashboardActionItems(supabase, officer)),
    canReviewBranch
      ? pendingApprovalsQuery()
      : Promise.resolve({ data: [], error: null }),
    canReviewBranch
      ? supabase
          .from("event_calendar_sync_failures")
          .select(
            "event_id,event:events(id,name,deleted_at,event_branches(branch_id))",
          )
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const pendingApprovalTasks =
    pendingApprovalTasksResult.error || !pendingApprovalTasksResult.data
      ? []
      : pendingApprovalTasksResult.data;
  const calendarSyncFailures =
    calendarFailuresResult.error || !calendarFailuresResult.data
      ? []
      : calendarFailuresResult.data.filter(
          (failure) =>
            failure.event &&
            canManageEvent(
              officer,
              failure.event.event_branches.map((b) => b.branch_id),
            ),
        );
  if (periodPoints?.error) throw new Error("Failed to load period Points");
  const currentPeriodPoints: number | null = periodPoints
    ? periodPoints.data.net_points
    : null;
  const periodRanking =
    (periodPoints?.data?.ranking as
      Array<{ officer_id: number; points: number }> | undefined) ?? [];
  const myRankingIndex = periodRanking.findIndex(
    (row) => row.officer_id === officer.id,
  );
  const myPeriodPoints =
    myRankingIndex >= 0 ? periodRanking[myRankingIndex].points : null;
  const myRank = myRankingIndex >= 0 ? myRankingIndex + 1 : null;
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
              <span className={styles.personalLabel}>
                {selectedPeriod
                  ? `Your points · ${selectedPeriod.name}`
                  : "Your points"}
                {myRank !== null ? ` · #${myRank}` : ""}
              </span>
              {total.error ? (
                <span role="alert" className={styles.personalError}>
                  Unavailable · reload to retry
                </span>
              ) : (
                <>
                  <span className={styles.personalValue}>
                    <PointValue
                      value={myPeriodPoints ?? total.data.total_points ?? 0}
                    />
                    <span>pts</span>
                  </span>
                  {selectedPeriod &&
                    myPeriodPoints !== null &&
                    (total.data.total_points ?? 0) !== myPeriodPoints && (
                      <span className="text-[11px] text-muted">
                        All-time: {displayPoints(total.data.total_points ?? 0)}
                      </span>
                    )}
                </>
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
              href="/officers"
            />
            <MetricCard
              label="Upcoming events"
              value={summary.data.upcoming_event_count ?? 0}
              href="/events"
            />
            <MetricCard
              label="Points this period"
              value={
                currentPeriodPoints === null
                  ? "—"
                  : displayPoints(currentPeriodPoints)
              }
              href="/points"
            />
          </dl>
        )}
      </section>

      <p className={styles.periodNote}>
        {selectedPeriod
          ? `Points include signed transactions attributed to ${selectedPeriod.name}.`
          : "No current period. Dashboard activity is unfiltered."}
      </p>

      {canReviewBranch &&
        (pendingApprovalTasks.length > 0 ||
          calendarSyncFailures.length > 0) && (
          <section
            className="rounded-lg border border-warning-border bg-surface p-4"
            aria-labelledby="manager-review-title"
          >
            <SectionHeading
              title="Needs your review"
              id="manager-review-title"
              action={
                <div className="flex items-center gap-4">
                  {pendingApprovalTasks.length > 0 && (
                    <Link
                      href={"/tasks?status=needs_approval" as Route}
                      className={styles.textLink}
                    >
                      Review approvals
                    </Link>
                  )}
                  {calendarSyncFailures.length > 0 && (
                    <Link href="/events" className={styles.textLink}>
                      Calendar recovery
                    </Link>
                  )}
                </div>
              }
            />
            <ul className={styles.actionList}>
              {pendingApprovalTasks.map((task) => {
                const pendingCount = task.task_officer_assignments.filter(
                  (a) => a.completion_approval_pending && a.removed_at == null,
                ).length;
                return (
                  <li key={`review-task-${task.id}`}>
                    <Link
                      href={`/tasks/${task.id}` as Route}
                      className={styles.actionRow}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Badge tone="amber">
                          {pendingCount} pending approval
                        </Badge>
                        <span className={styles.actionTitle}>{task.title}</span>
                      </span>
                      <span className="text-xs font-medium text-brand">
                        Review →
                      </span>
                    </Link>
                  </li>
                );
              })}
              {calendarSyncFailures.map((failure) => (
                <li key={`review-cal-${failure.event_id}`}>
                  <Link
                    href={`/events/${failure.event!.id}` as Route}
                    className={styles.actionRow}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Badge tone="red">Calendar sync failed</Badge>
                      <span className={styles.actionTitle}>
                        {failure.event!.name}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-brand">
                      Retry →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

      <section
        className={`${styles.panel} ${styles.actionsPanel}`}
        aria-labelledby="action-items-title"
      >
        <SectionHeading
          title="Your action items"
          id="action-items-title"
          action={
            <div className="flex items-center gap-4">
              <Link href="/notifications" className={styles.textLink}>
                View notifications
              </Link>
              <Link href="/tasks" className={styles.textLink}>
                View tasks
              </Link>
            </div>
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
            {actionItems.items.map((item) => {
              const ItemIcon =
                item.kind === "warning"
                  ? AlertTriangle
                  : item.kind === "event"
                    ? CalendarDays
                    : CheckSquare;
              const isOverdue = item.status === "Overdue";
              return (
                <li key={item.key} className={styles.actionRow}>
                  <Link
                    href={item.href as Route}
                    className="flex min-w-0 items-start gap-2.5 hover:underline underline-offset-3"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border ${
                        item.kind === "warning" || isOverdue
                          ? "border-warning-border bg-warning-bg text-warning"
                          : item.kind === "event"
                            ? "border-brand-border bg-brand-bg text-brand"
                            : "border-border bg-surface-muted text-secondary"
                      }`}
                    >
                      <ItemIcon size={13} />
                    </span>
                    <span className={styles.actionMain}>
                      <span className={styles.actionTitle}>{item.title}</span>
                      <span className={styles.actionMeta}>
                        {item.dueDate ? (
                          <time dateTime={item.dueDate}>
                            {formatCalendarDate(item.dueDate)}
                            {item.dueTime
                              ? ` · ${formatTaskDueTime(item.dueTime)}`
                              : ""}
                            {!isOverdue &&
                            !item.pendingApproval &&
                            formatRelativeDayCue(item.dueDate)
                              ? ` · ${formatRelativeDayCue(item.dueDate)}`
                              : ""}
                          </time>
                        ) : item.detail ? (
                          <span>{item.detail}</span>
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
                  </Link>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {item.kind === "task" &&
                      item.taskId !== undefined &&
                      !item.pendingApproval &&
                      !periodSelection.isHistorical && (
                        <TaskSelfCompletionForm taskId={item.taskId} />
                      )}
                    <span
                      className={styles.actionStatusLabel}
                      data-status={item.status
                        .toLowerCase()
                        .replaceAll(" ", "-")}
                    >
                      {item.status}
                    </span>
                  </span>
                </li>
              );
            })}
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
                const confirmedCount = signupCounts.get(
                  event.id,
                )?.confirmed_count;
                const isFull =
                  event.max_volunteers != null &&
                  confirmedCount != null &&
                  Number(confirmedCount) >= event.max_volunteers;
                const hasTimeSlots = (event.event_time_slots?.length ?? 0) > 0;
                return (
                  <li key={event.id} className={styles.eventRow}>
                    <Link
                      href={`/events/${event.id}`}
                      className={`${styles.eventMain} hover:underline underline-offset-3`}
                    >
                      <span className={styles.eventTitle}>{event.name}</span>
                      <span className={styles.eventMeta}>
                        {formatEventSchedule(event.starts_at, event.ends_at)}
                        {" · "}
                        {countsResult.error || confirmedCount == null
                          ? "Signups unavailable"
                          : eventSignupCountLabel({
                              max_volunteers: event.max_volunteers,
                              confirmed_count: Number(confirmedCount),
                            })}
                      </span>
                    </Link>
                    <span className={styles.eventDetails}>
                      {!hasTimeSlots && !periodSelection.isHistorical ? (
                        <SelfSignupForm
                          eventId={event.id}
                          eventName={event.name}
                          compact
                          full={isFull}
                        />
                      ) : (
                        <Link
                          href={`/events/${event.id}`}
                          className={styles.statusNeutral}
                        >
                          {hasTimeSlots ? "Choose slots" : "View"}
                        </Link>
                      )}
                    </span>
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

function MetricCard({
  label,
  value,
  href,
}: {
  label: string;
  value: ReactNode;
  href?: Route;
}) {
  if (href) {
    return (
      <div className={styles.metricCard}>
        <Link href={href} className={styles.metricCardLink}>
          <dt className={styles.metricLabel}>{label}</dt>
          <dd className={styles.metricValue}>{value}</dd>
        </Link>
      </div>
    );
  }
  return (
    <div className={styles.metricCard}>
      <dt className={styles.metricLabel}>{label}</dt>
      <dd className={styles.metricValue}>{value}</dd>
    </div>
  );
}
