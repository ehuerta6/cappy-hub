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
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const periodSelection = resolveAcademicPeriod(
    params.period,
    await getAcademicPeriodData(),
  );
  if (periodSelection.isHistorical) redirect(`/events?period=${params.period}`);
  const actor = await getAuthorizationContext();
  if (
    !canSeeAllBranches(actor) &&
    (!isLead(actor) || actor.branchIds.length === 0)
  )
    redirect("/access-denied");
  const supabase = await createClient();
  const [branches, eventTypes, locations, positions] = await Promise.all([
    supabase
      .from("branches")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("event_types")
      .select("id,name")
      .eq("available_for_new_events", true)
      .order("name"),
    supabase
      .from("event_locations")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase.from("positions").select("id,name").order("name"),
  ]);
  if (branches.error || eventTypes.error || locations.error || positions.error)
    throw new Error("Failed to load event form");
  return (
    <div data-form-page="event" className="space-y-6">
      <ContextualBackLink
        href={
          params.period
            ? (`/events?period=${params.period}` as import("next").Route)
            : "/events"
        }
      >
        Back to events
      </ContextualBackLink>
      <PageHeader title="New event" />
      <EventForm
        recurrenceRequestKey={crypto.randomUUID()}
        allowGlobal={canSeeAllBranches(actor)}
        branches={
          canSeeAllBranches(actor)
            ? branches.data
            : branches.data.filter((branch) =>
                actor.branchIds.includes(branch.id),
              )
        }
        positions={positions.data}
        eventTypes={eventTypes.data}
        locations={locations.data}
      />
    </div>
  );
}
