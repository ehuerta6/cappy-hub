import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

const getAuthUser = cache(async function getAuthUser() {
  const authClient = await createClient();
  return authClient.auth.getUser();
});

export const getCurrentOfficer = cache(async function getCurrentOfficer() {
  const { data: userData, error: userError } = await getAuthUser();
  if (userError || !userData.user) return null;

  const authClient = await createClient();
  // RPC derives identity from auth.uid() and verified Auth data. Its return
  // value is null for an unknown, inactive, or already-claimed officer.
  const { data: officerId, error: claimError } = await authClient.rpc(
    "claim_current_officer_identity",
  );
  if (claimError) {
    console.error("Could not resolve current officer", claimError);
    return null;
  }
  if (!officerId) return null;

  // Reuse the authenticated session so final RLS also checks this read.
  const { data: officer, error } = await authClient
    .from("officers")
    .select(
      "id,name,status,application_role,position_id,positions(name,code),officer_branches(branch_id)",
    )
    .eq("id", officerId)
    .single();
  if (error || officer?.status !== "active") {
    if (error) console.error("Could not load current officer", error);
    return null;
  }
  return {
    id: officer.id,
    name: officer.name,
    authUserId: userData.user.id,
    applicationRole: officer.application_role,
    positionId: officer.position_id,
    positionName: officer.positions.name,
    positionCode: officer.positions.code,
    branchIds: officer.officer_branches.map((branch) => branch.branch_id),
  };
});

export async function requireCurrentOfficer() {
  const officer = await getCurrentOfficer();
  if (officer) return officer;
  const { data } = await getAuthUser();
  redirect(data.user ? "/access-denied" : "/login");
}
