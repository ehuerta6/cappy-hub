"use server";

import { getAuthorizationContext, canManagePoints } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import {
  formFailure,
  validationFailure,
  type FormActionState,
} from "@/lib/form-feedback";
import { revalidatePath } from "next/cache";
import {
  editPointTransactionInputSchema,
  eventSearchInputSchema,
  manualPointTransactionInputSchema,
  participationRateInputSchema,
  pointTransactionInputSchema,
} from "./validation";
export async function addTransaction(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor))
    return formFailure("Admin required", formData, [
      "points",
      "reason",
      "officer_id",
      "event_id",
      "award_type",
    ]);
  const rawPointTransactionInput = {
    points: formData.get("points") ?? "",
    award_type: formData.get("award_type") ?? "",
    reason: formData.get("reason") ?? "",
    officer_id: formData.get("officer_id") ?? "",
    event_id: formData.get("event_id") ?? "",
  };
  const validationResult = manualPointTransactionInputSchema.safeParse(
    rawPointTransactionInput,
  );
  if (!validationResult.success)
    return validationFailure(validationResult.error, formData, [
      "points",
      "reason",
      "officer_id",
      "event_id",
      "award_type",
    ]);
  const validatedPointTransactionInput = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_manual_transaction", {
    p_officer_id: validatedPointTransactionInput.officer_id,
    p_event_id: validatedPointTransactionInput.event_id,
    p_points: validatedPointTransactionInput.points,
    p_reason: validatedPointTransactionInput.reason,
    p_award_type: validatedPointTransactionInput.award_type,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, [
      "points",
      "reason",
      "officer_id",
      "event_id",
      "award_type",
    ]);
  revalidatePath("/", "layout");
  return { error: "", success: "Point transaction added" };
}

export async function changeParticipationRate(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor))
    return formFailure("Admin required", formData, ["rate"]);
  const validationResult = participationRateInputSchema.safeParse({
    rate: formData.get("rate") ?? "",
  });
  if (!validationResult.success)
    return validationFailure(validationResult.error, formData, ["rate"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_participation_rate", {
    p_rate: validationResult.data.rate,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, ["rate"]);
  revalidatePath("/", "layout");
  return { error: "", success: "Participation rate saved" };
}

export async function removeParticipationAward(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return { error: "Admin required", success: "" };
  const validationResult = pointTransactionInputSchema.safeParse({
    transaction_id: formData.get("transaction_id") ?? "",
  });
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_participation_award", {
    p_transaction_id: validationResult.data.transaction_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return {
    error: "",
    success: data ? "Award removed" : "Award was already removed",
  };
}

export async function editPointTransaction(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor))
    return formFailure("Admin required", formData, ["points"]);
  const rawPointTransactionEditInput = {
    transaction_id: formData.get("transaction_id") ?? "",
    points: formData.get("points") ?? "",
  };
  const validationResult = editPointTransactionInputSchema.safeParse(
    rawPointTransactionEditInput,
  );
  if (!validationResult.success)
    return validationFailure(validationResult.error, formData, ["points"]);
  const validatedPointTransactionEdit = validationResult.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_point_transaction", {
    p_transaction_id: validatedPointTransactionEdit.transaction_id,
    p_points: validatedPointTransactionEdit.points,
  });
  if (error)
    return formFailure(mutationError(error.message), formData, ["points"]);
  revalidatePath("/", "layout");
  return { error: "", success: "Point transaction updated" };
}
export async function removePointTransaction(
  _previous: FormActionState,
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return { error: "Admin required", success: "" };
  const validationResult = pointTransactionInputSchema.safeParse({
    transaction_id: formData.get("transaction_id") ?? "",
  });
  if (!validationResult.success)
    return { error: validationResult.error.issues[0].message, success: "" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_point_transaction", {
    p_transaction_id: validationResult.data.transaction_id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return {
    error: "",
    success: data
      ? "Point transaction removed"
      : "Point transaction already removed",
  };
}
export async function searchEvents(term: string) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return [];
  const validationResult = eventSearchInputSchema.safeParse(term);
  if (!validationResult.success) return [];
  const query = validationResult.data;
  if (query.length < 2) return [];
  const literal = query.replace(/[\\%_]/g, "\\$&");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id,name")
    .is("deleted_at", null)
    .ilike("name", `%${literal}%`)
    .order("event_date", { ascending: false })
    .limit(20);
  if (error) return [];
  return data;
}
