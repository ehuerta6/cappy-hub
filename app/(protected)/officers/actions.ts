"use server";

import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";

import { withReturnTo } from "@/lib/return-context";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import {
  applicationRoleChangeInputSchema,
  saveOfficerInputSchema,
} from "./validation";

export async function saveOfficer(
  _previous: { error: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManageOfficers(actor)) return { error: "Admin required" };
  const rawOfficerInput = {
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    utep_email: formData.get("utep_email") ?? "",
    personal_email: formData.get("personal_email") ?? "",
    position_id: formData.get("position_id") ?? "",
    classification: formData.get("classification") ?? "",
    status: formData.get("status") ?? "",
    branches: formData.getAll("branches"),
  };
  const validationResult = saveOfficerInputSchema.safeParse(rawOfficerInput);
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message };
  const validatedOfficerInput = validationResult.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_officer", {
    p_officer_id: validatedOfficerInput.id,
    p_name: validatedOfficerInput.name,
    p_utep_email: validatedOfficerInput.utep_email || undefined,
    p_personal_email: validatedOfficerInput.personal_email || undefined,
    p_position_id: validatedOfficerInput.position_id,
    p_classification: validatedOfficerInput.classification,
    p_status:
      validatedOfficerInput.id !== undefined
        ? validatedOfficerInput.status
        : "active",
    p_branch_ids: validatedOfficerInput.branches,
  });
  if (error) return { error: mutationError(error.message) };
  revalidatePath("/", "layout");
  redirect(withReturnTo(`/officers/${data}`, formData.get("returnTo")));
}

export async function changeApplicationRole(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManageOfficers(actor))
    return { error: "Admin required", success: "" };
  const rawApplicationRoleChangeInput = {
    officer_id: formData.get("officer_id") ?? "",
    role: formData.get("role") ?? "",
  };
  const validationResult = applicationRoleChangeInputSchema.safeParse(
    rawApplicationRoleChangeInput,
  );
  if (!validationResult.success)
    return { error: "Invalid role assignment", success: "" };
  const validatedApplicationRoleChange = validationResult.data;
  if (validatedApplicationRoleChange.officer_id === actor.id)
    return { error: "Admins cannot demote themselves", success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_officer_application_role", {
    p_officer_id: validatedApplicationRoleChange.officer_id,
    p_role: validatedApplicationRoleChange.role,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Role saved" };
}
