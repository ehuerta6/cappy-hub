import {
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ContextualBackLink from "@/components/contextual-back-link";
import {
  ActionLink,
  BranchBadges,
  PageHeader,
  PointValue,
  SectionHeading,
  StatusBadge,
  SuccessNotice,
  TableFrame,
} from "@/components/ui";
import { formatLabel } from "@/lib/presentation";
import { taskStatus } from "@/lib/task-status";
import Link from "next/link";
import { TaskRemoveForm } from "../task-remove-form";
import TaskSelfAssignForm from "../task-action-form";
import {
  BulkTaskOfficersForm,
  RemoveTaskAssignmentForm,
  TaskCompletionControl,
} from "../task-officer-controls";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const { returnTo, feedback } = (await searchParams) ?? {};
  const actor = await getAuthorizationContext();
  const { id: taskIdParam } = await params;
  if (!/^-?[1-9]\d*$/.test(taskIdParam)) notFound();
  const taskId = Number(taskIdParam);
  const supabase = await createClient();
  const [result, officerResult, awardsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*,branches(name),task_officer_assignments(officer_id,assigned_at,completed_at,officers!task_officer_assignments_officer_id_fkey(id,name))",
      )
      .eq("id", taskId)
      .is("removed_at", null)
      .maybeSingle(),
    supabase
      .from("officers")
      .select("id,name")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("point_transactions")
      .select("id,officer_id,removed_at")
      .eq("task_id", taskId)
      .eq("award_type", "task"),
  ]);
  if (result.error || officerResult.error || awardsResult.error)
    throw new Error("Failed to load task");
  if (!result.data) notFound();

  const task = result.data;
  const assignments = task.task_officer_assignments;
  const sortedAssignments = [...assignments].sort(
    (left, right) =>
      left.officers.name.localeCompare(right.officers.name, "en", {
        sensitivity: "base",
      }) ||
      left.officers.name.localeCompare(right.officers.name, "en") ||
      left.officer_id - right.officer_id,
  );
  const canManageTask = canManageEvent(actor, [task.branch_id]);
  const alreadyAssigned = new Set(
    assignments.map(({ officer_id }) => officer_id),
  );
  const availableOfficers = officerResult.data
    .filter((officer) => !alreadyAssigned.has(officer.id))
    .map(({ id, name }) => ({ id, name }));
  const hasProtectedCompletion = assignments.some(
    (assignment) => assignment.completed_at !== null,
  );
  const canRemoveTask =
    !hasProtectedCompletion && awardsResult.data.length === 0;
  const series =
    task.recurrence_series_id === null
      ? undefined
      : await supabase
          .from("task_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", task.recurrence_series_id)
          .single();
  if (series?.error) throw new Error("Failed to load recurring series");
  const myAssignment = assignments.find(
    ({ officer_id }) => officer_id === actor.id,
  );
  const currentStatus = taskStatus(assignments);

  return (
    <div className="space-y-4">
      <ContextualBackLink href="/tasks" returnTo={returnTo}>
        Back to tasks
      </ContextualBackLink>
      <PageHeader
        title={task.title}
        action={
          canManageTask ? (
            <ActionLink
              href={withReturnTo(`/tasks/${taskIdParam}/edit`, returnTo)}
            >
              {series?.data ? "Edit recurring task" : "Edit task"}
            </ActionLink>
          ) : undefined
        }
      />
      <SuccessNotice status={feedback} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          aria-label="Task details"
          className="min-w-0 space-y-4 rounded-lg border border-border p-4"
        >
          <SectionHeading title="Task details" />
          <p className="whitespace-pre-wrap break-words">
            {task.description || "No description"}
          </p>
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm [&>dt]:mt-0 [&>dd]:mt-0 [&>dd]:min-w-0 [&>dd]:break-words">
            <dt>Type</dt>
            <dd>{formatLabel(task.task_type)}</dd>
            <dt>Branch</dt>
            <dd>
              <BranchBadges branches={[task.branches.name]} />
            </dd>
            <dt>Due date</dt>
            <dd>{task.due_date}</dd>
            <dt>Points</dt>
            <dd>
              <PointValue value={task.points} />
            </dd>
            <dt>Task status</dt>
            <dd>
              <StatusBadge status={currentStatus} />
            </dd>
          </dl>
          {series?.data && (
            <p className="text-sm text-muted">
              Recurring occurrence. Its due date, Officer assignments,
              completion, and points belong to this Task only.
            </p>
          )}
          {canManageTask && canRemoveTask && (
            <TaskRemoveForm
              taskId={task.id}
              series={series?.data ?? undefined}
              requestKey={series?.data ? crypto.randomUUID() : undefined}
            />
          )}
        </section>

        <section
          aria-label="Officers"
          className="min-w-0 space-y-4 rounded-lg border border-border p-4"
        >
          <SectionHeading title="Officers" />
          <p>
            Your assignment:{" "}
            {myAssignment
              ? myAssignment.completed_at
                ? "Completed"
                : "Not completed"
              : "Not assigned"}
          </p>
          {!myAssignment && <TaskSelfAssignForm taskId={task.id} />}
          {assignments.length === 0 ? (
            <p>No Officers are assigned to this task.</p>
          ) : (
            <TableFrame compact>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Officer</th>
                    <th scope="col">Completion</th>
                    {canManageTask && <th scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedAssignments.map((assignment) => {
                    const officer = assignment.officers;
                    const completed = assignment.completed_at !== null;
                    const hasAward = awardsResult.data.some(
                      (award) => award.officer_id === assignment.officer_id,
                    );
                    const canRemoveAssignment = !completed && !hasAward;
                    return (
                      <tr key={assignment.officer_id}>
                        <td>
                          <Link href={`/officers/${officer.id}`}>
                            {officer.name}
                          </Link>
                        </td>
                        <td>
                          {canManageTask ? (
                            <TaskCompletionControl
                              taskId={task.id}
                              officerId={assignment.officer_id}
                              officerName={officer.name}
                              completed={completed}
                            />
                          ) : completed ? (
                            "Completed"
                          ) : (
                            "Not completed"
                          )}
                        </td>
                        {canManageTask && (
                          <td>
                            {canRemoveAssignment ? (
                              <RemoveTaskAssignmentForm
                                taskId={task.id}
                                officerId={assignment.officer_id}
                                officerName={officer.name}
                              />
                            ) : (
                              <span className="text-sm text-muted">
                                History protected
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableFrame>
          )}
          {canManageTask && (
            <div className="space-y-3 border-t border-border pt-4">
              <SectionHeading title="Add officers" />
              <BulkTaskOfficersForm
                taskId={task.id}
                officers={availableOfficers}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
