import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import EventForm from "../event-form";
export default async function NewEventPage() {
  await connection();
  const { data, error } = await supabase
    .from("branches")
    .select("id,name")
    .order("name");
  if (error) throw new Error("Failed to load branches");
  return (
    <>
      <h1>New event</h1>
      <EventForm branches={data} />
    </>
  );
}
