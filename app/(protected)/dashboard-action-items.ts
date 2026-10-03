import "server-only";
import {
  canManageEvent,
  canSeeAllBranches,
  type AuthorizationContext,
} from "@/lib/authorization";
import type { Tables } from "@/lib/database.types";
import type { createClient } from "@/lib/supabase/server";
import { taskStatus } from "./tasks/task-workflow";

// Five rows keep this a summary. One extra per query detects overflow.
export const ACTION_ITEM_LIMIT = 5;
const queryLimit = ACTION_ITEM_LIMIT + 1;
const taskSelection =
  "id,title,due_date,branch_id,approval_required,task_assignments!inner(officer_id,completed_at,approved_at)";

type ActionTask = Pick<
  Tables<"tasks">,
  "id" | "title" | "due_date" | "branch_id" | "approval_required"
> & {
  task_assignments: Pick<
    Tables<"task_assignments">,
    "officer_id" | "completed_at" | "approved_at"
  > | null;
};
type ActionWarning = Pick<Tables<"officer_warnings">, "id" | "created_at"> & {
  officers: { name: string } | null;
  warning_approvals: Pick<
    Tables<"warning_approvals">,
    "approver_id" | "decision"
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
  approvalTasks: ActionTask[],
  warnings: ActionWarning[],
) {
  const byDueDate = (a: ActionTask, b: ActionTask) =>
    a.due_date.localeCompare(b.due_date) || a.id - b.id;
  const taskItem = (task: ActionTask): ActionItem => ({
    key: `task-${task.id}`,
    title: task.title,
    href: `/tasks/${task.id}`,
    status: taskStatus(task, task.task_assignments),
    dueDate: task.due_date,
  });
  const items: ActionItem[] = [
    ...personalTasks
      .filter(
        (task) =>
          task.task_assignments?.officer_id === actor.id &&
          taskStatus(task, task.task_assignments) !== "Complete",
      )
      .sort(byDueDate)
      .map(taskItem),
    ...approvalTasks
      .filter(
        (task) =>
          taskStatus(task, task.task_assignments) === "Awaiting approval" &&
          task.task_assignments?.officer_id !== actor.id &&
          canManageEvent(actor, [task.branch_id]),
      )
      .sort(byDueDate)
      .map(taskItem),
    ...warnings
      .filter((warning) =>
        warning.warning_approvals.some(
          (approval) =>
            approval.approver_id === actor.authUserId &&
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
      })),
  ];
  return {
    items: items.slice(0, ACTION_ITEM_LIMIT),
    hasMore: items.length > ACTION_ITEM_LIMIT,
  };
}

export async function loadDashboardActionItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: AuthorizationContext,
) {
  const taskQuery = () =>
    supabase
      .from("tasks")
      .select(taskSelection)
      .is("removed_at", null)
      .order("due_date")
      .order("id")
      .limit(queryLimit);
  const awaitingQuery = () =>
    taskQuery()
      .eq("approval_required", true)
      .not("task_assignments.completed_at", "is", null)
      .is("task_assignments.approved_at", null);

  // Reuse the same branch-management helpers as Task detail. Scope the query
  // before its limit so other branches cannot crowd out authorized approvals.
  const approvalBranches = actor.branchIds.filter((id) =>
    canManageEvent(actor, [id]),
  );
  const allBranches = canSeeAllBranches(actor);
  const approvals =
    allBranches || approvalBranches.length
      ? awaitingQuery().neq("task_assignments.officer_id", actor.id)
      : null;
  const [assigned, ownAwaiting, awaitingApproval, warnings] = await Promise.all(
    [
      taskQuery()
        .eq("task_assignments.officer_id", actor.id)
        .is("task_assignments.completed_at", null),
      awaitingQuery().eq("task_assignments.officer_id", actor.id),
      approvals && !allBranches
        ? approvals.in("branch_id", approvalBranches)
        : approvals,
      // Inner join, caller filters and existing RLS match the Officers workflow.
      // No reason or other warning details are fetched for this summary.
      supabase
        .from("officer_warnings")
        .select(
          "id,created_at,officers!officer_warnings_officer_id_fkey(name),warning_approvals!inner(approver_id,decision)",
        )
        .eq("status", "pending")
        .eq("warning_approvals.approver_id", actor.authUserId)
        .eq("warning_approvals.decision", "pending")
        .order("created_at")
        .order("id")
        .limit(queryLimit),
    ],
  );
  if (
    assigned.error ||
    ownAwaiting.error ||
    awaitingApproval?.error ||
    warnings.error
  )
    throw new Error("Failed to load dashboard action items");
  return dashboardActionItems(
    actor,
    [...assigned.data, ...ownAwaiting.data],
    awaitingApproval?.data ?? [],
    warnings.data,
  );
}
