import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import EventForm from "../event-form";
import { PageHeader } from "@/components/ui";
export default async function NewEventPage() {
  await connection();
  const { data, error } = await supabase
    .from("branches")
    .select("id,name")
    .order("name");
  if (error) throw new Error("Failed to load branches");
  return (
    <div className="space-y-6">
      <PageHeader title="New event" />
      <EventForm branches={data} />
    </div>
  );
}
