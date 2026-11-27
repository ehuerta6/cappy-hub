"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, CheckCircle2, Clock, Info } from "lucide-react";
import { Badge, BranchBadges, StatusBadge } from "@/components/ui";
import { CopyEmailsButton } from "@/components/copy-button";
import {
  formatTaskCompletionLabel,
  type OfficerActivitySummary,
} from "@/lib/officer-activity";

export type OfficerActivityRow = {
  id: number;
  name: string;
  utepEmail?: string | null;
  status: string;
  positionName: string;
  branches: Array<{ name: string; color?: string | null }>;
  profileHref: string;
  activity: OfficerActivitySummary;
};

type SortKey = "name" | "completion" | "events";
type ActivityFilterKey = "all" | "incomplete_due" | "pending" | "no_events";

function completionTone(percent: number): "green" | "amber" | "red" {
  if (percent >= 100) return "green";
  if (percent >= 50) return "amber";
  return "red";
}

function matchesActivityFilter(
  row: OfficerActivityRow,
  filter: ActivityFilterKey,
): boolean {
  const { activity } = row;
  if (filter === "incomplete_due") {
    return (
      activity.dueTasksCount > 0 &&
      activity.completedDueTasksCount < activity.dueTasksCount
    );
  }
  if (filter === "pending") {
    return activity.pendingApprovalTasksCount > 0;
  }
  if (filter === "no_events") {
    return activity.totalRecordedEventsCount === 0;
  }
  return true;
}

