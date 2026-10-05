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
import { formatLabel, formatTaskDueDate } from "@/lib/presentation";
import { searchOrFilter } from "@/lib/list-search";
import { currentDenverWeek } from "@/lib/current-denver-week";
import { organizeTaskList } from "@/lib/task-list";
import { taskListFiltersSchema } from "./filter-validation";
import {
  splitTasksByOfficer,
  taskProgressLabel,
  taskStatus,
} from "@/lib/task-status";
import TaskSelfAssignForm from "./task-action-form";
import { listReturnUrl, withReturnTo } from "@/lib/return-context";
import Link from "next/link";

type TaskListSearchParams = Record<string, string | string[] | undefined>;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TaskListSearchParams>;
}) {
  const actor = await getAuthorizationContext();
  const params = await searchParams;
  const filters = taskListFiltersSchema.parse(params);
  const { q: search, status, branch: branchId, assignee: assigneeId } = filters;
  const view = filters.view ?? "current";
  const { today, sunday } = currentDenverWeek(new Date());
  const returnTo = listReturnUrl("/tasks", {
    q: search,
    view: filters.view,
    status,
    branch: branchId?.toString(),
    assignee: assigneeId?.toString(),
  });
  const supabase = await createClient();
  let tasksQuery = supabase
    .from("tasks")
    .select(
      "*,branches(name),task_officer_assignments(officer_id,completed_at,officers!task_officer_assignments_officer_id_fkey(id,name))",
    )
    .is("removed_at", null);
  tasksQuery =
    view === "past"
      ? tasksQuery.lt("due_date", today)
      : tasksQuery.gte("due_date", today);
  if (search)
    tasksQuery = tasksQuery.or(
      searchOrFilter(search, ["title", "description"]),
    );
  if (branchId !== undefined) tasksQuery = tasksQuery.eq("branch_id", branchId);
  tasksQuery = tasksQuery
    .order("due_date", { ascending: view !== "past" })
    .order("id", { ascending: view !== "past" });

  let taskCountQuery = supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .is("removed_at", null);
  taskCountQuery =
    view === "past"
      ? taskCountQuery.lt("due_date", today)
      : taskCountQuery.gte("due_date", today);

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

  const tasks = tasksResult.data.filter((task) => {
    const assignments = task.task_officer_assignments;
    if (
      assigneeId !== undefined &&
      !assignments.some((assignment) => assignment.officer_id === assigneeId)
    )
      return false;
    if (status === "open" && assignments.length !== 0) return false;
    if (status === "in_progress" && taskStatus(assignments) !== "In progress")
      return false;
    if (status === "complete" && taskStatus(assignments) !== "Complete")
      return false;
    return true;
  });
  const organizedTasks = organizeTaskList(tasks, view, today, sunday);
  const splitTasks = (items: typeof tasks) =>
    splitTasksByOfficer(items, actor.id);
  const filteredToNothing =
    tasks.length === 0 &&
    (taskCountResult.count ?? 0) > 0 &&
    Boolean(
      search || status || branchId !== undefined || assigneeId !== undefined,
    );
  const hasFilters = Boolean(
    search ||
    status ||
    branchId !== undefined ||
    assigneeId !== undefined ||
    view === "past",
  );

  const renderGroup = (
    title: string,
    groupTasks: typeof tasks,
    allowSelfAssign: boolean,
  ) => (
    <section key={title} aria-label={title} className="space-y-3">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {groupTasks.length === 0 ? (
        <p>No tasks in this group.</p>
      ) : (
        <TableFrame compact>
          <table>
            <thead>
              <tr className="grid grid-cols-1 md:table-row">
                <th scope="col">Task</th>
                <th scope="col" className="hidden xl:table-cell">
                  Due
                </th>
                <th scope="col" className="hidden xl:table-cell">
                  Type
                </th>
                <th scope="col" className="hidden xl:table-cell">
                  Branch
                </th>
                <th scope="col" className="hidden xl:table-cell">
                  Officers
                </th>
                <th scope="col" className="hidden xl:table-cell">
                  Status
                </th>
                {allowSelfAssign && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {groupTasks.map((task) => {
                const assignments = task.task_officer_assignments;
                const taskState = taskStatus(assignments);
                const progress = taskProgressLabel(assignments);
                return (
                  <tr
                    key={task.id}
                    id={`task-${task.id}`}
                    className="grid grid-cols-1 md:table-row"
                  >
                    <td className="min-w-0">
                      <Link
                        href={withReturnTo(`/tasks/${task.id}`, returnTo)}
                        className="block break-words"
                      >
                        {task.title}
                      </Link>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted xl:hidden">
                        <span>Due: {formatTaskDueDate(task.due_date)}</span>
                        <span>Type: {formatLabel(task.task_type)}</span>
                        <BranchBadges branches={[task.branches.name]} />
                        <span>Officers: {progress}</span>
                        <StatusBadge status={taskState} />
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap xl:table-cell">
                      {formatTaskDueDate(task.due_date)}
                    </td>
                    <td className="hidden xl:table-cell">
                      {formatLabel(task.task_type)}
                    </td>
                    <td className="hidden xl:table-cell">
                      <BranchBadges branches={[task.branches.name]} />
                    </td>
                    <td className="hidden xl:table-cell tabular-nums">
                      {progress}
                    </td>
                    <td className="hidden xl:table-cell">
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
      )}
    </section>
  );

  const renderSection = (
    title: string,
    rows: typeof tasks,
    emptyMessage: string,
    allowSelfAssign: boolean,
  ) => {
    if (rows.length === 0)
      return (
        <section aria-label={title} className="space-y-4">
          <SectionHeading title={title} />
          <p>{emptyMessage}</p>
        </section>
      );
    const groups = splitTasks(rows);
    return (
      <section aria-label={title} className="space-y-4">
        <SectionHeading title={title} />
        {renderGroup("Your tasks", groups.yourTasks, false)}
        {renderGroup("Other tasks", groups.otherTasks, allowSelfAssign)}
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
        <label className="w-full min-w-0 sm:w-auto sm:min-w-56 sm:flex-1">
          Search tasks
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={100}
            placeholder="Title or description"
          />
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
          View
          <select name="view" defaultValue={view}>
            <option value="current">Current</option>
            <option value="past">Past</option>
          </select>
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-44">
          Status
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="complete">Complete</option>
          </select>
        </label>
        <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
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
        <label className="w-full min-w-0 sm:w-auto sm:min-w-44">
          Officer
          <select name="assignee" defaultValue={assigneeId ?? ""}>
            <option value="">All officers</option>
            {officersResult.data.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name}
                {officer.status === "inactive" ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
      </ListFilterBar>

      {filteredToNothing ? (
        <p>No tasks match these filters.</p>
      ) : organizedTasks.view === "past" ? (
        organizedTasks.tasks.length === 0 ? (
          <p>No past tasks.</p>
        ) : (
          <section aria-label="Past tasks" className="space-y-4">
            <SectionHeading title="Past tasks" />
            {renderGroup(
              "Your tasks",
              splitTasks(organizedTasks.tasks).yourTasks,
              false,
            )}
            {renderGroup(
              "Other tasks",
              splitTasks(organizedTasks.tasks).otherTasks,
              false,
            )}
          </section>
        )
      ) : (
        <>
          {renderSection(
            "This week's tasks",
            organizedTasks.thisWeek,
            "No tasks due this week.",
            true,
          )}
          {renderSection(
            "Upcoming tasks",
            organizedTasks.upcoming,
            "No upcoming tasks.",
            true,
          )}
        </>
      )}
    </div>
  );
}
