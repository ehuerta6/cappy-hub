import { notFound, redirect } from "next/navigation";
import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import ContextualBackLink from "@/components/contextual-back-link";
import { PageHeader } from "@/components/ui";
import TaskCreateForm from "../../task-create-form";

export default async function EditRecurringTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getAuthorizationContext();
  const { id } = await params;
  if (!/^-?[1-9]\d*$/.test(id)) notFound();
  const supabase = await createClient();
  const task = await supabase
    .from("tasks")
    .select("*")
    .eq("id", Number(id))
    .single();
  if (
    task.error ||
    !task.data ||
    task.data.removed_at ||
    task.data.recurrence_series_id === null
  )
    notFound();
  if (!canManageEvent(actor, [task.data.branch_id])) redirect("/access-denied");
  const [series, branches] = await Promise.all([
    supabase
      .from("task_series")
      .select("id,revision,recurrence_rule,starts_on")
      .eq("id", task.data.recurrence_series_id)
      .single(),
    supabase.from("branches").select("id,name").order("name"),
  ]);
  if (series.error || branches.error)
    throw new Error("Failed to load recurring task form");
  return (
    <div className="space-y-6">
      <ContextualBackLink href={`/tasks/${id}`}>
        Back to task
      </ContextualBackLink>
      <PageHeader title="Edit recurring task" />
      <TaskCreateForm
        task={task.data}
        series={series.data}
        branches={branches.data}
        recurrenceRequestKey={crypto.randomUUID()}
      />
    </div>
  );
}
