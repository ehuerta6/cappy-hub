import {
  safeReturnTo,
  withReturnTo,
  type NavigationSearchParams,
} from "@/lib/return-context";
import ContextualBackLink from "@/components/contextual-back-link";
import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OfficerForm from "../../new/officer-form";
import { PageHeader } from "@/components/ui";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";

export default async function EditOfficerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<NavigationSearchParams>;
}) {
  const context = (await searchParams) ?? {};
  const returnTo = safeReturnTo(context.returnTo);
  const periodSelection = resolveAcademicPeriod(
    context.period,
    await getAcademicPeriodData(),
  );
  if (periodSelection.isHistorical)
    redirect(`/officers?period=${context.period}`);
  if (!canManageOfficers(await getAuthorizationContext()))
    redirect("/access-denied");
  const supabase = await createClient();
  const { id } = await params;
  if (!/^-?[1-9]\d*$/.test(id)) notFound();
  const [officer, branches, positions] = await Promise.all([
    supabase
      .from("officers")
      .select("*, officer_branches(branch_id)")
      .eq("id", Number(id))
      .maybeSingle(),
    supabase.from("branches").select("id, name,is_active").order("name"),
    supabase.from("positions").select("id, name,is_active").order("id"),
  ]);
  if (officer.error || branches.error || positions.error)
    throw new Error("Failed to load officer form");
  if (!officer.data) notFound();
  return (
    <div data-form-page="officer" className="space-y-4">
      <ContextualBackLink href={withReturnTo(`/officers/${id}`, returnTo)}>
        Back to officer
      </ContextualBackLink>
      <PageHeader title="Edit officer" />
      <OfficerForm
        returnTo={returnTo}
        officer={officer.data}
        branches={branches.data.filter(
          (branch) =>
            branch.is_active ||
            officer.data!.officer_branches.some(
              (membership) => membership.branch_id === branch.id,
            ),
        )}
        positions={positions.data.filter(
          (position) =>
            position.is_active || position.id === officer.data!.position_id,
        )}
        branchIds={officer.data.officer_branches.map(
          (membership) => membership.branch_id,
        )}
      />
    </div>
  );
}
