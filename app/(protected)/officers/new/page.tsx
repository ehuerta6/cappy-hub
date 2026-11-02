import ContextualBackLink from "@/components/contextual-back-link";
import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OfficerForm from "./officer-form";
import { PageHeader } from "@/components/ui";
import {
  getAcademicPeriodData,
  resolveAcademicPeriod,
} from "@/lib/academic-periods";

export default async function NewOfficerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await (searchParams ??
    Promise.resolve<Record<string, string | string[] | undefined>>({}));
  const periodSelection = resolveAcademicPeriod(
    params.period,
    await getAcademicPeriodData(),
  );
  if (periodSelection.isHistorical)
    redirect(`/officers?period=${params.period}`);
  if (!canManageOfficers(await getAuthorizationContext()))
    redirect("/access-denied");
  const supabase = await createClient();
  const [branches, positions] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("positions")
      .select("id, name")
      .eq("is_active", true)
      .order("id"),
  ]);
  if (branches.error || positions.error)
    throw new Error("Failed to load officer options");
  return (
    <div className="space-y-6">
      <ContextualBackLink
        href={
          params.period
            ? (`/officers?period=${params.period}` as import("next").Route)
            : "/officers"
        }
      >
        Back to officers
      </ContextualBackLink>
      <PageHeader title="Add officer" />
      <OfficerForm branches={branches.data} positions={positions.data} />
    </div>
  );
}
