import {
  getAuthorizationContext,
  canSeeAllBranches,
  isLead,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  ActionLink,
  BranchBadges,
  ListFilterBar,
  PageHeader,
  SectionHeading,
  StatusBadge,
  SuccessNotice,
  TableFrame,
} from "@/components/ui";
import { ListPagination } from "@/components/list-pagination";
import { formatLabel, formatTaskDueDate } from "@/lib/presentation";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { organizeTaskList } from "@/lib/task-list";
import { buildTaskListQuery, TASKS_PER_PAGE } from "@/lib/task-list-query";
import { taskListFiltersSchema } from "./filter-validation";
import { SearchableSelect } from "@/components/searchable-select";
import {
  splitTasksByOfficer,
  taskProgressLabel,
  taskStatus,
} from "@/lib/task-status";
import TaskSelfAssignForm from "./task-action-form";
import { listReturnUrl, withReturnTo } from "@/lib/return-context";
import { listPageUrl } from "@/lib/list-url";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Tables } from "@/lib/database.types";

type TaskListRow = Tables<"tasks"> & {
  branches: Pick<Tables<"branches">, "name">;
  task_officer_assignments: Pick<
    Tables<"task_officer_assignments">,
    "officer_id" | "completed_at"
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
  const filters = taskListFiltersSchema.parse(params);
  const {
    q: search,
    status,
    branch: branchId,
    assignee: assigneeId,
    page: requestedPage,
  } = filters;
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
    page: requestedPage > 1 ? String(requestedPage) : undefined,
  });
  const supabase = await createClient();
  const tasksQuery = buildTaskListQuery(supabase, {
    view,
    today,
    search,
    status,
    branchId,
    assigneeId,
    branchScope:
      view === "deleted" && isLead(actor) && !canSeeAllBranches(actor)
        ? actor.branchIds
        : undefined,
    page: requestedPage,
  });

  let taskCountQuery = supabase
    .from("tasks")
    .select("id", { count: "exact", head: true });
  if (view === "deleted")
    taskCountQuery = taskCountQuery.not("removed_at", "is", null);
  else {
    taskCountQuery = taskCountQuery.is("removed_at", null);
    taskCountQuery =
      view === "past"
        ? taskCountQuery.lt("due_date", today)
        : taskCountQuery.gte("due_date", today);
  }
  if (view === "deleted" && isLead(actor) && !canSeeAllBranches(actor))
    taskCountQuery = taskCountQuery.in("branch_id", actor.branchIds);

  const [tasksResult, taskCountResult, branchesResult, officersResult] =
    await Promise.all([
      tasksQuery,
      taskCountQuery,
      supabase.from("branches").select("id,name").order("name"),
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
  const totalPages = Math.max(1, Math.ceil(totalCount / TASKS_PER_PAGE));
  const page = Math.min(requestedPage, totalPages);
  if (page !== requestedPage)
    redirect(
      listPageUrl("/tasks", new URLSearchParams(returnTo.split("?")[1]), page),
    );

  const tasks = tasksResult.data as unknown as TaskListRow[];
  const deletedTasks = view === "deleted" ? tasks : [];
  const organizedTasks = organizeTaskList(tasks, view, today, sunday);
  const splitTasks = (items: typeof tasks) =>
    splitTasksByOfficer(items, actor.id);
  const filteredToNothing =
    totalCount === 0 &&
    (taskCountResult.count ?? 0) > 0 &&
    Boolean(
      search || status || branchId !== undefined || assigneeId !== undefined,
    );
  const hasFilters = Boolean(
    search ||
    status ||
    branchId !== undefined ||
    assigneeId !== undefined ||
    view !== "current",
  );

  const renderGroup = (
    sectionTitle: string,
    title: string,
    groupTasks: typeof tasks,
    allowSelfAssign: boolean,
  ) =>
    groupTasks.length ? (
      <section
        key={title}
        aria-label={`${sectionTitle}: ${title}`}
        className="space-y-3"
      >
        <h3 className="font-semibold text-foreground">{title}</h3>
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
                {allowSelfAssign && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {groupTasks.map((task) => {
                const assignments = task.task_officer_assignments;
                const taskState = taskStatus(assignments);
                const progress = taskProgressLabel(assignments);
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
                      {formatTaskDueDate(task.due_date)}
                    </td>
                    <td>{formatLabel(task.task_type)}</td>
                    <td>
                      <BranchBadges branches={[task.branches.name]} />
                    </td>
                    <td className="tabular-nums">{progress}</td>
                    <td>
                      <StatusBadge status={taskState} />
                    </td>
                    {allowSelfAssign && (
                      <td className="min-w-0">
                        <TaskSelfAssignForm taskId={task.id} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      </section>
    ) : null;

  const renderSection = (
    title: string,
    rows: typeof tasks,
    allowSelfAssign: boolean,
  ) => {
    if (rows.length === 0) return null;
    const groups = splitTasks(rows);
    return (
      <section aria-label={title} className="space-y-4">
        <SectionHeading title={title} />
        {renderGroup(title, "Your tasks", groups.yourTasks, false)}
        {renderGroup(title, "Other tasks", groups.otherTasks, allowSelfAssign)}
      </section>
    );
  };

  return (
    <div data-page-width="wide" className="space-y-5">
      <PageHeader
        title="Tasks"
        description="Task assignments, due dates, and completion."
        action={
          canSeeAllBranches(actor) ||
          (isLead(actor) && actor.branchIds.length > 0) ? (
            <ActionLink href="/tasks/new">+ New task</ActionLink>
          ) : undefined
        }
      />
      <SuccessNotice status={params.feedback} />
      <ListFilterBar
        key={JSON.stringify(filters)}
        action="/tasks"
        label="Task filters"
        active={hasFilters}
        clearHref="/tasks"
      >
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
          View
          <select name="view" defaultValue={view}>
            <option value="current">Current</option>
            <option value="past">Past</option>
            {mayBrowseDeleted && <option value="deleted">Deleted</option>}
          </select>
        </label>
        <label className="min-w-44">
          Status
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
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

      {view === "deleted" ? (
        deletedTasks.length ? (
          <section aria-label="Deleted tasks" className="space-y-4">
            <SectionHeading title="Deleted tasks" />
            {renderGroup("Deleted tasks", "Deleted tasks", deletedTasks, false)}
          </section>
        ) : (
          <p>No deleted Tasks.</p>
        )
      ) : filteredToNothing ? (
        <p>No tasks match these filters.</p>
      ) : tasks.length === 0 ? (
        <p>{view === "past" ? "No past tasks." : "No current tasks."}</p>
      ) : organizedTasks.view === "past" ? (
        organizedTasks.tasks.length > 0 ? (
          <section aria-label="Past tasks" className="space-y-4">
            <SectionHeading title="Past tasks" />
            {renderGroup(
              "Past tasks",
              "Your tasks",
              splitTasks(organizedTasks.tasks).yourTasks,
              false,
            )}
            {renderGroup(
              "Past tasks",
              "Other tasks",
              splitTasks(organizedTasks.tasks).otherTasks,
              false,
            )}
          </section>
        ) : null
      ) : (
        <>
          {renderSection(
            "This week's tasks",
            organizedTasks.view === "current" ? organizedTasks.thisWeek : [],
            true,
          )}
          {renderSection(
            "Upcoming tasks",
            organizedTasks.view === "current" ? organizedTasks.upcoming : [],
            true,
          )}
        </>
      )}
      <ListPagination
        pathname="/tasks"
        label="Task"
        filters={new URLSearchParams(returnTo.split("?")[1])}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        countLabel={totalCount === 1 ? "task" : "tasks"}
      />
    </div>
  );
}
