import {
  safeReturnTo,
  listReturnUrl,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import {
  getAuthorizationContext,
  canManageTask as canManageTaskForBranch,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
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
  formatTaskDeadline,
} from "@/lib/presentation";
import { taskStatusFromCounts } from "@/lib/task-status";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TaskDeleteForm, TaskRestoreForm } from "../task-remove-form";
import { ResourceLinksList } from "@/components/resource-links-list";
import TaskSelfAssignForm, {
  TaskSelfCompletionForm,
} from "../task-action-form";
import {
  BulkTaskOfficersForm,
  RemoveTaskAssignmentForm,
  TaskCompletionControl,
  TaskCompletionReviewControls,
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
  if (safeDestination) {
    query.set("returnTo", safeDestination);
    const period = new URL(
      safeDestination,
      "https://cappy.invalid",
    ).searchParams.get("period");
    if (period !== null) query.set("period", period);
  }
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
  const context = (await searchParams) ?? {};
  const { returnTo, feedback, section, assignmentPage, eventPage } = context;
  const contextualReturnTo =
    safeReturnTo(returnTo) ?? listReturnUrl("/tasks", context);
  const periodData = await getAcademicPeriodData();
  const periodSelection = resolveAcademicPeriod(context.period, periodData);
  const selectedPeriod = periodSelection.period;
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
  if (
    selectedPeriod &&
    (task.due_date < selectedPeriod.starts_on ||
      task.due_date > selectedPeriod.ends_on)
  )
    notFound();
  const canManageTask =
    !periodSelection.isHistorical &&
    canManageTaskForBranch(actor, task.branch_id);
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
    assignedOfficerIdsResult,
    officersResult,
    resourceLinksResult,
  ] = await Promise.all([
    supabase
      .from("task_officer_assignments")
      .select(
        "officer_id,assigned_at,completed_at,completion_approval_pending,officers!task_officer_assignments_officer_id_fkey(id,name)",
        { count: "exact" },
      )
      .eq("task_id", taskId)
      .order("officers(name)", { ascending: true })
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
      .order("events(event_date)", { ascending: true })
      .order("events(name)", { ascending: true })
      .order("event_id", { ascending: true })
      .range(
        (requestedEventPage - 1) * eventPageSize,
        requestedEventPage * eventPageSize - 1,
      ),
    supabase
      .from("task_officer_assignments")
      .select("officer_id", { count: "exact", head: true })
      .eq("task_id", taskId)
      .or("completed_at.is.null,completion_approval_pending.eq.true"),
    supabase
      .from("task_officer_assignments")
      .select("officer_id,completed_at,completion_approval_pending")
      .eq("task_id", taskId)
      .eq("officer_id", actor.id)
      .maybeSingle(),
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
    supabase
      .from("resource_links")
      .select("id,kind,label,url,legacy_key,sort_order")
      .eq("task_id", task.id)
      .order("sort_order")
      .order("id"),
  ]);
  if (
    assignmentsResult.error ||
    eventsResult.error ||
    incompleteAssignmentsResult.error ||
    actorAssignmentResult.error ||
    assignedOfficerIdsResult.error ||
    officersResult.error ||
    resourceLinksResult.error ||
    assignmentsResult.count === null ||
    eventsResult.count === null ||
    incompleteAssignmentsResult.count === null
  )
    throw new Error("Failed to load task details");
  const assignmentCount = assignmentsResult.count;
  const eventCount = eventsResult.count;
  const incompleteAssignmentCount = incompleteAssignmentsResult.count;
  const assignedOfficerIds = new Set(
    (assignedOfficerIdsResult.data ?? []).map(({ officer_id }) => officer_id),
  );
  const availableOfficers = (officersResult.data ?? [])
    .filter((officer) => !assignedOfficerIds.has(officer.id))
    .map(({ id, name }) => ({ id, name }));
  const assignments = assignmentsResult.data ?? [];
  const linkedEvents = eventsResult.data ?? [];
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
        contextualReturnTo,
        activePage,
        safeFeedback,
      ),
    );

  return (
    <div data-record-page="task" className="space-y-4">
      <ContextualBackLink href="/tasks" returnTo={contextualReturnTo}>
        Back to tasks
      </ContextualBackLink>
      <PageHeader
        title={task.title}
        action={
          canManageTask && !task.removed_at ? (
            <ActionLink
              href={withReturnTo(
                `/tasks/${taskIdParam}/edit`,
                contextualReturnTo,
              )}
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
            href={taskSectionUrl(taskIdParam, target, contextualReturnTo)}
            aria-current={activeSection === target ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${activeSection === target ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-foreground"}`}
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
              <p>Deleted {formatDateTime(task.removed_at)}</p>
            )}
            <p className="whitespace-pre-wrap break-words">
              {task.description || "No description"}
            </p>
            <ResourceLinksList resources={resourceLinksResult.data} />
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm [&>dt]:mt-0 [&>dd]:mt-0 [&>dd]:min-w-0 [&>dd]:break-words">
              <dt>Type</dt>
              <dd>{formatLabel(task.task_type)}</dd>
              <dt>Branch</dt>
              <dd>
                <BranchBadges branches={[task.branches.name]} />
              </dd>
              <dt>Due</dt>
              <dd>{formatTaskDeadline(task.due_date, task.due_time)}</dd>
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
                {myAssignment?.completion_approval_pending
                  ? "Awaiting approval"
                  : myAssignment?.completed_at
                    ? "Completed"
                    : myAssignment
                      ? "Not completed"
                      : "Not assigned"}
              </dd>
            </dl>
            {series?.data && (
              <p className="text-sm text-muted">
                Recurring occurrence. Its due date, Officer assignments,
                completion, and points belong to this Task only.
              </p>
            )}
            {!periodSelection.isHistorical &&
              !task.removed_at &&
              !myAssignment && <TaskSelfAssignForm taskId={task.id} />}
            {!periodSelection.isHistorical &&
              !task.removed_at &&
              myAssignment &&
              !myAssignment.completed_at && (
                <TaskSelfCompletionForm taskId={task.id} />
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
          </section>
          <div className="min-w-0 space-y-5">
            <section aria-label="Assignment preview" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <SectionHeading title={`Assignments (${assignmentCount})`} />
                {assignmentCount > 0 && (
                  <Link
                    className="text-sm underline"
                    href={taskSectionUrl(
                      taskIdParam,
                      "assignments",
                      contextualReturnTo,
                    )}
                  >
                    View all
                  </Link>
                )}
              </div>
              {visibleAssignments.length ? (
                <ul className="space-y-1">
                  {visibleAssignments.map(
                    ({
                      officer_id,
                      completed_at,
                      completion_approval_pending,
                      officers: assignedOfficer,
                    }) => (
                      <li
                        key={officer_id}
                        className="flex flex-wrap justify-between gap-x-3"
                      >
                        <Link
                          href={withReturnTo(
                            `/officers/${assignedOfficer.id}`,
                            contextualReturnTo,
                          )}
                        >
                          {assignedOfficer.name}
                        </Link>
                        <span className="text-sm text-muted">
                          {completion_approval_pending
                            ? "Awaiting approval"
                            : completed_at
                              ? "Completed"
                              : "Not completed"}
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
              {canManageTask && !task.removed_at && (
                <BulkTaskOfficersForm
                  taskId={task.id}
                  officers={availableOfficers}
                />
              )}
            </section>
            <section aria-label="Linked Events preview" className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <SectionHeading title="Linked Events" />
                {eventCount > 0 && (
                  <Link
                    className="text-sm underline"
                    href={taskSectionUrl(
                      taskIdParam,
                      "events",
                      contextualReturnTo,
                    )}
                  >
                    View all
                  </Link>
                )}
              </div>
              {visibleEvents.length ? (
                <ul className="space-y-1">
                  {visibleEvents.map(({ events: linkedEvent }) => (
                    <li
                      key={linkedEvent.id}
                      className="flex flex-wrap justify-between gap-x-3"
                    >
                      <Link
                        href={withReturnTo(
                          `/events/${linkedEvent.id}`,
                          contextualReturnTo,
                        )}
                      >
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
                  <Link
                    href={withReturnTo(
                      `/events/${linkedEvent.id}`,
                      contextualReturnTo,
                    )}
                  >
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
            returnTo={contextualReturnTo}
            feedback={feedback}
          />
        </section>
      ) : (
        <section aria-label="Officers" className="min-w-0 space-y-3">
          <SectionHeading title="Assignments" />
          {!periodSelection.isHistorical &&
            !task.removed_at &&
            !myAssignment && <TaskSelfAssignForm taskId={task.id} />}
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
                    const completionPending =
                      assignment.completion_approval_pending;
                    return (
                      <tr key={assignment.officer_id}>
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
                          {canManageTask &&
                          !task.removed_at &&
                          !completionPending ? (
                            <TaskCompletionControl
                              taskId={task.id}
                              officerId={assignment.officer_id}
                              officerName={assignedOfficer.name}
                              completed={completed}
                            />
                          ) : completionPending ? (
                            "Awaiting approval"
                          ) : completed ? (
                            "Completed"
                          ) : assignment.officer_id === actor.id &&
                            !periodSelection.isHistorical ? (
                            <TaskSelfCompletionForm taskId={task.id} />
                          ) : (
                            "Not completed"
                          )}
                        </td>
                        {canManageTask && !task.removed_at && (
                          <td>
                            {completionPending &&
                              assignment.officer_id !== actor.id && (
                                <TaskCompletionReviewControls
                                  taskId={task.id}
                                  officerId={assignment.officer_id}
                                />
                              )}
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
          <TaskDetailPagination
            taskId={taskIdParam}
            section="assignments"
            page={currentAssignmentPage}
            totalPages={assignmentPages}
            returnTo={contextualReturnTo}
            feedback={feedback}
          />
        </section>
      )}
    </div>
  );
}
