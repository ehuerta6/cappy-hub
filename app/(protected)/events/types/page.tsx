import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import CatalogManager from "../../catalog-manager";
import { PageHeader } from "@/components/ui";

export default async function EventTypesPage() {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) notFound();
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_types")
    .select("id,name")
    .order("name");
  if (error) throw new Error("Could not load event types");
  return (
    <div className="space-y-8">
      <PageHeader
        title="Event types"
        description="Manage the event type catalog."
      />
      <p className="text-sm text-zinc-400">
        Types used by events cannot be deleted. Renaming retains their IDs and
        event history.
      </p>
      <CatalogManager catalog="event_type" title="Types" records={data} />
    </div>
  );
}
