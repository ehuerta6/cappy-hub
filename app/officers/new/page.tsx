import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import OfficerForm from "./officer-form";

export default async function NewOfficerPage() {
  await connection();
  const [branches, positions] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("positions").select("id, name").order("id"),
  ]);
  if (branches.error || positions.error)
    throw new Error("Failed to load officer options");
  return (
    <>
      <h1>Add officer</h1>
      <OfficerForm branches={branches.data} positions={positions.data} />
    </>
  );
}
