import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import CatalogManager from "./manager";
import { PageHeader } from "@/components/ui";

export default async function OfficerCatalogsPage() {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) notFound();
  const supabase = await createClient();
  const [positions, branches, locations] = await Promise.all([
    supabase.from("positions").select("id,name,code,is_active").order("name"),
    supabase.from("branches").select("id,name,is_active").order("name"),
    supabase.from("event_locations").select("id,name").order("name"),
  ]);
  if (positions.error || branches.error || locations.error)
    throw new Error("Could not load catalogs");
  return (
    <div className="space-y-8">
      <PageHeader
        title="Officer catalogs"
        description="Manage officer positions, branches and reusable Event locations."
      />
      <p className="text-sm text-muted">
        The six baseline positions are required. Retired branches and custom
        positions remain readable in history but cannot be newly assigned.
        Referenced records cannot be deleted; renaming and retirement retain
        their IDs and relationships.
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
      <CatalogManager
        catalog="event_location"
        title="Event locations"
        records={locations.data}
      />
    </div>
  );
}
