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
export const isEventExecutive = (actor: AuthorizationContext) =>
  [
    "President",
    "Vice President of Operations",
    "Vice President of Academics",
  ].includes(actor.positionName);
export const canSeeAllBranches = (actor: AuthorizationContext) =>
  isAdmin(actor) || isEventExecutive(actor);
export const canManageEvent = (
  actor: AuthorizationContext,
  branches: number[],
) =>
  canSeeAllBranches(actor) ||
  (isLead(actor) &&
    branches.length > 0 &&
    branches.every((id) => actor.branchIds.includes(id)));
export const canManageSignupForEvent = canManageEvent;
export const canManageOfficers = isAdmin;
export const canManagePoints = isAdmin;
export const canManageCatalogs = isAdmin;
export const canViewSystemLog = isAdmin;
