import ContextualBackLink from "@/components/contextual-back-link";
import { getAuthorizationContext, canEditEvent } from "@/lib/authorization";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventForm from "../event-form";
import { PageHeader } from "@/components/ui";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { denverParts } from "@/lib/event-time";

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
  if (!canEditEvent(actor)) redirect("/access-denied");
  const supabase = await createClient();

  const rawFrom = Array.isArray(params.from) ? params.from[0] : params.from;
  const duplicateFromId =
    rawFrom && /^[1-9]\d*$/.test(rawFrom) ? Number(rawFrom) : null;

  const [branches, eventTypes, locations, positions, officers, sourceEvent] =
    await Promise.all([
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
      supabase
        .from("officers")
        .select("id,name")
        .eq("status", "active")
        .order("name"),
      duplicateFromId
        ? supabase
            .from("events")
            .select(
              "id,name,description,location,event_type_id,max_volunteers,starts_at,ends_at,event_branches(branch_id),resource_links(id,kind,label,url,legacy_key,sort_order)",
            )
            .eq("id", duplicateFromId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  if (
    branches.error ||
    eventTypes.error ||
    locations.error ||
    positions.error ||
    officers.error
  )
    throw new Error("Failed to load event form");

  const dup = sourceEvent.error ? null : sourceEvent.data;
  const validEventTypeIds = new Set(eventTypes.data.map((t) => t.id));
  const validBranchIds = new Set(branches.data.map((b) => b.id));
  const duplicateDraft = dup
    ? {
        name: dup.name,
        description: dup.description,
        location: dup.location ?? "",
        event_type_id: validEventTypeIds.has(dup.event_type_id)
          ? dup.event_type_id
          : null,
        max_volunteers: dup.max_volunteers,
        start_time: denverParts(dup.starts_at).time,
        end_time: denverParts(dup.ends_at).time,
      }
    : undefined;
  const duplicateBranchIds = dup
    ? dup.event_branches
        .map((b) => b.branch_id)
        .filter((id) => validBranchIds.has(id))
    : [];
  const duplicateResourceLinks = (dup?.resource_links ??
    []) as import("@/lib/resource-links").ResourceLinkView[];

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
      <PageHeader
        title="New event"
        description={
          dup
            ? `Duplicating details from "${dup.name}" — choose a date for the new event.`
            : undefined
        }
      />
      <EventForm
        recurrenceRequestKey={crypto.randomUUID()}
        allowGlobal={canEditEvent(actor)}
        branches={branches.data}
        positions={positions.data}
        eventTypes={eventTypes.data}
        locations={locations.data}
        officers={officers.data}
        duplicateDraft={duplicateDraft}
        branchIds={duplicateBranchIds}
        resourceLinks={duplicateResourceLinks}
      />
    </div>
  );
}
