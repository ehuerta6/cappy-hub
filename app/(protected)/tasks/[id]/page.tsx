import {
  safeReturnTo,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ContextualBackLink from "@/components/contextual-back-link";
import { ListPagination } from "@/components/list-pagination";
import type { Route } from "next";
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
import { taskStatusFromCounts } from "@/lib/task-status";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskRemoveForm, TaskRestoreForm } from "../task-remove-form";
import TaskSelfAssignForm from "../task-action-form";
import {
  BulkTaskOfficersForm,
  RemoveTaskAssignmentForm,
  TaskCompletionControl,
} from "../task-officer-controls";

type TaskSection = "overview" | "assignments" | "events";
const TASK_DETAIL_PREVIEW_SIZE = 4;
const TASK_DETAIL_PAGE_SIZE = 6;

function parseRequestedPage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? Math.min(page, 100_000) : 1;
}

function isCanonicalPage(value: string | string[] | undefined, page: number) {
  return value === (page > 1 ? String(page) : undefined);
}

function taskSectionUrl(
  taskId: string,
  section: TaskSection,
  returnTo: unknown,
  page?: number,
  feedback?: unknown,
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
  if (feedback === "task-created" || feedback === "task-updated")
    query.set("feedback", feedback);
  const search = query.toString();
  return `/tasks/${taskId}${search ? `?${search}` : ""}` as `/tasks/${string}`;
}

