export type ActivityTaskAssignmentInput = {
  officer_id: number;
  completed_at: string | null;
  completion_approval_pending?: boolean | null;
  removed_at?: string | null;
  tasks: {
    due_date: string;
    removed_at?: string | null;
    no_longer_needed_at?: string | null;
  } | null;
};

export type ActivityEventSignupInput = {
  officer_id: number;
  event_id?: number | null;
  participation_type: string;
  removed_at?: string | null;
  events: {
    id: number;
    event_date: string;
    deleted_at?: string | null;
    status: string;
  } | null;
};

export type OfficerActivitySummary = {
  dueTasksCount: number;
  completedDueTasksCount: number;
  pendingApprovalTasksCount: number;
  upcomingTasksCount: number;
  taskCompletionPercent: number | null;
  volunteerEventsCount: number;
  attendEventsCount: number;
  totalRecordedEventsCount: number;
};

export function emptyOfficerActivitySummary(): OfficerActivitySummary {
  return {
    dueTasksCount: 0,
    completedDueTasksCount: 0,
    pendingApprovalTasksCount: 0,
    upcomingTasksCount: 0,
    taskCompletionPercent: null,
    volunteerEventsCount: 0,
    attendEventsCount: 0,
    totalRecordedEventsCount: 0,
  };
}

export function formatTaskCompletionLabel(
  summary: Pick<OfficerActivitySummary, "taskCompletionPercent">,
): string {
  return summary.taskCompletionPercent === null
    ? "No Tasks due"
    : `${summary.taskCompletionPercent}%`;
}

/**
 * Computes per-Officer activity metrics for the selected period:
 * - Task completion % = approved completed due Tasks / due Tasks (due_date < today).
 *   Upcoming Tasks (due_date >= today) do not lower the percentage, pending-approval
 *   completions are counted separately and excluded from the numerator, and
 *   No longer needed / removed Tasks are excluded entirely.
 * - Recorded Events = distinct non-deleted, non-cancelled Event occurrences counted
 *   once per Officer, separated into Volunteer and Attend (recorded signups, not
 *   verified attendance).
 */
export function computeOfficerActivityMap(
  officerIds: readonly number[],
  taskAssignments: readonly ActivityTaskAssignmentInput[],
  eventSignups: readonly ActivityEventSignupInput[],
  today: string,
): Map<number, OfficerActivitySummary> {
  const result = new Map<number, OfficerActivitySummary>();
  const seenEventsByOfficer = new Map<number, Set<number>>();

  for (const id of officerIds) {
    result.set(id, emptyOfficerActivitySummary());
    seenEventsByOfficer.set(id, new Set<number>());
  }

  for (const assignment of taskAssignments) {
    const summary = result.get(assignment.officer_id);
    if (!summary) continue;
    if (assignment.removed_at != null) continue;
    const task = assignment.tasks;
    if (!task) continue;
    if (task.removed_at != null || task.no_longer_needed_at != null) continue;

    const pendingApproval = assignment.completion_approval_pending === true;
    const isDue = task.due_date < today;

    if (pendingApproval) {
      summary.pendingApprovalTasksCount += 1;
    }

    if (isDue) {
      summary.dueTasksCount += 1;
      if (assignment.completed_at !== null && !pendingApproval) {
        summary.completedDueTasksCount += 1;
      }
    } else {
      summary.upcomingTasksCount += 1;
    }
  }

  for (const signup of eventSignups) {
    const summary = result.get(signup.officer_id);
    const seenEvents = seenEventsByOfficer.get(signup.officer_id);
    if (!summary || !seenEvents) continue;
    if (signup.removed_at != null) continue;
    const event = signup.events;
    if (!event) continue;
    if (event.deleted_at != null || event.status === "cancelled") continue;

    const eventId = event.id;
    if (seenEvents.has(eventId)) continue;
    seenEvents.add(eventId);

    if (signup.participation_type === "volunteer") {
      summary.volunteerEventsCount += 1;
    } else if (
      signup.participation_type === "attendee" ||
      signup.participation_type === "attend"
    ) {
      summary.attendEventsCount += 1;
    }
    summary.totalRecordedEventsCount =
      summary.volunteerEventsCount + summary.attendEventsCount;
  }

  for (const summary of result.values()) {
    summary.taskCompletionPercent =
      summary.dueTasksCount > 0
        ? Math.round(
            (summary.completedDueTasksCount / summary.dueTasksCount) * 100,
          )
        : null;
  }

  return result;
}
