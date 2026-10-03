import {
  getAuthorizationContext,
  canManageEvent,
  canSeeAllBranches,
  isLead,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  ActionLink,
  ListFilterBar,
  PageHeader,
  TableFrame,
} from "@/components/ui";
import { formatLabel } from "@/lib/presentation";
import { searchOrFilter } from "@/lib/list-search";
import { taskListFiltersSchema } from "./filter-validation";
import { TaskWorkflow, taskStatus } from "./task-workflow";
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
  const { q: search, branch: branchId, assignee: assigneeId } = filters;
  const status = filters.status;
  const supabase = await createClient();

  let completeTaskIds: number[] | undefined;
  if (status === "complete") {
    // Completion depends on approval_required: tasks with required approval
    // are complete only after approval; others complete after assignment work.
    const [noApproval, approved] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,task_assignments!inner(completed_at)")
        .is("removed_at", null)
        .eq("approval_required", false)
        .not("task_assignments.completed_at", "is", null),
      supabase
        .from("tasks")
        .select("id,task_assignments!inner(approved_at)")
        .is("removed_at", null)
        .eq("approval_required", true)
        .not("task_assignments.approved_at", "is", null),
    ]);
    if (noApproval.error || approved.error)
      throw new Error("Failed to load tasks");
    completeTaskIds = [
      ...noApproval.data.map((task) => task.id),
      ...approved.data.map((task) => task.id),
    ];
  }

  const requireAssignment = Boolean(
    assigneeId !== undefined ||
    status === "assigned" ||
    status === "awaiting" ||
    status === "complete",
  );
  const assignmentSelection = requireAssignment
    ? "task_assignments!inner(officer_id,completed_at,approved_at,officers!task_assignments_officer_id_fkey(name))"
    : "task_assignments(officer_id,completed_at,approved_at,officers!task_assignments_officer_id_fkey(name))";

  let tasksQuery = supabase
    .from("tasks")
    .select(`*,branches(name),${assignmentSelection}`)
    .is("removed_at", null)
    .order("due_date");
  if (search)
    tasksQuery = tasksQuery.or(
      searchOrFilter(search, ["title", "description"]),
    );
  if (branchId !== undefined) tasksQuery = tasksQuery.eq("branch_id", branchId);
  if (assigneeId !== undefined)
    tasksQuery = tasksQuery.eq("task_assignments.officer_id", assigneeId);
  if (status === "open") tasksQuery = tasksQuery.is("task_assignments", null);
  if (status === "assigned")
    tasksQuery = tasksQuery.is("task_assignments.completed_at", null);
  if (status === "awaiting")
    tasksQuery = tasksQuery
      .eq("approval_required", true)
      .not("task_assignments.completed_at", "is", null)
      .is("task_assignments.approved_at", null);
  if (status === "complete") {
    if (completeTaskIds?.length)
      tasksQuery = tasksQuery.in("id", completeTaskIds);
    else tasksQuery = tasksQuery.eq("id", 0);
  }

  const [tasksResult, taskCountResult, branchesResult, officersResult] =
    await Promise.all([
      tasksQuery,
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .is("removed_at", null),
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

  const tasks = tasksResult.data;
  const activeOfficers = officersResult.data
    .filter((officer) => officer.status === "active")
    .map(({ id, name }) => ({ id, name }));
  const hasFilters = Boolean(search || status || branchId || assigneeId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Assign, complete and approve officer work."
        action={
          canSeeAllBranches(actor) ||
          (isLead(actor) && actor.branchIds.length > 0) ? (
            <ActionLink href="/tasks/new">+ New task</ActionLink>
          ) : undefined
        }
      />
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
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="awaiting">Awaiting approval</option>
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
          Assignee
          <select name="assignee" defaultValue={assigneeId ?? ""}>
            <option value="">All assignees</option>
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
        <p>
          {hasFilters && (taskCountResult.count ?? 0) > 0
            ? "No tasks match these filters."
            : "No tasks yet."}
        </p>
      ) : (
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Type</th>
                <th scope="col">Branch</th>
                <th scope="col">Due</th>
                <th scope="col">Points</th>
                <th scope="col">Assignee</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const assignment = task.task_assignments;
                const canManage = canManageEvent(actor, [task.branch_id]);
                const currentStatus = taskStatus(task, assignment);
                return (
                  <tr key={task.id} id={`task-${task.id}`}>
                    <td>
                      <Link href={`/tasks/${task.id}`}>{task.title}</Link>
                      <p className="text-sm text-muted">{task.description}</p>
                    </td>
                    <td>{task.task_type}</td>
                    <td>{task.branches.name}</td>
                    <td>{task.due_date}</td>
                    <td>{task.points}</td>
                    <td>{assignment?.officers.name ?? "Unassigned"}</td>
                    <td>{currentStatus}</td>
                    <td>
                      <TaskWorkflow
                        task={task}
                        assignment={assignment}
                        actorId={actor.id}
                        canManage={canManage}
                        officers={activeOfficers}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}
    </div>
  );
}
