import "server-only";
import { redirect } from "next/navigation";
import { requireCurrentOfficer } from "./current-officer";
import { createClient } from "./supabase/server";

export type AuthorizationContext = Awaited<
  ReturnType<typeof requireCurrentOfficer>
>;

export async function getAuthorizationContext(options?: {
  enforceWritablePeriod?: boolean;
  periodContext?: FormDataEntryValue | null;
}) {
  const actor = await requireCurrentOfficer();
  if (options?.enforceWritablePeriod) {
    const periodContext = options.periodContext;
    if (typeof periodContext !== "string") redirect("/");
    const supabase = await createClient();
    const { error } = await supabase.rpc(
      "assert_academic_period_context_writable",
      { p_period_context: periodContext },
    );
    if (error) redirect("/");
  }
  return actor;
}

export const isAdmin = (actor: AuthorizationContext) =>
  actor.applicationRole === "admin";
export const isLead = (actor: AuthorizationContext) =>
  actor.positionCode === "lead";
export const isEventExecutive = (actor: AuthorizationContext) =>
  [
    "president",
    "vice_president_operations",
    "vice_president_academics",
  ].includes(actor.positionCode ?? "");
export const canSeeAllBranches = (actor: AuthorizationContext) =>
  isAdmin(actor) || isEventExecutive(actor);
export const canManageEvent = (
  actor: AuthorizationContext,
  branches: number[],
) =>
  canSeeAllBranches(actor) ||
  (isLead(actor) &&
    branches.length > 0 &&
    branches.some((id) => actor.branchIds.includes(id)));
export const canManageOfficers = isAdmin;
export const canManagePoints = isAdmin;
