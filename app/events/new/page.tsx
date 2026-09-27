import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import EventForm from "../event-form";
import { PageHeader } from "@/components/ui";
export default async function NewEventPage() {
  await connection();
  const [branches, eventTypes] = await Promise.all([
    supabase.from("branches").select("id,name").order("name"),
    supabase.from("event_types").select("id,name").order("name"),
  ]);
  if (branches.error || eventTypes.error)
    throw new Error("Failed to load event form");
  return (
    <div className="space-y-6">
      <PageHeader title="New event" />
      <EventForm branches={branches.data} eventTypes={eventTypes.data} />
    </div>
  );
}
