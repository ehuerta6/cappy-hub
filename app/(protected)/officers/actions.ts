"use server";

import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";

import { withReturnTo } from "@/lib/return-context";
import { withSuccessNotice } from "@/lib/mutation-feedback";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import {
  applicationRoleChangeInputSchema,
  saveOfficerInputSchema,
} from "./validation";

const officerFormFields = [
  "name",
  "utep_email",
  "personal_email",
  "position_id",
  "classification",
  "status",
  "branches",
] as const;

export async function saveOfficer(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManageOfficers(actor))
    return formFailure(
      "Admin required",
      formData,
      officerFormFields,
      undefined,
      ["branches"],
    );
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
    return validationFailure(
      validationResult.error,
      formData,
      officerFormFields,
      ["branches"],
    );
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
  if (error)
    return formFailure(
      mutationError(error.message),
      formData,
      officerFormFields,
      undefined,
      ["branches"],
    );
  revalidatePath("/", "layout");
  redirect(
    withSuccessNotice(
      withReturnTo(`/officers/${data}`, formData.get("returnTo")),
      "officer-saved",
    ),
  );
}

export async function changeApplicationRole(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManageOfficers(actor))
    return formFailure("Admin required", formData, ["role"]);
  const rawApplicationRoleChangeInput = {
    officer_id: formData.get("officer_id") ?? "",
    role: formData.get("role") ?? "",
  };
  const validationResult = applicationRoleChangeInputSchema.safeParse(
    rawApplicationRoleChangeInput,
  );
  if (!validationResult.success) {
    const roleIsInvalid = validationResult.error.issues.some(
      (issue) => issue.path[0] === "role",
    );
    return formFailure(
      "Invalid role assignment",
      formData,
      ["role"],
      roleIsInvalid ? { role: "Select a valid application role." } : undefined,
    );
  }
  const validatedApplicationRoleChange = validationResult.data;
  if (validatedApplicationRoleChange.officer_id === actor.id)
    return formFailure("Admins cannot demote themselves", formData, ["role"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_officer_application_role", {
    p_officer_id: validatedApplicationRoleChange.officer_id,
    p_role: validatedApplicationRoleChange.role,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, ["role"]);
  revalidatePath("/", "layout");
  return { error: "", success: "Application role saved" };
}
