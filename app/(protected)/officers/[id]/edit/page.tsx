import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import OfficerForm from "../../new/officer-form";

export default async function EditOfficerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!canManageOfficers(await getAuthorizationContext()))
    redirect("/access-denied");
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const [officer, branches, positions] = await Promise.all([
    supabase
      .from("officers")
      .select("*, officer_branches(branch_id)")
      .eq("id", Number(id))
      .maybeSingle(),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("positions").select("id, name").order("id"),
  ]);
  if (officer.error || branches.error || positions.error)
    throw new Error("Failed to load officer form");
  if (!officer.data) notFound();
  return (
    <>
      <h1>Edit officer</h1>
      <OfficerForm
        officer={officer.data}
        branches={branches.data}
        positions={positions.data}
        branchIds={officer.data.officer_branches.map(
          (membership) => membership.branch_id,
        )}
      />
    </>
  );
}