function TaskDetailPagination({
  taskId,
  section,
  page,
  totalPages,
  returnTo,
  feedback,
}: {
  taskId: string;
  section: Exclude<TaskSection, "overview">;
  page: number;
  totalPages: number;
  returnTo: unknown;
  feedback: unknown;
}) {
  if (totalPages < 2) return null;
  const pageParam = section === "assignments" ? "assignmentPage" : "eventPage";
  const filters = new URLSearchParams();
  filters.set("section", section);
  const destination = safeReturnTo(returnTo);
  if (destination) filters.set("returnTo", destination);
  if (feedback === "task-created" || feedback === "task-updated")
    filters.set("feedback", feedback);
  return (
    <ListPagination
      pathname={`/tasks/${taskId}` as Route}
      label={`${section === "assignments" ? "Assignment" : "Linked Event"} list`}
      filters={filters}
      page={page}
      totalPages={totalPages}
      pageParam={pageParam}
      getPageHref={(target) =>
        taskSectionUrl(taskId, section, returnTo, target, feedback) as Route
      }
    />
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
  const taskResult = await supabase
    .from("tasks")
    .select("*,branches(name)")
    .eq("id", taskId)
    .maybeSingle();
  if (taskResult.error) throw new Error("Failed to load task");
  if (!taskResult.data) notFound();

  const task = taskResult.data;
  const canManageTask = canManageEvent(actor, [task.branch_id]);
  if (task.removed_at && !canManageTask) notFound();
  const activeSection: TaskSection =
    section === "assignments" || section === "events" ? section : "overview";
  const requestedAssignmentPage = parseRequestedPage(
    activeSection === "assignments" ? assignmentPage : undefined,
  );
  const requestedEventPage = parseRequestedPage(
    activeSection === "events" ? eventPage : undefined,
  );
  const assignmentPageSize =
    activeSection === "assignments"
      ? TASK_DETAIL_PAGE_SIZE
      : TASK_DETAIL_PREVIEW_SIZE;
  const eventPageSize =
    activeSection === "events"
      ? TASK_DETAIL_PAGE_SIZE
      : TASK_DETAIL_PREVIEW_SIZE;
  const [
    assignmentsResult,
    eventsResult,
    incompleteAssignmentsResult,
    actorAssignmentResult,
    awardsResult,
    assignedOfficerIdsResult,
    officersResult,
  ] = await Promise.all([
    supabase
      .from("task_officer_assignments")
      .select(
        "officer_id,assigned_at,completed_at,officers!task_officer_assignments_officer_id_fkey(id,name)",
        { count: "exact" },
      )
      .eq("task_id", taskId)
      .order("name", { referencedTable: "officers", ascending: true })
      .order("officer_id", { ascending: true })
      .range(
        (requestedAssignmentPage - 1) * assignmentPageSize,
        requestedAssignmentPage * assignmentPageSize - 1,
      ),
    supabase
      .from("task_events")
      .select("event_id,events!inner(id,name,event_date,status,deleted_at)", {
        count: "exact",
      })
      .eq("task_id", taskId)
      .order("event_date", { referencedTable: "events", ascending: true })
      .order("name", { referencedTable: "events", ascending: true })
      .order("event_id", { ascending: true })
      .range(
        (requestedEventPage - 1) * eventPageSize,
        requestedEventPage * eventPageSize - 1,
      ),
    supabase
      .from("task_officer_assignments")
      .select("officer_id", { count: "exact", head: true })
      .eq("task_id", taskId)
      .is("completed_at", null),
    supabase
      .from("task_officer_assignments")
      .select("officer_id,completed_at")
      .eq("task_id", taskId)
      .eq("officer_id", actor.id)
      .maybeSingle(),
    supabase
      .from("point_transactions")
      .select("id", { count: "exact", head: true })
      .eq("task_id", taskId)
      .eq("award_type", "task"),
    canManageTask && !task.removed_at
      ? supabase
          .from("task_officer_assignments")
          .select("officer_id")
          .eq("task_id", taskId)
      : Promise.resolve({ data: [], error: null }),
    canManageTask && !task.removed_at
      ? supabase
          .from("officers")
          .select("id,name")
          .eq("status", "active")
          .order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (
    assignmentsResult.error ||
    eventsResult.error ||
    incompleteAssignmentsResult.error ||
    actorAssignmentResult.error ||
    awardsResult.error ||
    assignedOfficerIdsResult.error ||
    officersResult.error ||
    assignmentsResult.count === null ||
    eventsResult.count === null ||
    incompleteAssignmentsResult.count === null ||
    awardsResult.count === null
  )
    throw new Error("Failed to load task details");
  const assignmentCount = assignmentsResult.count;
  const eventCount = eventsResult.count;
  const incompleteAssignmentCount = incompleteAssignmentsResult.count;
  const hasProtectedCompletion = incompleteAssignmentCount < assignmentCount;
  const canArchiveTask = !hasProtectedCompletion && awardsResult.count === 0;
  const assignedOfficerIds = new Set(
    (assignedOfficerIdsResult.data ?? []).map(({ officer_id }) => officer_id),
  );
  const availableOfficers = (officersResult.data ?? [])
    .filter((officer) => !assignedOfficerIds.has(officer.id))
    .map(({ id, name }) => ({ id, name }));
  const assignments = assignmentsResult.data ?? [];
  const linkedEvents = eventsResult.data ?? [];
  const assignmentPageAwardsResult =
    canManageTask &&
    !task.removed_at &&
    activeSection === "assignments" &&
    assignments.length > 0
      ? await supabase
          .from("point_transactions")
          .select("officer_id")
          .eq("task_id", taskId)
          .eq("award_type", "task")
          .in(
            "officer_id",
            assignments.map(({ officer_id }) => officer_id),
          )
      : { data: [], error: null };
  if (assignmentPageAwardsResult.error)
    throw new Error("Failed to load Task assignment history");
  const visibleAssignments = assignments;
  const visibleEvents = linkedEvents;
  const series =
    task.recurrence_series_id === null
      ? undefined
      : await supabase
          .from("task_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", task.recurrence_series_id)
          .single();
  if (series?.error) throw new Error("Failed to load recurring series");
  const myAssignment = actorAssignmentResult.data;
  const currentStatus = taskStatusFromCounts(
    assignmentCount,
    incompleteAssignmentCount,
  );
  const assignmentPages = Math.max(
    1,
    Math.ceil(assignmentCount / TASK_DETAIL_PAGE_SIZE),
  );
  const eventPages = Math.max(1, Math.ceil(eventCount / TASK_DETAIL_PAGE_SIZE));
  const currentAssignmentPage = Math.min(
    requestedAssignmentPage,
    assignmentPages,
  );
  const currentEventPage = Math.min(requestedEventPage, eventPages);
  const activePage =
    activeSection === "assignments"
      ? currentAssignmentPage
      : activeSection === "events"
        ? currentEventPage
        : 1;
  const activePageValue =
    activeSection === "assignments"
      ? assignmentPage
      : activeSection === "events"
        ? eventPage
        : undefined;
  const sectionIsCanonical =
    activeSection === "overview"
      ? section === undefined
      : section === activeSection;
  const pageParamsAreCanonical =
    (activeSection === "assignments" || eventPage === undefined) &&
    (activeSection === "events" || assignmentPage === undefined) &&
    isCanonicalPage(activePageValue, activePage);
  const safeFeedback =
    feedback === "task-created" || feedback === "task-updated"
      ? feedback
      : undefined;
  if (
    !sectionIsCanonical ||
    !pageParamsAreCanonical ||
    safeReturnTo(returnTo) !== returnTo ||
    safeFeedback !== feedback
  )
    redirect(
      taskSectionUrl(
        taskIdParam,
        activeSection,
        returnTo,
        activePage,
        safeFeedback,
      ),
    );

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
            ["assignments", `Assignments (${assignmentCount})`],
            ["events", `Linked Events (${eventCount})`],
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
              {visibleAssignments.length ? (
                <ul className="space-y-1">
                  {visibleAssignments.map(
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
              {assignmentCount > TASK_DETAIL_PREVIEW_SIZE && (
                <p className="text-sm text-muted">
                  Showing {visibleAssignments.length} of {assignmentCount}{" "}
                  assignments.
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
              {eventCount > TASK_DETAIL_PREVIEW_SIZE && (
                <p className="text-sm text-muted">
                  Showing {visibleEvents.length} of {eventCount} linked Events.
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
          {eventCount > TASK_DETAIL_PREVIEW_SIZE && (
            <p className="text-sm text-muted">
              Showing {visibleEvents.length} of {eventCount} linked Events.
            </p>
          )}
          <TaskDetailPagination
            taskId={taskIdParam}
            section="events"
            page={currentEventPage}
            totalPages={eventPages}
            returnTo={returnTo}
            feedback={feedback}
          />
        </section>
      ) : (
        <section aria-label="Officers" className="min-w-0 space-y-3">
          <SectionHeading title="Assignments" />
          {!task.removed_at && !myAssignment && (
            <TaskSelfAssignForm taskId={task.id} />
          )}
          {assignmentCount === 0 ? (
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
                    const hasAward = assignmentPageAwardsResult.data.some(
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
            feedback={feedback}
          />
        </section>
      )}
    </div>
  );
}