export default function OfficerActivityTable({
  rows,
  periodLabel,
}: {
  rows: OfficerActivityRow[];
  periodLabel: string;
}) {
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [activityFilter, setActivityFilter] =
    useState<ActivityFilterKey>("all");

  const officersWithDueTasks = rows.filter(
    (row) => row.activity.dueTasksCount > 0,
  );
  const averageCompletion =
    officersWithDueTasks.length > 0
      ? Math.round(
          officersWithDueTasks.reduce(
            (sum, row) => sum + (row.activity.taskCompletionPercent ?? 0),
            0,
          ) / officersWithDueTasks.length,
        )
      : null;
  const totalPendingApprovals = rows.reduce(
    (sum, row) => sum + row.activity.pendingApprovalTasksCount,
    0,
  );
  const totalVolunteerSignups = rows.reduce(
    (sum, row) => sum + row.activity.volunteerEventsCount,
    0,
  );
  const totalAttendSignups = rows.reduce(
    (sum, row) => sum + row.activity.attendEventsCount,
    0,
  );
  const totalRecordedSignups = totalVolunteerSignups + totalAttendSignups;

  const filterCounts = {
    all: rows.length,
    incomplete_due: rows.filter((row) =>
      matchesActivityFilter(row, "incomplete_due"),
    ).length,
    pending: rows.filter((row) => matchesActivityFilter(row, "pending")).length,
    no_events: rows.filter((row) => matchesActivityFilter(row, "no_events"))
      .length,
  };

  const filteredRows = rows.filter((row) =>
    matchesActivityFilter(row, activityFilter),
  );
  const filteredUtepEmails = filteredRows
    .map((row) => row.utepEmail)
    .filter((email): email is string => Boolean(email));

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (sortBy === "completion") {
      const aPct = a.activity.taskCompletionPercent ?? -1;
      const bPct = b.activity.taskCompletionPercent ?? -1;
      if (bPct !== aPct) return bPct - aPct;
      if (b.activity.dueTasksCount !== a.activity.dueTasksCount) {
        return b.activity.dueTasksCount - a.activity.dueTasksCount;
      }
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "events") {
      if (
        b.activity.totalRecordedEventsCount !==
        a.activity.totalRecordedEventsCount
      ) {
        return (
          b.activity.totalRecordedEventsCount -
          a.activity.totalRecordedEventsCount
        );
      }
      if (b.activity.volunteerEventsCount !== a.activity.volunteerEventsCount) {
        return (
          b.activity.volunteerEventsCount - a.activity.volunteerEventsCount
        );
      }
      return a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <dl
        aria-label="Activity summary"
        className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        <div className="px-4 py-3.5">
          <dt className="mt-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Task completion ({periodLabel})
          </dt>
          <dd className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {averageCompletion === null
                ? "No Tasks due"
                : `${averageCompletion}% avg`}
            </span>
            <span className="text-xs tabular-nums text-muted">
              {officersWithDueTasks.length} of {rows.length} officers with due
              Tasks
            </span>
          </dd>
        </div>

        <div className="px-4 py-3.5">
          <dt className="mt-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Pending task approvals
          </dt>
          <dd className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span
              className={`text-xl font-semibold tabular-nums ${
                totalPendingApprovals > 0 ? "text-warning" : "text-foreground"
              }`}
            >
              {totalPendingApprovals}
            </span>
            <span className="text-xs text-muted">
              {totalPendingApprovals === 0
                ? "All submitted work reviewed"
                : "Excluded from % until approved"}
            </span>
          </dd>
        </div>

        <div className="px-4 py-3.5">
          <dt className="mt-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Recorded event signups
          </dt>
          <dd className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {totalRecordedSignups}
            </span>
            <span className="text-xs tabular-nums text-muted">
              {totalVolunteerSignups} Volunteer · {totalAttendSignups} Attend
            </span>
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Filter officer activity"
        >
          {(
            [
              ["all", `All (${filterCounts.all})`],
              [
                "incomplete_due",
                `Incomplete due Tasks (${filterCounts.incomplete_due})`,
              ],
              ["pending", `Pending approval (${filterCounts.pending})`],
              ["no_events", `0 events (${filterCounts.no_events})`],
            ] as const
          ).map(([key, label]) => {
            const active = activityFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActivityFilter(key)}
                aria-pressed={active}
                className={`min-h-8 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-brand-border bg-brand-bg text-brand"
                    : "border-border bg-surface text-secondary hover:border-border-strong hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
          {activityFilter !== "all" && filteredUtepEmails.length > 0 && (
            <CopyEmailsButton
              emails={filteredUtepEmails}
              label="Copy filtered emails"
            />
          )}
        </div>

        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Sort officer activity"
        >
          <span className="mr-1 text-xs text-muted">Sort by:</span>
          {(
            [
              ["name", "Name"],
              ["completion", "Task %"],
              ["events", "Recorded events"],
            ] as const
          ).map(([key, label]) => {
            const active = sortBy === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSortBy(key)}
                aria-pressed={active}
                className={`min-h-8 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-brand-border bg-brand-bg text-brand"
                    : "border-border bg-surface text-secondary hover:border-border-strong hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Info size={13} aria-hidden="true" className="shrink-0 text-subtle" />
        <span>
          Task % counts approved completions on due Tasks only. Event counts
          reflect recorded signups, not verified attendance.
        </span>
      </p>

      {sortedRows.length === 0 ? (
        <div
          role="status"
          className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center"
        >
          <p className="text-sm text-muted">
            No officers match this activity filter.
          </p>
        </div>
      ) : (
        <div
          className="table-frame table-frame--compact table-frame--keyboard-scroll overflow-x-auto rounded-lg border border-border"
          role="region"
          aria-label="Officer activity"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Officer</th>
                <th scope="col">Task completion</th>
                <th scope="col">Recorded events</th>
                <th scope="col" className="text-right">
                  Profile
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const { activity } = row;
                const completionLabel = formatTaskCompletionLabel(activity);
                const pct = activity.taskCompletionPercent;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={row.profileHref as Route}
                            className="font-semibold text-foreground hover:text-brand hover:underline underline-offset-3"
                          >
                            {row.name}
                          </Link>
                          <span className="text-xs text-muted">
                            {row.positionName}
                          </span>
                          {row.status !== "active" && (
                            <StatusBadge status={row.status} />
                          )}
                        </div>
                        {row.branches.length > 0 && (
                          <BranchBadges branches={row.branches} />
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {pct === null ? (
                            <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-muted">
                              {completionLabel}
                            </span>
                          ) : (
                            <>
                              <Badge tone={completionTone(pct)}>
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  {pct >= 100 && (
                                    <CheckCircle2
                                      size={11}
                                      aria-hidden="true"
                                    />
                                  )}
                                  {completionLabel}
                                </span>
                              </Badge>
                              <span className="text-xs tabular-nums text-secondary">
                                {activity.completedDueTasksCount} of{" "}
                                {activity.dueTasksCount} due
                              </span>
                            </>
                          )}
                        </div>
                        {(activity.pendingApprovalTasksCount > 0 ||
                          activity.upcomingTasksCount > 0) && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {activity.pendingApprovalTasksCount > 0 && (
                              <span className="inline-flex items-center gap-1 font-medium text-warning">
                                <Clock size={11} aria-hidden="true" />
                                {activity.pendingApprovalTasksCount} pending
                                approval
                              </span>
                            )}
                            {activity.upcomingTasksCount > 0 && (
                              <span className="tabular-nums text-muted">
                                {activity.upcomingTasksCount} upcoming
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      {activity.totalRecordedEventsCount === 0 ? (
                        <span className="text-xs text-muted">No signups</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {activity.totalRecordedEventsCount}{" "}
                            <span className="text-xs font-normal text-muted">
                              {activity.totalRecordedEventsCount === 1
                                ? "event"
                                : "events"}
                            </span>
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="blue">
                              {activity.volunteerEventsCount} Volunteer
                            </Badge>
                            <Badge tone="neutral">
                              {activity.attendEventsCount} Attend
                            </Badge>
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="text-right">
                      <Link
                        href={row.profileHref as Route}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline underline-offset-3"
                        aria-label={`View ${row.name}'s profile`}
                      >
                        View
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
