"use server";

import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { mutationError } from "@/lib/mutation-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type ActionState = { error: string; success: string };

export async function createWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) return { error: "Admin required", success: "" };
  const officerId = Number(formData.get("officer_id"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isSafeInteger(officerId) || officerId <= 0)
    return { error: "Officer not found", success: "" };
  if (!reason) return { error: "Warning reason is required", success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_warning", {
    p_officer_id: officerId,
    p_reason: reason,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath(`/officers/${officerId}`);
  revalidatePath("/officers");
  return { error: "", success: "Warning created for leadership approval" };
}

export async function decideWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await getAuthorizationContext();
  const warningId = Number(formData.get("warning_id"));
  const decision = String(formData.get("decision") ?? "");
  if (!Number.isSafeInteger(warningId) || warningId <= 0)
    return { error: "Warning not found", success: "" };
  if (decision !== "approved" && decision !== "rejected")
    return { error: "Invalid warning decision", success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_warning", {
    p_warning_id: warningId,
    p_decision: decision,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/officers", "layout");
  return { error: "", success: `Warning ${decision}` };
}

export async function deleteWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) return { error: "Admin required", success: "" };
  const warningId = Number(formData.get("warning_id"));
  const officerId = Number(formData.get("officer_id"));
  if (!Number.isSafeInteger(warningId) || warningId <= 0)
    return { error: "Warning not found", success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_warning", {
    p_warning_id: warningId,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  if (Number.isSafeInteger(officerId) && officerId > 0)
    revalidatePath(`/officers/${officerId}`);
  revalidatePath("/officers");
  return { error: "", success: "Warning deleted; its audit record remains" };
}
