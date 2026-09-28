import { requireCurrentOfficer } from "@/lib/current-officer";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EventForm from "../../event-form";
import { PageHeader } from "@/components/ui";
export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCurrentOfficer();
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const [event, branches, eventTypes] = await Promise.all([
    supabase
      .from("events")
      .select("*,event_branches(branch_id)")
      .eq("id", Number(id))
      .maybeSingle(),
    supabase.from("branches").select("id,name").order("name"),
    supabase.from("event_types").select("id,name").order("name"),
  ]);
  if (event.error || branches.error || eventTypes.error)
    throw new Error("Failed to load event form");
  if (!event.data) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title="Edit event" />
      <EventForm
        event={event.data}
        branches={branches.data}
        eventTypes={eventTypes.data}
        branchIds={event.data.event_branches.map((x) => x.branch_id)}
      />
    </div>
  );
}
