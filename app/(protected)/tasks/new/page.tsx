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
  const { data, error } = await supabase
    .from("branches")
    .select("id,name")
    .order("name");
  if (error) throw new Error("Failed to load branches");
  return (
    <div className="space-y-6">
      <PageHeader title="New task" />
      <TaskCreateForm
        branches={
          canSeeAllBranches(actor)
            ? data
            : data.filter((branch) => actor.branchIds.includes(branch.id))
        }
      />
    </div>
  );
}
