import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ContextualBackLink from "@/components/contextual-back-link";
import {
  PageHeader,
  SectionHeading,
  PointValue,
  StatusBadge,
} from "@/components/ui";
import { formatLabel } from "@/lib/presentation";
import { TaskWorkflow, taskStatus } from "../task-workflow";
import { TaskRemoveForm } from "../task-remove-form";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getAuthorizationContext();
  const { id: taskIdParam } = await params;
  if (!/^-?[1-9]\d*$/.test(taskIdParam)) notFound();
  const taskId = Number(taskIdParam);
  const supabase = await createClient();
  const [result, officers] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*,branches(name),task_assignments(officer_id,completed_at,approved_at,officers!task_assignments_officer_id_fkey(name))",
      )
      .eq("id", taskId)
      .is("removed_at", null)
      .maybeSingle(),
    supabase
      .from("officers")
      .select("id,name")
      .eq("status", "active")
      .order("name"),
  ]);
  if (result.error || officers.error) throw new Error("Failed to load task");
  if (!result.data) notFound();
  const task = result.data;
  const assignment = task.task_assignments;
  const canManageTask = canManageEvent(actor, [task.branch_id]);
  return (
    <div className="space-y-6">
      <ContextualBackLink href="/tasks">Back to tasks</ContextualBackLink>
      <PageHeader title={task.title} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="min-w-0 space-y-4 rounded-lg border border-zinc-800 p-4">
          <SectionHeading title="Task details" />
          <p className="whitespace-pre-wrap break-words">
            {task.description || "No description"}
          </p>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt>Type</dt>
            <dd>{formatLabel(task.task_type)}</dd>
            <dt>Branch</dt>
            <dd>{task.branches.name}</dd>
            <dt>Due date</dt>
            <dd>{task.due_date}</dd>
            <dt>Points</dt>
            <dd>
              <PointValue value={task.points} />
            </dd>
          </dl>
        </section>
        <section className="min-w-0 space-y-4 rounded-lg border border-zinc-800 p-4">
          <SectionHeading title="Assignment and progress" />
          <p>Assignee: {assignment?.officers.name ?? "Unassigned"}</p>
          <StatusBadge status={taskStatus(task, assignment)} />
          <p>
            {task.approval_required
              ? "Approval required"
              : "No approval required"}
          </p>
          {task.recurrence_series_id !== null && (
            <p className="text-sm text-zinc-400">
              Recurring occurrence. Its due date, assignment, completion,
              approval and points belong to this Task only. Series editing is
              not supported.
            </p>
          )}
          <TaskWorkflow
            task={task}
            assignment={assignment}
            actorId={actor.id}
            canManage={canManageTask}
            officers={officers.data}
          />
          {canManageTask &&
          (!assignment || assignment.completed_at === null) ? (
            <TaskRemoveForm taskId={task.id} />
          ) : null}
        </section>
      </div>
    </div>
  );
}
