import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";
import OfficerForm from "./officer-form";
import { PageHeader } from "@/components/ui";

export default async function NewOfficerPage() {
  if (!canManageOfficers(await getAuthorizationContext()))
    redirect("/access-denied");
  await connection();
  const [branches, positions] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("positions").select("id, name").order("id"),
  ]);
  if (branches.error || positions.error)
    throw new Error("Failed to load officer options");
  return (
    <div className="space-y-6">
      <PageHeader title="Add officer" />
      <OfficerForm branches={branches.data} positions={positions.data} />
    </div>
  );
}
