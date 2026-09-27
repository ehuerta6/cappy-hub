import { connection } from "next/server";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EventForm from "../../event-form";
export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const [event, branches] = await Promise.all([
    supabase
      .from("events")
      .select("*,event_branches(branch_id)")
      .eq("id", Number(id))
      .maybeSingle(),
    supabase.from("branches").select("id,name").order("name"),
  ]);
  if (event.error || branches.error)
    throw new Error("Failed to load event form");
  if (!event.data) notFound();
  return (
    <>
      <h1>Edit event</h1>
      <EventForm
        event={event.data}
        branches={branches.data}
        branchIds={event.data.event_branches.map((x) => x.branch_id)}
      />
    </>
  );
}
