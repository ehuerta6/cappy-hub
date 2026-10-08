import { notFound, redirect } from "next/navigation";
import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  safeReturnTo,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import ContextualBackLink from "@/components/contextual-back-link";
import { PageHeader } from "@/components/ui";
import TaskCreateForm from "../../task-create-form";

export default async function EditTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const returnTo = safeReturnTo((await searchParams)?.returnTo);
  const actor = await getAuthorizationContext();
  const { id } = await params;
  if (!/^-?[1-9]\d*$/.test(id)) notFound();
  const supabase = await createClient();
  const task = await supabase
    .from("tasks")
    .select("*")
    .eq("id", Number(id))
    .single();
  if (task.error || !task.data || task.data.removed_at) notFound();
  if (!canManageEvent(actor, [task.data.branch_id])) redirect("/access-denied");
  const [series, branches] = await Promise.all([
    task.data.recurrence_series_id === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("task_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", task.data.recurrence_series_id)
          .single(),
    supabase.from("branches").select("id,name,is_active").order("name"),
  ]);
  if (series.error || branches.error)
    throw new Error("Failed to load Task edit form");
  return (
    <div className="space-y-6">
      <ContextualBackLink href={withReturnTo(`/tasks/${id}`, returnTo)}>
        Back to task
      </ContextualBackLink>
      <PageHeader title={series.data ? "Edit recurring task" : "Edit task"} />
      <TaskCreateForm
        returnTo={returnTo}
        task={task.data}
        series={series.data ?? undefined}
        branches={branches.data.filter(
          (branch) => branch.is_active || branch.id === task.data.branch_id,
        )}
        recurrenceRequestKey={crypto.randomUUID()}
      />
    </div>
  );
}
