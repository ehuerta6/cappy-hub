"use server";

import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  createWarningInputSchema,
  decideWarningInputSchema,
  voidWarningInputSchema,
} from "./warning-validation";

type ActionState = FormActionState;

export async function createWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor))
    return formFailure("Admin required", formData, ["reason"]);
  const rawWarningInput = {
    officer_id: formData.get("officer_id") ?? "",
    reason: formData.get("reason") ?? "",
  };
  const validationResult = createWarningInputSchema.safeParse(rawWarningInput);
  if (!validationResult.success)
    return validationFailure(validationResult.error, formData, ["reason"]);
  const validatedWarningInput = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_warning", {
    p_officer_id: validatedWarningInput.officer_id,
    p_reason: validatedWarningInput.reason,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, ["reason"]);
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

export async function voidWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor)) return { error: "Admin required", success: "" };
  const rawWarningVoidInput = {
    warning_id: formData.get("warning_id") ?? "",
    officer_id: formData.get("officer_id") ?? "",
  };
  const validationResult =
    voidWarningInputSchema.safeParse(rawWarningVoidInput);
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const validatedWarningVoid = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_warning", {
    p_warning_id: validatedWarningVoid.warning_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  if (validatedWarningVoid.officer_id !== undefined)
    revalidatePath(`/officers/${validatedWarningVoid.officer_id}`);
  revalidatePath("/officers");
  return { error: "", success: "Warning voided" };
}
