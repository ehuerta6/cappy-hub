import {
  safeReturnTo,
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
import {
  formatCalendarDate,
  formatDateTime,
  formatLabel,
  formatTaskDueDate,
} from "@/lib/presentation";
import { taskStatus } from "@/lib/task-status";
import Link from "next/link";
import { TaskRemoveForm, TaskRestoreForm } from "../task-remove-form";
import TaskSelfAssignForm from "../task-action-form";
import {
  BulkTaskOfficersForm,
  RemoveTaskAssignmentForm,
  TaskCompletionControl,
} from "../task-officer-controls";

type TaskSection = "overview" | "assignments" | "events";
const TASK_DETAIL_PAGE_SIZE = 6;

function parsePage(value: string | string[] | undefined, totalPages: number) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  return Math.min(Number(value), Math.max(totalPages, 1));
}

function taskSectionUrl(
  taskId: string,
  section: TaskSection,
  returnTo: unknown,
  page?: number,
) {
  const query = new URLSearchParams();
  if (section !== "overview") query.set("section", section);
  if (page && page > 1)
    query.set(
      section === "assignments" ? "assignmentPage" : "eventPage",
      String(page),
    );
  const safeDestination = safeReturnTo(returnTo);
  if (safeDestination) query.set("returnTo", safeDestination);
  const search = query.toString();
  return `/tasks/${taskId}${search ? `?${search}` : ""}` as `/tasks/${string}`;
}

