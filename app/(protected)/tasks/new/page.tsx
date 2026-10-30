import ContextualBackLink from "@/components/contextual-back-link";
import {
  getAuthorizationContext,
  canSeeAllBranches,
  isLead,
} from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import TaskCreateForm from "../task-create-form";

export default async function NewTaskPage() {
  const actor = await getAuthorizationContext();
  if (!canSeeAllBranches(actor) && (!isLead(actor) || !actor.branchIds.length))
    redirect("/access-denied");
  const supabase = await createClient();
  const [branches, events, taskTypes] = await Promise.all([
    supabase
      .from("branches")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("events")
      .select("id,name,event_date,status,deleted_at")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("event_date", { ascending: false }),
    supabase
      .from("task_types")
      .select("name")
      .eq("available_for_new_tasks", true)
      .order("name"),
  ]);
  if (branches.error || events.error || taskTypes.error)
    throw new Error("Failed to load Task form");
  return (
    <div className="space-y-6">
      <ContextualBackLink href="/tasks">Back to tasks</ContextualBackLink>
      <PageHeader title="New task" />
      <TaskCreateForm
        recurrenceRequestKey={crypto.randomUUID()}
        taskTypes={taskTypes.data}
        branches={
          canSeeAllBranches(actor)
            ? branches.data
            : branches.data.filter((branch) =>
                actor.branchIds.includes(branch.id),
              )
        }
        events={events.data}
      />
    </div>
  );
}
