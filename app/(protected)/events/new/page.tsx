import ContextualBackLink from "@/components/contextual-back-link";
import {
  getAuthorizationContext,
  canSeeAllBranches,
  isLead,
} from "@/lib/authorization";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventForm from "../event-form";
import { PageHeader } from "@/components/ui";
export default async function NewEventPage() {
  const actor = await getAuthorizationContext();
  if (
    !canSeeAllBranches(actor) &&
    (!isLead(actor) || actor.branchIds.length === 0)
  )
    redirect("/access-denied");
  const supabase = await createClient();
  const [branches, eventTypes] = await Promise.all([
    supabase.from("branches").select("id,name").order("name"),
    supabase
      .from("event_types")
      .select("id,name")
      .in("name", ["Meeting", "Social", "Workshop"])
      .order("name"),
  ]);
  if (branches.error || eventTypes.error)
    throw new Error("Failed to load event form");
  return (
    <div className="space-y-6">
      <ContextualBackLink href="/events">Back to events</ContextualBackLink>
      <PageHeader title="New event" />
      <EventForm
        allowGlobal={canSeeAllBranches(actor)}
        branches={
          canSeeAllBranches(actor)
            ? branches.data
            : branches.data.filter((branch) =>
                actor.branchIds.includes(branch.id),
              )
        }
        eventTypes={eventTypes.data}
      />
    </div>
  );
}
