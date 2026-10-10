import "server-only";
import type { AuthorizationContext } from "@/lib/authorization";
import type { Tables } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";

// Five rows keep this a summary. One extra per query detects overflow.
export const ACTION_ITEM_LIMIT = 5;
const queryLimit = ACTION_ITEM_LIMIT + 1;
const taskSelection =
  "id,title,due_date,task_officer_assignments!inner(officer_id,completed_at)";

type ActionTask = Pick<Tables<"tasks">, "id" | "title" | "due_date"> & {
  task_officer_assignments: Pick<
    Tables<"task_officer_assignments">,
    "officer_id" | "completed_at"
  >[];
};
type ActionWarning = Pick<Tables<"officer_warnings">, "id" | "created_at"> & {
  officers: { name: string } | null;
  warning_approvals: Pick<
    Tables<"warning_approvals">,
    "approver_officer_id" | "decision"
  >[];
};
export type ActionItem = {
  key: string;
  title: string;
  href: `/tasks/${number}` | `/officers#warning-${number}`;
  status: string;
  dueDate?: string;
};

export function dashboardActionItems(
  actor: AuthorizationContext,
  personalTasks: ActionTask[],
  warnings: ActionWarning[],
) {
  const byDueDate = (a: ActionTask, b: ActionTask) =>
    a.due_date.localeCompare(b.due_date) || a.id - b.id;
  const taskItem = (task: ActionTask): ActionItem => ({
    key: `task-${task.id}`,
    title: task.title,
    href: `/tasks/${task.id}`,
    status: "Not completed",
    dueDate: task.due_date,
  });
  const pendingWarnings = warnings
    .filter((warning) =>
      warning.warning_approvals.some(
        (approval) =>
          approval.approver_officer_id === actor.id &&
          approval.decision === "pending",
      ),
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    .map((warning): ActionItem => ({
      key: `warning-${warning.id}`,
      title: warning.officers
        ? `Warning for ${warning.officers.name}`
        : "Warning decision",
      href: `/officers#warning-${warning.id}`,
      status: "Needs decision",
    }));
  const pendingTasks = personalTasks
    .filter((task) =>
      task.task_officer_assignments.some(
        (assignment) =>
          assignment.officer_id === actor.id &&
          assignment.completed_at === null,
      ),
    )
    .sort(byDueDate)
    .map(taskItem);
  // Leadership decisions need attention before ordinary future Tasks.
  const items = [...pendingWarnings, ...pendingTasks];
  return {
    items: items.slice(0, ACTION_ITEM_LIMIT),
    hasMore: items.length > ACTION_ITEM_LIMIT,
    hasPendingWarnings: pendingWarnings.length > 0,
  };
}

export async function loadDashboardActionItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: AuthorizationContext,
): Promise<ReturnType<typeof dashboardActionItems> | null> {
  const taskQuery = () =>
    supabase
      .from("tasks")
      .select(taskSelection)
      .is("removed_at", null)
      .order("due_date")
      .order("id")
      .limit(queryLimit);
  const [assigned, warnings] = await Promise.all([
    taskQuery()
      .eq("task_officer_assignments.officer_id", actor.id)
      .is("task_officer_assignments.completed_at", null),
    // Inner join, caller filters and existing RLS match the Officers workflow.
    // No reason or other warning details are fetched for this summary.
    supabase
      .from("officer_warnings")
      .select(
        "id,created_at,officers!officer_warnings_officer_id_fkey(name),warning_approvals!inner(approver_officer_id,decision)",
      )
      .eq("status", "pending")
      .eq("warning_approvals.approver_officer_id", actor.id)
      .eq("warning_approvals.decision", "pending")
      .order("created_at")
      .order("id")
      .limit(queryLimit),
  ]);
  if (
    assigned.error ||
    warnings.error ||
    assigned.data === null ||
    warnings.data === null
  )
    return null;
  return dashboardActionItems(actor, assigned.data, warnings.data);
}
