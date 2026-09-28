import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { supabase } from "./supabase";

export async function getCurrentOfficer() {
  const authClient = await createClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return null;

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

  // The existing POC read policies are anon-only until PR 3. This read is
  // server-side and follows the trusted RPC check on every request.
  const { data: officer, error } = await supabase
    .from("officers")
    .select(
      "id,name,status,application_role,position_id,positions(name),officer_branches(branch_id)",
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
    branchIds: officer.officer_branches.map((branch) => branch.branch_id),
  };
}

export async function requireCurrentOfficer() {
  const officer = await getCurrentOfficer();
  if (officer) return officer;
  const authClient = await createClient();
  const { data } = await authClient.auth.getUser();
  redirect(data.user ? "/access-denied" : "/login");
}
