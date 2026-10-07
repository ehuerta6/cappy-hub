import "server-only";
import { requireCurrentOfficer } from "./current-officer";

export type AuthorizationContext = Awaited<
  ReturnType<typeof requireCurrentOfficer>
>;

export async function getAuthorizationContext() {
  return requireCurrentOfficer();
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
export const canViewSystemLog = isAdmin;
