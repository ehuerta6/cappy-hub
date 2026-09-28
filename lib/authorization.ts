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
  actor.positionName === "Lead";
export const sharesAnyBranch = (
  actor: AuthorizationContext,
  branches: number[],
) => actor.branchIds.some((id) => branches.includes(id));
export const canManageEvent = (
  actor: AuthorizationContext,
  branches: number[],
) => isAdmin(actor) || (isLead(actor) && sharesAnyBranch(actor, branches));
export const canManageSignupForEvent = canManageEvent;
export const canManageOfficers = isAdmin;
export const canManagePoints = isAdmin;
export const canManageCatalogs = isAdmin;
export const canViewSystemLog = isAdmin;