function TaskDetailPagination({
  taskId,
  section,
  page,
  totalPages,
  returnTo,
}: {
  taskId: string;
  section: Exclude<TaskSection, "overview">;
  page: number;
  totalPages: number;
  returnTo: unknown;
}) {
  if (totalPages < 2) return null;
  const controls = [
    { label: "Previous page", target: page - 1, text: "Previous" },
    { label: "Next page", target: page + 1, text: "Next" },
  ];
  return (
    <nav
      aria-label={`${section === "assignments" ? "Assignment" : "Linked Event"} pages`}
      className="flex items-center justify-between gap-3 text-sm"
    >
      <span className="text-muted">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {controls.map(({ label, target, text }) =>
          target < 1 || target > totalPages ? (
            <span
              key={label}
              aria-disabled="true"
              className="rounded border border-border px-3 py-1.5 text-muted"
            >
              {text}
            </span>
          ) : (
            <Link
              key={label}
              href={taskSectionUrl(taskId, section, returnTo, target)}
              aria-label={label}
              className="rounded border border-border px-3 py-1.5 hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
            >
              {text}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const { returnTo, feedback, section, assignmentPage, eventPage } =
    (await searchParams) ?? {};
  const actor = await getAuthorizationContext();
  const { id: taskIdParam } = await params;
  if (!/^-?[1-9]\d*$/.test(taskIdParam)) notFound();
  const taskId = Number(taskIdParam);
  const supabase = await createClient();
  const [result, officerResult, awardsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*,branches(name),task_officer_assignments(officer_id,assigned_at,completed_at,officers!task_officer_assignments_officer_id_fkey(id,name)),task_events(events(id,name,event_date,status,deleted_at))",
      )
      .eq("id", taskId)
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
  if (task.removed_at && !canManageTask) notFound();
  const alreadyAssigned = new Set(
    assignments.map(({ officer_id }) => officer_id),
  );
  const hasProtectedCompletion = assignments.some(
    (assignment) => assignment.completed_at !== null,
  );
  const canArchiveTask =
    !hasProtectedCompletion && awardsResult.data.length === 0;
  const availableOfficers = officerResult.data
    .filter((officer) => !alreadyAssigned.has(officer.id))
    .map(({ id, name }) => ({ id, name }));
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
  const activeSection: TaskSection =
    section === "assignments" || section === "events" ? section : "overview";
  const sortedEvents = [...task.task_events].sort(
    (left, right) =>
      left.events.event_date.localeCompare(right.events.event_date) ||
      left.events.name.localeCompare(right.events.name, "en", {
        sensitivity: "base",
      }) ||
      left.events.name.localeCompare(right.events.name, "en") ||
      left.events.id - right.events.id,
  );
  const assignmentPages = Math.ceil(assignments.length / TASK_DETAIL_PAGE_SIZE);
  const eventPages = Math.ceil(sortedEvents.length / TASK_DETAIL_PAGE_SIZE);
  const currentAssignmentPage = parsePage(assignmentPage, assignmentPages);
  const currentEventPage = parsePage(eventPage, eventPages);
  const visibleAssignments =
    activeSection === "assignments"
      ? sortedAssignments.slice(
          (currentAssignmentPage - 1) * TASK_DETAIL_PAGE_SIZE,
          currentAssignmentPage * TASK_DETAIL_PAGE_SIZE,
        )
      : sortedAssignments.slice(0, 4);
  const visibleEvents =
    activeSection === "events"
      ? sortedEvents.slice(
          (currentEventPage - 1) * TASK_DETAIL_PAGE_SIZE,
          currentEventPage * TASK_DETAIL_PAGE_SIZE,
        )
      : sortedEvents.slice(0, 4);

  return (
    <div className="space-y-4">
      <ContextualBackLink href="/tasks" returnTo={returnTo}>
        Back to tasks
      </ContextualBackLink>
      <PageHeader
        title={task.title}
        action={
          canManageTask && !task.removed_at ? (
            <ActionLink
              href={withReturnTo(`/tasks/${taskIdParam}/edit`, returnTo)}
            >
              {series?.data ? "Edit recurring task" : "Edit task"}
            </ActionLink>
          ) : undefined
        }
      />
      <SuccessNotice status={feedback} />
      <nav
        aria-label="Task detail sections"
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {(
          [
            ["overview", "Overview"],
            ["assignments", `Assignments (${assignments.length})`],
            ["events", `Linked Events (${sortedEvents.length})`],
          ] as const
        ).map(([target, label]) => (
          <Link
            key={target}
            href={taskSectionUrl(taskIdParam, target, returnTo)}
            aria-current={activeSection === target ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted ${activeSection === target ? "border-foreground font-medium" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {activeSection === "overview" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-label="Task overview" className="min-w-0 space-y-3">
            <SectionHeading title="Task overview" />
            {task.removed_at && (
              <p>Archived {formatDateTime(task.removed_at)}</p>
            )}
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
              <dd>{formatTaskDueDate(task.due_date)}</dd>
              <dt>Points</dt>
              <dd>
                <PointValue value={task.points} />
              </dd>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={currentStatus} />
              </dd>
              <dt>Your assignment</dt>
              <dd>
                {myAssignment
                  ? myAssignment.completed_at
                    ? "Completed"
                    : "Not completed"
                  : "Not assigned"}
              </dd>
            </dl>
            {series?.data && (
              <p className="text-sm text-muted">
                Recurring occurrence. Its due date, Officer assignments,
                completion, and points belong to this Task only.
              </p>
            )}
            {!task.removed_at && !myAssignment && (
              <TaskSelfAssignForm taskId={task.id} />
            )}
            {canManageTask && task.removed_at && (
              <TaskRestoreForm taskId={task.id} />
            )}
            {canManageTask && !task.removed_at && canArchiveTask && (
              <TaskRemoveForm
                taskId={task.id}
                series={series?.data ?? undefined}
                requestKey={series?.data ? crypto.randomUUID() : undefined}
              />
            )}
          </section>
          <div className="min-w-0 space-y-5">
            <section aria-label="Assignment preview" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <SectionHeading title="Assignments" />
                <Link
                  className="text-sm underline"
                  href={taskSectionUrl(taskIdParam, "assignments", returnTo)}
                >
                  View all
                </Link>
              </div>
              {assignments.length ? (
                <ul className="space-y-1">
                  {sortedAssignments
                    .slice(0, 4)
                    .map(
                      ({
                        officer_id,
                        completed_at,
                        officers: assignedOfficer,
                      }) => (
                        <li
                          key={officer_id}
                          className="flex flex-wrap justify-between gap-x-3"
                        >
                          <Link href={`/officers/${assignedOfficer.id}`}>
                            {assignedOfficer.name}
                          </Link>
                          <span className="text-sm text-muted">
                            {completed_at ? "Completed" : "Not completed"}
                          </span>
                        </li>
                      ),
                    )}
                </ul>
              ) : (
                <p>No Officers are assigned to this task.</p>
              )}
              {assignments.length > 4 && (
                <p className="text-sm text-muted">
                  Showing 4 of {assignments.length} assignments.
                </p>
              )}
            </section>
            <section aria-label="Linked Events preview" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <SectionHeading title="Linked Events" />
                <Link
                  className="text-sm underline"
                  href={taskSectionUrl(taskIdParam, "events", returnTo)}
                >
                  View all
                </Link>
              </div>
              {visibleEvents.length ? (
                <ul className="space-y-1">
                  {visibleEvents.map(({ events: linkedEvent }) => (
                    <li
                      key={linkedEvent.id}
                      className="flex flex-wrap justify-between gap-x-3"
                    >
                      <Link href={`/events/${linkedEvent.id}`}>
                        {linkedEvent.name}
                      </Link>
                      <span className="text-sm text-muted">
                        {linkedEvent.deleted_at
                          ? "Archived"
                          : linkedEvent.status === "cancelled"
                            ? "Cancelled"
                            : formatCalendarDate(linkedEvent.event_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No linked Events.</p>
              )}
              {sortedEvents.length > 4 && (
                <p className="text-sm text-muted">
                  Showing 4 of {sortedEvents.length} linked Events.
                </p>
              )}
            </section>
          </div>
        </div>
      ) : activeSection === "events" ? (
        <section aria-label="Linked Events" className="min-w-0 space-y-3">
          <SectionHeading title="Linked Events" />
          {visibleEvents.length ? (
            <ul className="space-y-2">
              {visibleEvents.map(({ events: linkedEvent }) => (
                <li
                  key={linkedEvent.id}
                  className="flex flex-wrap justify-between gap-x-4"
                >
                  <Link href={`/events/${linkedEvent.id}`}>
                    {linkedEvent.name}
                  </Link>
                  <span className="text-sm text-muted">
                    {linkedEvent.deleted_at
                      ? "Archived"
                      : linkedEvent.status === "cancelled"
                        ? "Cancelled"
                        : formatCalendarDate(linkedEvent.event_date)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No linked Events.</p>
          )}
          {sortedEvents.length > 4 && (
            <p className="text-sm text-muted">
              Showing {visibleEvents.length} of {sortedEvents.length} linked
              Events.
            </p>
          )}
          <TaskDetailPagination
            taskId={taskIdParam}
            section="events"
            page={currentEventPage}
            totalPages={eventPages}
            returnTo={returnTo}
          />
        </section>
      ) : (
        <section aria-label="Officers" className="min-w-0 space-y-3">
          <SectionHeading title="Assignments" />
          {!task.removed_at && !myAssignment && (
            <TaskSelfAssignForm taskId={task.id} />
          )}
          {assignments.length === 0 ? (
            <p>No Officers are assigned to this task.</p>
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
                  {visibleAssignments.map((assignment) => {
                    const assignedOfficer = assignment.officers;
                    const completed = assignment.completed_at !== null;
                    const hasAward = awardsResult.data.some(
                      (award) => award.officer_id === assignment.officer_id,
                    );
                    const canRemoveAssignment = !completed && !hasAward;
                    return (
                      <tr key={assignment.officer_id}>
                        <td>
                          <Link href={`/officers/${assignedOfficer.id}`}>
                            {assignedOfficer.name}
                          </Link>
                        </td>
                        <td>
                          {canManageTask && !task.removed_at ? (
                            <TaskCompletionControl
                              taskId={task.id}
                              officerId={assignment.officer_id}
                              officerName={assignedOfficer.name}
                              completed={completed}
                            />
                          ) : completed ? (
                            "Completed"
                          ) : (
                            "Not completed"
                          )}
                        </td>
                        {canManageTask && !task.removed_at && (
                          <td>
                            {canRemoveAssignment ? (
                              <RemoveTaskAssignmentForm
                                taskId={task.id}
                                officerId={assignment.officer_id}
                                officerName={assignedOfficer.name}
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
          {canManageTask && !task.removed_at && (
            <BulkTaskOfficersForm
              taskId={task.id}
              officers={availableOfficers}
            />
          )}
          <TaskDetailPagination
            taskId={taskIdParam}
            section="assignments"
            page={currentAssignmentPage}
            totalPages={assignmentPages}
            returnTo={returnTo}
          />
        </section>
      )}
    </div>
  );
}
