import {
  getAuthorizationContext,
  canManageEvent,
  canSeeAllBranches,
  isLead,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { ActionLink, PageHeader, TableFrame } from "@/components/ui";
import { TaskWorkflow, taskStatus } from "./task-workflow";
import Link from "next/link";

export default async function TasksPage() {
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const [tasks, officers] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*,branches(name),task_assignments(officer_id,completed_at,approved_at,officers!task_assignments_officer_id_fkey(name))",
      )
      .is("removed_at", null)
      .order("due_date"),
    supabase
      .from("officers")
      .select("id,name")
      .eq("status", "active")
      .order("name"),
  ]);
  if (tasks.error || officers.error) throw new Error("Failed to load tasks");
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
      <TableFrame>
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Type</th>
              <th>Branch</th>
              <th>Due</th>
              <th>Points</th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.data.map((task) => {
              const assignment = task.task_assignments;
              const canManage = canManageEvent(actor, [task.branch_id]);
              const status = taskStatus(task, assignment);
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
                  <td>{status}</td>
                  <td>
                    <TaskWorkflow
                      task={task}
                      assignment={assignment}
                      actorId={actor.id}
                      canManage={canManage}
                      officers={officers.data}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableFrame>
      {!tasks.data.length && <p>No tasks yet.</p>}
    </div>
  );
}
