import {
  safeReturnTo,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const returnTo = safeReturnTo((await searchParams)?.returnTo);
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const { id: eventIdParam } = await params;
  if (!/^-?[1-9]\d*$/.test(eventIdParam)) notFound();
  const eventId = Number(eventIdParam);
  const [event, branches, eventTypes, locations] = await Promise.all([
    supabase
      .from("events")
      .select("*,event_branches(branch_id)")
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("branches").select("id,name").order("name"),
    supabase
      .from("event_types")
      .select("id,name,available_for_new_events")
      .order("name"),
    supabase.from("event_locations").select("id,name").order("name"),
  ]);
  if (event.error || branches.error || eventTypes.error || locations.error)
    throw new Error("Failed to load event form");
  if (!event.data || event.data.deleted_at) notFound();
  const currentEvent = event.data;
  if (
    !canManageEvent(
      actor,
      currentEvent.event_branches.map((eventBranch) => eventBranch.branch_id),
    )
  )
    redirect("/access-denied");
  const series =
    currentEvent.recurrence_series_id === null
      ? undefined
      : await supabase
          .from("event_series")
          .select("id,revision,recurrence_rule,starts_on")
          .eq("id", currentEvent.recurrence_series_id)
          .single();
  if (series?.error) throw new Error("Failed to load recurring series");
  return (
    <div className="space-y-6">
      <ContextualBackLink
        href={withReturnTo(`/events/${eventIdParam}`, returnTo)}
      >
        Back to event
      </ContextualBackLink>
      <PageHeader title="Edit event" />
      <EventForm
        returnTo={returnTo}
        series={series?.data ?? undefined}
        mutationRequestKey={crypto.randomUUID()}
        allowGlobal={canSeeAllBranches(actor)}
        event={currentEvent}
        branches={branches.data}
        eventTypes={eventTypes.data.filter(
          (type) =>
            type.available_for_new_events ||
            type.id === currentEvent.event_type_id,
        )}
        locations={locations.data}
        branchIds={currentEvent.event_branches.map(
          (eventBranch) => eventBranch.branch_id,
        )}
      />
    </div>
  );
}
