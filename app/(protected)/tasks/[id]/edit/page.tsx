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
  const [series, branches, links, eventOptions] = await Promise.all([
    task.data.recurrence_series_id === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("task_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", task.data.recurrence_series_id)
          .single(),
    supabase.from("branches").select("id,name").order("name"),
    supabase.from("task_events").select("event_id").eq("task_id", task.data.id),
    supabase
      .from("events")
      .select("id,name,event_date,status,deleted_at")
      .order("event_date", { ascending: false }),
  ]);
  if (series.error || branches.error || links.error || eventOptions.error)
    throw new Error("Failed to load Task edit form");
  const linkedIds = links.data.map(({ event_id }) => event_id);
  const events = eventOptions.data.filter(
    (event) =>
      (event.deleted_at === null && event.status !== "cancelled") ||
      linkedIds.includes(event.id),
  );
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
        branches={branches.data}
        events={events}
        taskEventIds={linkedIds}
        recurrenceRequestKey={crypto.randomUUID()}
      />
    </div>
  );
}
