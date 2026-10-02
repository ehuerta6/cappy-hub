import ContextualBackLink from "@/components/contextual-back-link";
import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OfficerForm from "./officer-form";
import { PageHeader } from "@/components/ui";

export default async function NewOfficerPage() {
  if (!canManageOfficers(await getAuthorizationContext()))
    redirect("/access-denied");
  const supabase = await createClient();
  const [branches, positions] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("positions").select("id, name").order("id"),
  ]);
  if (branches.error || positions.error)
    throw new Error("Failed to load officer options");
  return (
    <div className="space-y-6">
      <ContextualBackLink href="/officers">Back to officers</ContextualBackLink>
      <PageHeader title="Add officer" />
      <OfficerForm branches={branches.data} positions={positions.data} />
    </div>
  );
}
