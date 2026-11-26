import {
  getAuthorizationContext,
  canSeeAllBranches,
  isLead,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  ActionLink,
  Badge,
  BranchBadges,
  CatalogValueBadge,
  ListFilterBar,
  PageHeader,
  StatusBadge,
  SuccessNotice,
  TableFrame,
  type ActiveFilterChip,
} from "@/components/ui";
import {
  formatLabel,
  formatRelativeDayCue,
  formatTaskDeadline,
} from "@/lib/presentation";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { organizeTaskList } from "@/lib/task-list";
import {
  buildTaskListQuery,
  taskListDateFilters,
  type TaskListSort,
} from "@/lib/task-list-query";
import { taskListFiltersSchema } from "./filter-validation";
import { SearchableSelect } from "@/components/searchable-select";
import { taskStatus } from "@/lib/task-status";
import TaskSelfAssignForm, { TaskSelfCompletionForm } from "./task-action-form";
import TaskAssignmentProgress from "./task-assignment-progress";
import { listReturnUrl, withReturnTo } from "@/lib/return-context";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import type { Route } from "next";

type TaskListRow = Tables<"tasks"> & {
  branches: Pick<Tables<"branches">, "name" | "color">;
  task_types: Pick<Tables<"task_types">, "color">;
  task_officer_assignments: Pick<
    Tables<"task_officer_assignments">,
    "officer_id" | "completed_at" | "completion_approval_pending" | "removed_at"
  >[];
};

