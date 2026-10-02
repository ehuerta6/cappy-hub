import ContextualBackLink from "@/components/contextual-back-link";
import {
  getAuthorizationContext,
  canManageEvent,
  canSeeAllBranches,
} from "@/lib/authorization";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventForm from "../../event-form";
import { PageHeader } from "@/components/ui";
export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const { id } = await params;
  if (!/^-?[1-9]\d*$/.test(id)) notFound();
  const [event, branches, eventTypes] = await Promise.all([
    supabase
      .from("events")
      .select("*,event_branches(branch_id)")
      .eq("id", Number(id))
      .maybeSingle(),
    supabase.from("branches").select("id,name").order("name"),
    supabase
      .from("event_types")
      .select("id,name")
      .in("name", ["Meeting", "Social", "Workshop"])
      .order("name"),
  ]);
  if (event.error || branches.error || eventTypes.error)
    throw new Error("Failed to load event form");
  if (!event.data || event.data.deleted_at) notFound();
  if (
    !canManageEvent(
      actor,
      event.data.event_branches.map((x) => x.branch_id),
    )
  )
    redirect("/access-denied");
  return (
    <div className="space-y-6">
      <ContextualBackLink href={`/events/${id}`}>
        Back to event
      </ContextualBackLink>
      <PageHeader title="Edit event" />
      <EventForm
        allowGlobal={canSeeAllBranches(actor)}
        event={event.data}
        branches={
          canSeeAllBranches(actor)
            ? branches.data
            : branches.data.filter((branch) =>
                actor.branchIds.includes(branch.id),
              )
        }
        eventTypes={eventTypes.data}
        branchIds={event.data.event_branches.map((x) => x.branch_id)}
      />
    </div>
  );
}
