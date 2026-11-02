import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireCurrentOfficer } from "./current-officer";
import { createClient } from "./supabase/server";

export type AuthorizationContext = Awaited<
  ReturnType<typeof requireCurrentOfficer>
>;

export async function getAuthorizationContext(options?: {
  enforceWritablePeriod?: boolean;
}) {
  const actor = await requireCurrentOfficer();
  if (options?.enforceWritablePeriod) {
    const referer = (await headers()).get("referer");
    if (referer) {
      let source: URL;
      try {
        source = new URL(referer);
      } catch {
        return actor;
      }
      const selectedPeriod = source.searchParams.get("period");
      if (
        selectedPeriod &&
        selectedPeriod !== "none" &&
        selectedPeriod !== "current"
      ) {
        const id = Number(selectedPeriod);
        const supabase = await createClient();
        const { error } = await supabase.rpc(
          "assert_academic_period_writable",
          {
            p_period_id: Number.isSafeInteger(id) ? id : -1,
          },
        );
        if (error) redirect(`${source.pathname}${source.search}` as Route);
      }
    }
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