type TaskListSearchParams = Record<string, string | string[] | undefined>;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TaskListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const params = await searchParams;
  const periodData = await getAcademicPeriodData();
  const periodSelection = resolveAcademicPeriod(params.period, periodData);
  const selectedPeriod = periodSelection.period;
  const filters = taskListFiltersSchema.parse(params);
  const {
    q: search,
    status,
    branch: branchId,
    assignee: assigneeId,
    scope,
    sort,
  } = filters;
  const hasOwnBranches = actor.branchIds.length > 0;
  const effectiveScope = scope === "branch" && !hasOwnBranches ? "all" : scope;
  const mayBrowseDeleted =
    canSeeAllBranches(actor) || (isLead(actor) && actor.branchIds.length > 0);
  const view =
    filters.view === "deleted" && !mayBrowseDeleted
      ? "current"
      : (filters.view ?? "current");
  const { today, sunday } = currentDenverWeek(new Date());
  const returnTo = listReturnUrl("/tasks", {
    q: search,
    view: view === "current" ? undefined : view,
    status,
    branch: branchId?.toString(),
    assignee: assigneeId?.toString(),
    scope: effectiveScope !== "all" ? effectiveScope : undefined,
    sort: sort === "newest" ? sort : undefined,
    period: params.period,
  });
  const supabase = await createClient();
  const dateRange =
    selectedPeriod && view !== "deleted"
      ? { from: selectedPeriod.starts_on, through: selectedPeriod.ends_on }
      : undefined;
  const dateFilters = taskListDateFilters({
    view,
    today,
    dateRange,
  });
  const tasksQuery = buildTaskListQuery(supabase, {
    view,
    sort: sort as TaskListSort,
    today,
    search,
    status,
    branchId,
    assigneeId,
    assignedToOfficerId: effectiveScope === "mine" ? actor.id : undefined,
    branchScope:
      (view === "deleted" && isLead(actor) && !canSeeAllBranches(actor)) ||
      effectiveScope === "branch"
        ? actor.branchIds
        : undefined,
    dateRange,
  });

  let taskCountQuery = supabase
    .from("tasks")
    .select(
      effectiveScope === "mine"
        ? "id,assigned_to_me:task_officer_assignments!inner(officer_id,removed_at)"
        : "id",
      { count: "exact", head: true },
    );
  if (effectiveScope === "mine")
    taskCountQuery = taskCountQuery
      .eq("assigned_to_me.officer_id", actor.id)
      .is("assigned_to_me.removed_at", null);
  if (view === "deleted")
    taskCountQuery = taskCountQuery.not("removed_at", "is", null);
  else {
    taskCountQuery = taskCountQuery.is("removed_at", null);
    if ("from" in dateFilters && dateFilters.from)
      taskCountQuery = taskCountQuery.gte("due_date", dateFilters.from);
    if ("through" in dateFilters && dateFilters.through)
      taskCountQuery = taskCountQuery.lte("due_date", dateFilters.through);
    if ("before" in dateFilters && dateFilters.before)
      taskCountQuery = taskCountQuery.lt("due_date", dateFilters.before);
  }
  if (view === "deleted" && isLead(actor) && !canSeeAllBranches(actor))
    taskCountQuery = taskCountQuery.in("branch_id", actor.branchIds);

  const [tasksResult, taskCountResult, branchesResult, officersResult] =
    await Promise.all([
      tasksQuery,
      taskCountQuery,
      supabase.from("branches").select("id,name,color").order("name"),
      supabase.from("officers").select("id,name,status").order("name"),
    ]);
  if (
    tasksResult.error ||
    taskCountResult.error ||
    branchesResult.error ||
    officersResult.error
  )
    throw new Error("Failed to load tasks");

  const totalCount = tasksResult.count ?? 0;
  const tasks = tasksResult.data as unknown as TaskListRow[];
  const deletedTasks = view === "deleted" ? tasks : [];
  const organizedTasks = organizeTaskList(tasks, view, today, sunday, sort);
  const filteredToNothing =
    totalCount === 0 &&
    (taskCountResult.count ?? 0) > 0 &&
    Boolean(
      search ||
      status ||
      branchId !== undefined ||
      assigneeId !== undefined ||
      effectiveScope !== "all",
    );
  const hasFilters = Boolean(
    search ||
    status ||
    branchId !== undefined ||
    assigneeId !== undefined ||
    effectiveScope !== "all" ||
    sort !== "urgency" ||
    view !== "current",
  );

  const filtersInUrl = new URLSearchParams();
  if (params.period !== undefined)
    filtersInUrl.set("period", String(params.period));
  if (search) filtersInUrl.set("q", search);
  if (view !== "current") filtersInUrl.set("view", view);
  if (status) filtersInUrl.set("status", status);
  if (branchId !== undefined) filtersInUrl.set("branch", String(branchId));
  if (assigneeId !== undefined)
    filtersInUrl.set("assignee", String(assigneeId));
  if (effectiveScope !== "all") filtersInUrl.set("scope", effectiveScope);
  if (sort === "newest") filtersInUrl.set("sort", "newest");
  const clearFiltersQuery = new URLSearchParams();
  if (params.period !== undefined)
    clearFiltersQuery.set("period", String(params.period));
  const clearFiltersHref = clearFiltersQuery.size
    ? (`/tasks?${clearFiltersQuery.toString()}` as Route)
    : "/tasks";
  const quickViewHref = (nextScope: "all" | "mine" | "branch") => {
    const query = new URLSearchParams(filtersInUrl);
    if (nextScope !== "all") query.set("scope", nextScope);
    else query.delete("scope");
    query.delete("page");
    const serialized = query.toString();
    return (serialized ? `/tasks?${serialized}` : "/tasks") as Route;
  };
  const renderGroup = (
    sectionTitle: string,
    title: string,
    groupTasks: typeof tasks,
    allowSelfAssign: boolean,
    allowSelfCompletion: boolean,
  ) =>
    groupTasks.length > 0 ? (
      <TableFrame compact label={`Tasks table: ${sectionTitle}: ${title}`}>
        <table>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Due</th>
              <th scope="col">Type</th>
              <th scope="col">Branch</th>
              <th scope="col">Officers</th>
              <th scope="col">Status</th>
              {(allowSelfAssign || allowSelfCompletion) && (
                <th scope="col">Action</th>
              )}
            </tr>
          </thead>
          <tbody>
            {groupTasks.map((task) => {
              const assignments = task.task_officer_assignments;
              const ownAssignment = assignments.find(
                (assignment) => assignment.officer_id === actor.id,
              );
              const pendingApprovalCount = assignments.filter(
                (assignment) =>
                  assignment.removed_at == null &&
                  assignment.completion_approval_pending,
              ).length;
              const taskState = taskStatus(assignments);
              const overdue =
                !task.no_longer_needed_at &&
                task.due_date < today &&
                taskState !== "Complete";
              return (
                <tr key={task.id} id={`task-${task.id}`}>
                  <td className="min-w-0">
                    <Link
                      href={withReturnTo(`/tasks/${task.id}`, returnTo)}
                      className="block break-words"
                    >
                      {task.title}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {overdue && <Badge tone="amber">Overdue</Badge>}
                      <span>
                        {formatTaskDeadline(task.due_date, task.due_time)}
                      </span>
                      {!overdue &&
                        (() => {
                          const cue = formatRelativeDayCue(task.due_date);
                          return cue ? (
                            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-muted">
                              {cue}
                            </span>
                          ) : null;
                        })()}
                    </span>
                  </td>
                  <td>
                    <CatalogValueBadge color={task.task_types?.color}>
                      {formatLabel(task.task_type)}
                    </CatalogValueBadge>
                  </td>
                  <td>
                    <BranchBadges branches={[task.branches]} />
                  </td>
                  <td>
                    <TaskAssignmentProgress assignments={assignments} />
                  </td>
                  <td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {task.no_longer_needed_at && (
                        <StatusBadge status="No longer needed" />
                      )}
                      {pendingApprovalCount > 0 && (
                        <Badge tone="amber">
                          {pendingApprovalCount} pending approval
                        </Badge>
                      )}
                      <StatusBadge status={taskState} />
                    </span>
                  </td>
                  {(allowSelfAssign || allowSelfCompletion) && (
                    <td className="min-w-0">
                      {allowSelfCompletion && ownAssignment ? (
                        <TaskSelfCompletionForm
                          taskId={task.id}
                          pendingApproval={
                            ownAssignment.completion_approval_pending ?? false
                          }
                          completed={Boolean(ownAssignment.completed_at)}
                        />
                      ) : allowSelfAssign ? (
                        <TaskSelfAssignForm taskId={task.id} />
                      ) : (
                        <span className="text-sm text-muted">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableFrame>
    ) : null;

  return (
    <div data-page-width="wide" data-nav-page="tasks" className="space-y-5">
      <PageHeader
        title="Tasks"
        description="Task assignments, due dates, and completion."
        action={
          !periodSelection.isHistorical &&
          (canSeeAllBranches(actor) ||
            (isLead(actor) && actor.branchIds.length > 0)) ? (
            <ActionLink
              href={
                `/tasks/new${params.period ? `?period=${params.period}` : ""}` as Route
              }
            >
              + New task
            </ActionLink>
          ) : undefined
        }
      />
      <SuccessNotice status={params.feedback} />
      <nav
        aria-label="Task quick views"
        className="flex flex-wrap gap-5 border-b border-border"
      >
        {[
          { scope: "all" as const, label: "All tasks" },
          { scope: "mine" as const, label: "Assigned to me" },
          ...(hasOwnBranches
            ? [
                {
                  scope: "branch" as const,
                  label:
                    actor.branchIds.length === 1 ? "My branch" : "My branches",
                },
              ]
            : []),
        ].map(({ scope: itemScope, label }) => (
          <Link
            key={itemScope}
            href={quickViewHref(itemScope)}
            aria-current={effectiveScope === itemScope ? "page" : undefined}
            className={`min-h-10 border-b-2 px-1 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${effectiveScope === itemScope ? "border-brand text-brand" : "border-transparent text-secondary hover:text-foreground"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ListFilterBar
        key={JSON.stringify(filters)}
        action="/tasks"
        label="Task filters"
        active={hasFilters}
        clearHref={clearFiltersHref}
        activeFilters={(() => {
          const chips: ActiveFilterChip[] = [];
          const without = (key: string): Route => {
            const next = new URLSearchParams(filtersInUrl);
            next.delete(key);
            const qs = next.toString();
            return (qs ? `/tasks?${qs}` : "/tasks") as Route;
          };
          if (search)
            chips.push({
              label: `Search: "${search}"`,
              removeHref: without("q"),
            });
          if (view !== "current")
            chips.push({
              label: `Timeframe: ${formatLabel(view)}`,
              removeHref: without("view"),
            });
          if (sort === "newest")
            chips.push({ label: "Sort: Newest", removeHref: without("sort") });
          if (status)
            chips.push({
              label: `Status: ${formatLabel(status)}`,
              removeHref: without("status"),
            });
          if (branchId !== undefined) {
            const name =
              branchesResult.data.find((b) => b.id === branchId)?.name ??
              String(branchId);
            chips.push({
              label: `Branch: ${formatLabel(name)}`,
              removeHref: without("branch"),
            });
          }
          if (assigneeId !== undefined) {
            const name =
              officersResult.data.find((o) => o.id === assigneeId)?.name ??
              `Officer #${assigneeId}`;
            chips.push({
              label: `Assignee: ${name}`,
              removeHref: without("assignee"),
            });
          }
          return chips;
        })()}
      >
        {params.period !== undefined && (
          <input type="hidden" name="period" value={String(params.period)} />
        )}
        {effectiveScope !== "all" && (
          <input type="hidden" name="scope" value={effectiveScope} />
        )}
        <label className="min-w-56 flex-1">
          Search tasks
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={100}
            placeholder="Title or description"
          />
        </label>
        <label className="min-w-40">
          Timeframe
          <select name="view" defaultValue={view}>
            <option value="current">Current</option>
            <option value="past">Past</option>
            <option value="all">All</option>
            {mayBrowseDeleted && <option value="deleted">Deleted</option>}
          </select>
        </label>
        <label className="min-w-40">
          Sort by
          <select name="sort" defaultValue={sort}>
            <option value="urgency">Most urgent</option>
            <option value="newest">Newest</option>
          </select>
        </label>
        <label className="min-w-44">
          Status
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="needs_approval">Needs approval</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label className="min-w-40">
          Branch
          <select name="branch" defaultValue={branchId ?? ""}>
            <option value="">All branches</option>
            {branchesResult.data.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {formatLabel(branch.name)}
              </option>
            ))}
          </select>
        </label>
        <div className="min-w-44 flex-1">
          <SearchableSelect
            name="assignee"
            label="Assignee"
            placeholder="All officers"
            initialValue={assigneeId?.toString() ?? ""}
            options={[
              { id: "", label: "All officers" },
              ...officersResult.data.map((officer) => ({
                id: String(officer.id),
                label: `${officer.name}${officer.status === "inactive" ? " (inactive)" : ""}`,
              })),
              ...(assigneeId !== undefined &&
              !officersResult.data.some((officer) => officer.id === assigneeId)
                ? [
                    {
                      id: String(assigneeId),
                      label: `Officer #${assigneeId} (name unavailable)`,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </ListFilterBar>

      {view !== "deleted" && tasks.length > 0 && (
        <p className="text-sm font-medium text-muted">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </p>
      )}
      {view === "deleted" ? (
        deletedTasks.length ? (
          renderGroup(
            "Deleted tasks",
            "Deleted tasks",
            deletedTasks,
            false,
            false,
          )
        ) : (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">No deleted Tasks.</p>
          </div>
        )
      ) : filteredToNothing ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
          <p className="text-sm text-muted">No tasks match these filters.</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
          <p className="text-sm text-muted">
            {selectedPeriod
              ? `No Tasks in ${selectedPeriod.name} for this view.`
              : view === "past"
                ? "No past tasks."
                : view === "all"
                  ? "No tasks in this view."
                  : "No current tasks."}
          </p>
        </div>
      ) : organizedTasks.view === "past" ? (
        organizedTasks.tasks.length > 0 ? (
          renderGroup("Tasks", "Tasks", organizedTasks.tasks, false, false)
        ) : null
      ) : organizedTasks.view === "all" ? (
        renderGroup(
          "Tasks",
          "Tasks",
          organizedTasks.tasks,
          !periodSelection.isHistorical,
          !periodSelection.isHistorical,
        )
      ) : (
        renderGroup(
          "Tasks",
          "Tasks",
          tasks,
          true,
          !periodSelection.isHistorical,
        )
      )}
    </div>
  );
}
