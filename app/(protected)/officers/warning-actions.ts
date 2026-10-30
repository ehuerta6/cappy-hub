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
  updateWarningInputSchema,
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
  return { error: "", success: "Warning created" };
}

export async function updateWarning(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getAuthorizationContext();
  if (!isAdmin(actor))
    return formFailure("Admin required", formData, ["reason"]);
  const result = updateWarningInputSchema.safeParse({
    warning_id: formData.get("warning_id") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!result.success)
    return validationFailure(result.error, formData, ["reason"]);
  const supabase = await createClient();
  const { data: officerId, error } = await supabase.rpc("update_warning", {
    p_warning_id: result.data.warning_id,
    p_reason: result.data.reason,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, ["reason"]);
  revalidatePath(`/officers/${officerId}`);
  revalidatePath("/officers");
  return { error: "", success: "Warning updated" };
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
