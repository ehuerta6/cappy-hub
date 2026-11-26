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
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const periodSelection = resolveAcademicPeriod(
    params.period,
    await getAcademicPeriodData(),
  );
  if (periodSelection.isHistorical) redirect(`/tasks?period=${params.period}`);
  const actor = await getAuthorizationContext();
  if (!canSeeAllBranches(actor) && (!isLead(actor) || !actor.branchIds.length))
    redirect("/access-denied");
  const supabase = await createClient();

  const rawEventId = Array.isArray(params.event)
    ? params.event[0]
    : params.event;
  const preselectedEventId =
    rawEventId && /^[1-9]\d*$/.test(rawEventId) ? Number(rawEventId) : null;

  const [branches, events, taskTypes, positions, officers, eventBranches] =
    await Promise.all([
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
      supabase.from("positions").select("id,name").order("name"),
      supabase
        .from("officers")
        .select("id,name,officer_branches(branches(name))")
        .eq("status", "active")
        .order("name"),
      preselectedEventId
        ? supabase
            .from("event_branches")
            .select("branch_id")
            .eq("event_id", preselectedEventId)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (
    branches.error ||
    events.error ||
    taskTypes.error ||
    positions.error ||
    officers.error
  )
    throw new Error("Failed to load Task form");

  const allowedBranches = canSeeAllBranches(actor)
    ? branches.data
    : branches.data.filter((branch) => actor.branchIds.includes(branch.id));
  const allowedBranchIds = new Set(allowedBranches.map((b) => b.id));
  const matchedEvent =
    preselectedEventId !== null
      ? events.data.find((e) => e.id === preselectedEventId)
      : undefined;
  const defaultBranchId =
    matchedEvent && !eventBranches.error
      ? eventBranches.data.find((b) => allowedBranchIds.has(b.branch_id))
          ?.branch_id
      : undefined;

  return (
    <div data-form-page="task" className="space-y-6">
      <ContextualBackLink
        href={
          params.period
            ? (`/tasks?period=${params.period}` as import("next").Route)
            : "/tasks"
        }
      >
        Back to tasks
      </ContextualBackLink>
      <PageHeader
        title="New task"
        description={
          matchedEvent
            ? `Linked to "${matchedEvent.name}".`
            : undefined
        }
      />
      <TaskCreateForm
        recurrenceRequestKey={crypto.randomUUID()}
        taskTypes={taskTypes.data}
        positions={positions.data}
        branches={allowedBranches}
        events={events.data}
        officers={officers.data.map(({ id, name, officer_branches }) => ({
          id,
          name,
          branches: (officer_branches ?? [])
            .map((ob) => ob.branches?.name)
            .filter((b): b is string => Boolean(b)),
        }))}
        taskEventIds={matchedEvent ? [matchedEvent.id] : []}
        defaultBranchId={defaultBranchId}
      />
    </div>
  );
}
