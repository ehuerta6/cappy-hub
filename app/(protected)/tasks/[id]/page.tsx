import {
  safeReturnTo,
  listReturnUrl,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import {
  getAuthorizationContext,
  canManageTask as canManageTaskForBranch,
  canChangeOtherTaskCompletion,
  isAdmin,
  isLead,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  academicPeriodForDate,
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { notFound } from "next/navigation";
import ContextualBackLink from "@/components/contextual-back-link";
import { CopyCanonicalLinkButton } from "@/components/copy-button";
import {
  ActionLink,
  BranchBadges,
  CatalogValueBadge,
  PageHeader,
  PointValue,
  SectionHeading,
  StatusBadge,
  SuccessNotice,
  TableFrame,
} from "@/components/ui";
import {
  formatCalendarDate,
  formatDateTime,
  formatLabel,
  formatTaskDeadline,
} from "@/lib/presentation";
import { taskStatusFromCounts } from "@/lib/task-status";
import Link from "next/link";
import {
  TaskDeleteForm,
  TaskNeedStatusForm,
  TaskRestoreForm,
} from "../task-remove-form";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { ResourceLinksList } from "@/components/resource-links-list";
import TaskSelfAssignForm, {
  TaskSelfCompletionForm,
} from "../task-action-form";
import {
  ApproveAllPendingButton,
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
  const context = (await searchParams) ?? {};
  const { returnTo, feedback } = context;
  const contextualReturnTo =
    safeReturnTo(returnTo) ?? listReturnUrl("/tasks", context);
  const [periodData, actor, { id: taskIdParam }, supabase] = await Promise.all([
    getAcademicPeriodData(),
    getAuthorizationContext(),
    params,
    createClient(),
  ]);
  const periodSelection = resolveAcademicPeriod(context.period, periodData);
  const selectedPeriod = periodSelection.period;
  if (!/^-?[1-9]\d*$/.test(taskIdParam)) notFound();
  const taskId = Number(taskIdParam);
  const taskResult = await supabase
    .from("tasks")
    .select("*,branches(name,color),task_types(color)")
    .eq("id", taskId)
    .maybeSingle();
  if (taskResult.error) throw new Error("Failed to load task");
  if (!taskResult.data) notFound();

  const task = taskResult.data;
  const { today } = currentDenverWeek(new Date());
  if (
    selectedPeriod &&
    (task.due_date < selectedPeriod.starts_on ||
      task.due_date > selectedPeriod.ends_on)
  )
    notFound();
  const taskPeriod = academicPeriodForDate(task.due_date, periodData.periods);
  const isHistorical =
    periodSelection.isHistorical ||
    (taskPeriod !== undefined && taskPeriod.ends_on < periodData.currentDate);
  const editPeriod = taskPeriod
    ? taskPeriod.id === periodData.currentPeriodId &&
      context.period === undefined
      ? null
      : String(taskPeriod.id)
    : periodSelection.explicitNoPeriod
      ? "none"
      : null;
  const canManageTask =
    !isHistorical && canManageTaskForBranch(actor, task.branch_id);
  const canChangeNeedStatus =
    !isHistorical && (isAdmin(actor) || isLead(actor));
  if (task.removed_at && !canManageTask) notFound();

  const [
    assignmentsResult,
    eventsResult,
    actorAssignmentResult,
    officersResult,
    resourceLinksResult,
    series,
  ] = await Promise.all([
    supabase
      .from("task_officer_assignments")
      .select(
        "officer_id,assigned_at,completed_at,completion_approval_pending,officers!task_officer_assignments_officer_id_fkey(id,name)",
      )
      .eq("task_id", taskId)
      .order("officers(name)", { ascending: true })
      .order("officer_id", { ascending: true }),
    supabase
      .from("task_events")
      .select("event_id,events!inner(id,name,event_date,status,deleted_at)")
      .eq("task_id", taskId)
      .order("events(event_date)", { ascending: true })
      .order("events(name)", { ascending: true })
      .order("event_id", { ascending: true }),
    supabase
      .from("task_officer_assignments")
      .select("officer_id,completed_at,completion_approval_pending")
      .eq("task_id", taskId)
      .eq("officer_id", actor.id)
      .maybeSingle(),
    canManageTask && !task.removed_at
      ? supabase
          .from("officers")
          .select("id,name,officer_branches(branches(name))")
          .eq("status", "active")
          .order("name")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("resource_links")
      .select("id,kind,label,url,legacy_key,sort_order")
      .eq("task_id", task.id)
      .order("sort_order")
      .order("id"),
    task.recurrence_series_id === null
      ? Promise.resolve(undefined)
      : supabase
          .from("task_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", task.recurrence_series_id)
          .single(),
  ]);
  if (
    assignmentsResult.error ||
    eventsResult.error ||
    actorAssignmentResult.error ||
    officersResult.error ||
    resourceLinksResult.error
  )
    throw new Error("Failed to load task details");
  if (series?.error) throw new Error("Failed to load recurring series");

  const assignments = [...(assignmentsResult.data ?? [])].sort(
    (left, right) => {
      const leftPending = left.completion_approval_pending ? 1 : 0;
      const rightPending = right.completion_approval_pending ? 1 : 0;
      return rightPending - leftPending;
    },
  );
  const linkedEvents = eventsResult.data ?? [];
  const assignmentCount = assignments.length;
  const incompleteAssignmentCount = assignments.filter(
    (assignment) =>
      assignment.completed_at === null ||
      assignment.completion_approval_pending,
  ).length;
  const assignedOfficerIds = new Set(
    assignments.map(({ officer_id }) => officer_id),
  );
  const availableOfficers = (officersResult.data ?? [])
    .filter((officer) => !assignedOfficerIds.has(officer.id))
    .map(({ id, name, officer_branches }) => ({
      id,
      name,
      branches: (officer_branches ?? [])
        .map((ob) => ob.branches?.name)
        .filter((b): b is string => Boolean(b)),
    }));
  const pendingApprovalOfficerIds = assignments
    .filter(
      (assignment) =>
        assignment.completion_approval_pending &&
        canChangeOtherTaskCompletion(actor, assignment.officer_id),
    )
    .map((assignment) => assignment.officer_id);
  const myAssignment = actorAssignmentResult.data;
  const currentStatus = taskStatusFromCounts(
    assignmentCount,
    incompleteAssignmentCount,
  );
  const hasActions =
    (canChangeNeedStatus &&
      !task.removed_at &&
      (task.no_longer_needed_at || task.due_date < today)) ||
    (!isHistorical &&
      !task.removed_at &&
      (!myAssignment || !myAssignment.completed_at)) ||
    canManageTask;

  const completedAssignmentCount = assignmentCount - incompleteAssignmentCount;
  const pendingApprovalCount = assignments.filter(
    (a) => a.completion_approval_pending,
  ).length;
  const yourAssignmentLabel = myAssignment?.completion_approval_pending
    ? "Awaiting approval"
    : myAssignment?.completed_at
      ? "Completed"
      : myAssignment
        ? "Not completed"
        : "Not assigned";

  return (
    <div data-record-page="task" className="space-y-5">
      <ContextualBackLink href="/tasks" returnTo={contextualReturnTo}>
        Back to tasks
      </ContextualBackLink>
      <PageHeader
        title={task.title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <CopyCanonicalLinkButton path={`/tasks/${taskIdParam}`} />
            {canManageTask && !task.removed_at && (
              <ActionLink
                href={withReturnTo(
                  `/tasks/${taskIdParam}/edit`,
                  contextualReturnTo,
                  editPeriod,
                )}
              >
                {series?.data ? "Edit recurring task" : "Edit task"}
              </ActionLink>
            )}
          </div>
        }
      />
      <SuccessNotice status={feedback} />

      {task.removed_at && (
        <div
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger"
        >
          Deleted {formatDateTime(task.removed_at)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Due
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatTaskDeadline(task.due_date, task.due_time)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Points
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            <PointValue value={task.points} />
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Status &amp; progress
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {task.no_longer_needed_at && (
              <StatusBadge status="No longer needed" />
            )}
            <StatusBadge status={currentStatus} />
            {assignmentCount > 0 && (
              <span className="text-xs tabular-nums text-muted">
                {completedAssignmentCount}/{assignmentCount} done
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Category
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CatalogValueBadge color={task.task_types?.color}>
              {formatLabel(task.task_type)}
            </CatalogValueBadge>
            <BranchBadges branches={[task.branches]} />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(19rem,1fr)]">
        <div className="min-w-0 space-y-5">
          <section
            aria-label="Task overview"
            className="min-w-0 space-y-4 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
          >
            <SectionHeading title="Task overview" />
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Description
              </h3>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {task.description || "No description"}
              </p>
            </div>
            <ResourceLinksList resources={resourceLinksResult.data} />
            {series?.data && (
              <p className="rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-xs text-muted">
                Recurring occurrence. Its due date, Officer assignments,
                completion, and points belong to this Task only.
              </p>
            )}
          </section>

          <section
            aria-label="Assignments"
            className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
          >
            <SectionHeading
              title={`Assignments (${assignmentCount})`}
              description={
                assignmentCount > 0
                  ? `${completedAssignmentCount} / ${assignmentCount} completed${
                      pendingApprovalCount > 0
                        ? ` · ${pendingApprovalCount} pending approval`
                        : ""
                    }${
                      canManageTask && !task.removed_at
                        ? " · Removing an assignment excludes its Task points."
                        : ""
                    }`
                  : undefined
              }
              action={
                !isHistorical &&
                !task.removed_at &&
                pendingApprovalOfficerIds.length > 0 ? (
                  <ApproveAllPendingButton
                    taskId={task.id}
                    officerIds={pendingApprovalOfficerIds}
                  />
                ) : undefined
              }
            />
            {assignmentCount === 0 ? (
              <p className="text-sm text-muted">
                No Officers are assigned to this task.
              </p>
            ) : (
              <TableFrame compact label="Task assignment progress">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Officer</th>
                      <th scope="col">Completion</th>
                      {canManageTask && !task.removed_at && (
                        <th scope="col">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((assignment) => {
                      const assignedOfficer = assignment.officers;
                      const completed = assignment.completed_at !== null;
                      const completionPending =
                        assignment.completion_approval_pending;
                      return (
                        <tr
                          key={assignment.officer_id}
                          className={
                            completionPending ? "bg-warning-bg/25" : undefined
                          }
                        >
                          <td>
                            <Link
                              href={withReturnTo(
                                `/officers/${assignedOfficer.id}`,
                                contextualReturnTo,
                              )}
                            >
                              {assignedOfficer.name}
                            </Link>
                          </td>
                          <td>
                            {!isHistorical &&
                            canChangeOtherTaskCompletion(
                              actor,
                              assignment.officer_id,
                            ) &&
                            !task.removed_at ? (
                              <TaskCompletionControl
                                taskId={task.id}
                                officerId={assignment.officer_id}
                                officerName={assignedOfficer.name}
                                completed={completed}
                                pendingApproval={completionPending}
                              />
                            ) : completionPending ? (
                              "Awaiting approval"
                            ) : completed ? (
                              "Completed"
                            ) : assignment.officer_id === actor.id &&
                              !isHistorical ? (
                              <TaskSelfCompletionForm taskId={task.id} />
                            ) : (
                              "Not completed"
                            )}
                          </td>
                          {canManageTask && !task.removed_at && (
                            <td>
                              <RemoveTaskAssignmentForm
                                taskId={task.id}
                                officerId={assignment.officer_id}
                                officerName={assignedOfficer.name}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableFrame>
            )}
            {canManageTask && !task.removed_at && (
              <BulkTaskOfficersForm
                taskId={task.id}
                officers={availableOfficers}
              />
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-5 lg:sticky lg:top-6">
          <section
            aria-label="Your status and actions"
            className="min-w-0 space-y-3.5 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
          >
            <SectionHeading title="Your assignment" />
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted/40 px-3.5 py-2.5 text-sm">
              <span className="text-muted">Status</span>
              <strong className="font-semibold text-foreground">
                {yourAssignmentLabel}
              </strong>
            </div>
            {!isHistorical &&
              !task.removed_at &&
              (!myAssignment || !myAssignment.completed_at) && (
                <div className="flex flex-wrap items-center gap-2 [&>form]:w-auto">
                  {!myAssignment && <TaskSelfAssignForm taskId={task.id} />}
                  {myAssignment && !myAssignment.completed_at && (
                    <TaskSelfCompletionForm taskId={task.id} />
                  )}
                </div>
              )}
            {hasActions &&
              (canManageTask ||
                (canChangeNeedStatus &&
                  !task.removed_at &&
                  (task.no_longer_needed_at || task.due_date < today))) && (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Task controls
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5 [&>form]:w-auto">
                    {canChangeNeedStatus &&
                      !task.removed_at &&
                      (task.no_longer_needed_at || task.due_date < today) && (
                        <TaskNeedStatusForm
                          taskId={task.id}
                          noLongerNeeded={Boolean(task.no_longer_needed_at)}
                        />
                      )}
                    {canManageTask && task.removed_at && (
                      <TaskRestoreForm
                        taskId={task.id}
                        series={series?.data ?? undefined}
                        requestKey={crypto.randomUUID()}
                      />
                    )}
                    {canManageTask && !task.removed_at && (
                      <TaskDeleteForm
                        taskId={task.id}
                        series={series?.data ?? undefined}
                        requestKey={crypto.randomUUID()}
                      />
                    )}
                  </div>
                </div>
              )}
          </section>

          <section
            aria-label="Linked Events"
            className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-5 [&>.section-heading:first-child]:mt-0"
          >
            <SectionHeading title={`Linked Events (${linkedEvents.length})`} />
            {linkedEvents.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface-muted/30 px-3 text-sm">
                {linkedEvents.map(({ events: linkedEvent }) => {
                  const linkedEventPeriod = academicPeriodForDate(
                    linkedEvent.event_date,
                    periodData.periods,
                  );
                  const linkedEventPeriodParam =
                    periodData.periods.length === 0
                      ? null
                      : linkedEventPeriod
                        ? linkedEventPeriod.id === periodData.currentPeriodId
                          ? null
                          : String(linkedEventPeriod.id)
                        : "none";
                  return (
                    <li
                      key={linkedEvent.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 py-2"
                    >
                      <Link
                        href={withReturnTo(
                          `/events/${linkedEvent.id}`,
                          contextualReturnTo,
                          linkedEventPeriodParam,
                        )}
                        className="font-medium text-foreground hover:text-brand hover:underline"
                      >
                        {linkedEvent.name}
                      </Link>
                      <span className="text-xs text-muted">
                        {linkedEvent.deleted_at
                          ? "Archived"
                          : linkedEvent.status === "cancelled"
                            ? "Cancelled"
                            : formatCalendarDate(linkedEvent.event_date)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">No linked Events.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
