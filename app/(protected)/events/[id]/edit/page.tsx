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
import { denverParts } from "@/lib/event-time";
import { PageHeader } from "@/components/ui";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";
import { parseResourceLinkViews } from "@/lib/resource-links";
export default async function EditEventPage({
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
  if (periodSelection.isHistorical)
    redirect(`/events?period=${context.period}`);
  const actor = await getAuthorizationContext();
  const supabase = await createClient();
  const { id: eventIdParam } = await params;
  if (!/^-?[1-9]\d*$/.test(eventIdParam)) notFound();
  const eventId = Number(eventIdParam);
  const [
    event,
    branches,
    eventTypes,
    locations,
    signupCount,
    timeSlots,
    positions,
    notificationTargets,
    reminderOffsets,
    resourceLinks,
  ] = await Promise.all([
    supabase
      .from("events")
      .select("*,event_branches(branch_id)")
      .eq("id", eventId)
      .maybeSingle(),
    supabase.from("branches").select("id,name,is_active").order("name"),
    supabase
      .from("event_types")
      .select("id,name,available_for_new_events")
      .order("name"),
    supabase
      .from("event_locations")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("event_officers")
      .select("officer_id", { count: "exact", head: true })
      .eq("event_id", eventId),
    supabase
      .from("event_time_slots")
      .select("id,starts_at,ends_at,capacity")
      .eq("event_id", eventId)
      .order("starts_at"),
    supabase.from("positions").select("id,name").order("name"),
    supabase
      .from("event_notification_targets")
      .select("all_active,branch_id,position_id")
      .eq("event_id", eventId),
    supabase
      .from("event_reminder_offsets")
      .select("minutes_before")
      .eq("event_id", eventId)
      .order("minutes_before", { ascending: false }),
    supabase
      .from("resource_links")
      .select("id,kind,label,url,legacy_key,sort_order")
      .eq("event_id", eventId)
      .order("sort_order")
      .order("id"),
  ]);
  if (
    event.error ||
    branches.error ||
    eventTypes.error ||
    locations.error ||
    signupCount.error ||
    timeSlots.error ||
    positions.error ||
    notificationTargets.error ||
    reminderOffsets.error ||
    resourceLinks.error
  )
    throw new Error("Failed to load event form");
  if (!event.data || event.data.deleted_at) notFound();
  const currentEvent = event.data;
  if (
    periodSelection.period &&
    (currentEvent.event_date < periodSelection.period.starts_on ||
      currentEvent.event_date > periodSelection.period.ends_on)
  )
    notFound();
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
    <div data-form-page="event" className="space-y-6">
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
        resourceLinks={parseResourceLinkViews(resourceLinks.data ?? [])}
        positions={positions.data}
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
        branches={branches.data.filter(
          (branch) =>
            branch.is_active ||
            currentEvent.event_branches.some(
              (eventBranch) => eventBranch.branch_id === branch.id,
            ),
        )}
        eventTypes={eventTypes.data.filter(
          (type) =>
            type.available_for_new_events ||
            type.id === currentEvent.event_type_id,
        )}
        locations={locations.data}
        branchIds={currentEvent.event_branches.map(
          (eventBranch) => eventBranch.branch_id,
        )}
        canEnableTimeSlots={
          (timeSlots.data?.length ?? 0) > 0 || (signupCount.count ?? 0) === 0
        }
        timeSlots={(timeSlots.data ?? []).map((slot) => ({
          id: slot.id,
          start_time: denverParts(slot.starts_at).time,
          end_time: denverParts(slot.ends_at).time,
          capacity: slot.capacity,
        }))}
      />
    </div>
  );
}
