"use server";

import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { mutationError } from "@/lib/mutation-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  createWarningInputSchema,
  decideWarningInputSchema,
  deleteWarningInputSchema,
} from "./warning-validation";

type ActionState = { error: string; success: string };

export async function createWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) return { error: "Admin required", success: "" };
  const rawWarningInput = {
    officer_id: formData.get("officer_id") ?? "",
    reason: formData.get("reason") ?? "",
  };
  const validationResult = createWarningInputSchema.safeParse(rawWarningInput);
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const validatedWarningInput = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_warning", {
    p_officer_id: validatedWarningInput.officer_id,
    p_reason: validatedWarningInput.reason,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath(`/officers/${validatedWarningInput.officer_id}`);
  revalidatePath("/officers");
  return { error: "", success: "Warning created for leadership approval" };
}

export async function decideWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await getAuthorizationContext();
  const rawWarningDecisionInput = {
    warning_id: formData.get("warning_id") ?? "",
    decision: formData.get("decision") ?? "",
  };
  const validationResult = decideWarningInputSchema.safeParse(
    rawWarningDecisionInput,
  );
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const validatedWarningDecision = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_warning", {
    p_warning_id: validatedWarningDecision.warning_id,
    p_decision: validatedWarningDecision.decision,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/officers", "layout");
  return {
    error: "",
    success: `Warning ${validatedWarningDecision.decision}`,
  };
}

export async function deleteWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) return { error: "Admin required", success: "" };
  const rawWarningDeletionInput = {
    warning_id: formData.get("warning_id") ?? "",
    officer_id: formData.get("officer_id") ?? "",
  };
  const validationResult = deleteWarningInputSchema.safeParse(
    rawWarningDeletionInput,
  );
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const validatedWarningDeletion = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_warning", {
    p_warning_id: validatedWarningDeletion.warning_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  if (validatedWarningDeletion.officer_id !== undefined)
    revalidatePath(`/officers/${validatedWarningDeletion.officer_id}`);
  revalidatePath("/officers");
  return { error: "", success: "Warning deleted; its audit record remains" };
}
