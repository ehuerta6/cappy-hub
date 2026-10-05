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
import { formatLabel } from "@/lib/presentation";
import { searchOrFilter } from "@/lib/list-search";
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
  const returnTo = listReturnUrl("/tasks", params);
  const filters = taskListFiltersSchema.parse(params);
  const { q: search, branch: branchId, assignee: assigneeId } = filters;
  const supabase = await createClient();
  let tasksQuery = supabase
    .from("tasks")
    .select(
      "*,branches(name),task_officer_assignments(officer_id,completed_at,officers!task_officer_assignments_officer_id_fkey(id,name))",
    )
    .is("removed_at", null)
    .order("due_date")
    .order("id");
  if (search)
    tasksQuery = tasksQuery.or(
      searchOrFilter(search, ["title", "description"]),
    );
  if (branchId !== undefined) tasksQuery = tasksQuery.eq("branch_id", branchId);

  const [tasksResult, branchesResult, officersResult] = await Promise.all([
    tasksQuery,
    supabase.from("branches").select("id,name").order("name"),
    supabase.from("officers").select("id,name,status").order("name"),
  ]);
  if (tasksResult.error || branchesResult.error || officersResult.error)
    throw new Error("Failed to load tasks");

  const tasks = tasksResult.data.filter((task) => {
    const assignments = task.task_officer_assignments;
    if (
      assigneeId !== undefined &&
      !assignments.some((assignment) => assignment.officer_id === assigneeId)
    )
      return false;
    if (filters.status === "open" && assignments.length !== 0) return false;
    if (
      filters.status === "in_progress" &&
      taskStatus(assignments) !== "In progress"
    )
      return false;
    if (filters.status === "complete" && taskStatus(assignments) !== "Complete")
      return false;
    return true;
  });
  const { yourTasks, otherTasks } = splitTasksByOfficer(tasks, actor.id);
  const hasFilters = Boolean(
    search || filters.status || branchId || assigneeId,
  );

  return (
    <div className="space-y-6">
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
        <label className="w-full min-w-0 sm:w-auto sm:min-w-44">
          Status
          <select name="status" defaultValue={filters.status ?? ""}>
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

      {tasks.length === 0 ? (
        <p>{hasFilters ? "No tasks match these filters." : "No tasks yet."}</p>
      ) : (
        [
          { title: "Your tasks", rows: yourTasks, allowSelfAssign: false },
          { title: "Other tasks", rows: otherTasks, allowSelfAssign: true },
        ].map(({ title, rows, allowSelfAssign }) => (
          <section key={title} aria-label={title}>
            <SectionHeading title={title} />
            {rows.length === 0 ? (
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
                        Points
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
                    {rows.map((task) => {
                      const assignments = task.task_officer_assignments;
                      const status = taskStatus(assignments);
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
                            <p className="hidden text-sm text-muted xl:block">
                              {task.description}
                            </p>
                            <details className="mt-1 xl:hidden">
                              <summary className="flex min-h-11 cursor-pointer items-center text-sm text-secondary">
                                Description
                              </summary>
                              <p className="whitespace-pre-wrap break-words text-sm">
                                {task.description}
                              </p>
                            </details>
                            <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm text-muted xl:hidden">
                              <span>Due: {task.due_date}</span>
                              <span>Type: {formatLabel(task.task_type)}</span>
                              <BranchBadges branches={[task.branches.name]} />
                              <span>Points: {task.points}</span>
                              <span>Officers: {progress}</span>
                              <span>Status: {status}</span>
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap xl:table-cell">
                            {task.due_date}
                          </td>
                          <td className="hidden xl:table-cell">
                            {formatLabel(task.task_type)}
                          </td>
                          <td className="hidden xl:table-cell">
                            <BranchBadges branches={[task.branches.name]} />
                          </td>
                          <td className="hidden xl:table-cell">
                            {task.points}
                          </td>
                          <td className="hidden xl:table-cell tabular-nums">
                            {progress}
                          </td>
                          <td className="hidden xl:table-cell">
                            <StatusBadge status={status} />
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
        ))
      )}
    </div>
  );
}
