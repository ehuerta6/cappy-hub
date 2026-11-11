import { notFound, redirect } from "next/navigation";
import { getAuthorizationContext, canManageTask } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import {
  safeReturnTo,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import ContextualBackLink from "@/components/contextual-back-link";
import { PageHeader } from "@/components/ui";
import TaskCreateForm from "../../task-create-form";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { parseResourceLinkViews } from "@/lib/resource-links";

export default async function EditTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const context = (await searchParams) ?? {};
  const returnTo = safeReturnTo(context.returnTo);
  const periodSelection = resolveAcademicPeriod(
    context.period,
    await getAcademicPeriodData(),
  );
  if (periodSelection.isHistorical) redirect(`/tasks?period=${context.period}`);
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
  if (
    periodSelection.period &&
    (task.data.due_date < periodSelection.period.starts_on ||
      task.data.due_date > periodSelection.period.ends_on)
  )
    notFound();
  if (!canManageTask(actor, task.data.branch_id)) redirect("/access-denied");
  const [
    series,
    branches,
    links,
    eventOptions,
    taskTypes,
    positions,
    notificationTargets,
    reminderOffsets,
    resourceLinks,
  ] = await Promise.all([
    task.data.recurrence_series_id === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("task_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", task.data.recurrence_series_id)
          .single(),
    supabase.from("branches").select("id,name,is_active").order("name"),
    supabase.from("task_events").select("event_id").eq("task_id", task.data.id),
    supabase
      .from("events")
      .select("id,name,event_date,status,deleted_at")
      .order("event_date", { ascending: false }),
    supabase
      .from("task_types")
      .select("name")
      .eq("available_for_new_tasks", true)
      .order("name"),
    supabase.from("positions").select("id,name").order("name"),
    supabase
      .from("task_notification_targets")
      .select("all_active,branch_id,position_id")
      .eq("task_id", task.data.id),
    supabase
      .from("task_reminder_offsets")
      .select("minutes_before")
      .eq("task_id", task.data.id)
      .order("minutes_before", { ascending: false }),
    supabase
      .from("resource_links")
      .select("id,kind,label,url,legacy_key,sort_order")
      .eq("task_id", task.data.id)
      .order("sort_order")
      .order("id"),
  ]);
  if (
    series.error ||
    branches.error ||
    links.error ||
    eventOptions.error ||
    taskTypes.error ||
    positions.error ||
    notificationTargets.error ||
    reminderOffsets.error ||
    resourceLinks.error
  )
    throw new Error("Failed to load Task edit form");
  const linkedIds = links.data.map(({ event_id }) => event_id);
  const events = eventOptions.data.filter(
    (event) =>
      (event.deleted_at === null && event.status !== "cancelled") ||
      linkedIds.includes(event.id),
  );
  return (
    <div data-form-page="task" className="space-y-6">
      <ContextualBackLink href={withReturnTo(`/tasks/${id}`, returnTo)}>
        Back to task
      </ContextualBackLink>
      <PageHeader title={series.data ? "Edit recurring task" : "Edit task"} />
      <TaskCreateForm
        returnTo={returnTo}
        taskTypes={taskTypes.data}
        positions={positions.data}
        task={task.data}
        resourceLinks={parseResourceLinkViews(resourceLinks.data ?? [])}
        notificationSettings={{
          allActive: notificationTargets.data.some(
            (target) => target.all_active,
          ),
          branchIds: notificationTargets.data.flatMap((target) =>
            target.branch_id === null ? [] : [target.branch_id],
          ),
          positionIds: notificationTargets.data.flatMap((target) =>
            target.position_id === null ? [] : [target.position_id],
          ),
          reminderOffsets: reminderOffsets.data.map(
            (row) => row.minutes_before,
          ),
        }}
        series={series.data ?? undefined}
        branches={branches.data.filter(
          (branch) => branch.is_active || branch.id === task.data.branch_id,
        )}
        events={events}
        taskEventIds={linkedIds}
        recurrenceRequestKey={crypto.randomUUID()}
      />
    </div>
  );
}
