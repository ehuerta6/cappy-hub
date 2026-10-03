import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import CatalogManager from "./manager";
import { PageHeader } from "@/components/ui";

export default async function OfficerCatalogsPage() {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) notFound();
  const supabase = await createClient();
  const [positions, branches] = await Promise.all([
    supabase.from("positions").select("id,name").order("name"),
    supabase.from("branches").select("id,name").order("name"),
  ]);
  if (positions.error || branches.error)
    throw new Error("Could not load catalogs");
  return (
    <div className="space-y-8">
      <PageHeader
        title="Officer catalogs"
        description="Manage controlled positions and branches."
      />
      <p className="text-sm text-zinc-400">
        The six baseline positions are required. Referenced records cannot be
        deleted. Renaming retains their IDs and relationships.
      </p>
      <CatalogManager
        catalog="position"
        title="Positions"
        records={positions.data}
      />
      <CatalogManager
        catalog="branch"
        title="Branches"
        records={branches.data}
      />
    </div>
  );
}
