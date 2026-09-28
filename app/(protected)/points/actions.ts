"use server";

import { getAuthorizationContext, canManagePoints } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import { revalidatePath } from "next/cache";
export async function addTransaction(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return { error: "Admin required", success: "" };
  const rawPoints = String(formData.get("points") ?? "");
  const points = Number(rawPoints);
  const awardType = String(formData.get("award_type") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!rawPoints.trim() || !Number.isFinite(points) || points === 0)
    return {
      error: "Enter a nonzero positive or negative point value",
      success: "",
    };
  if (!reason) return { error: "Enter a reason", success: "" };
  if (!["manual", "correction"].includes(awardType))
    return { error: "Select manual or correction", success: "" };
  const eventId = formData.get("event_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_manual_transaction", {
    p_officer_id: Number(formData.get("officer_id")),
    p_event_id: eventId ? Number(eventId) : undefined,
    p_points: points,
    p_reason: reason,
    p_award_type: awardType,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Transaction added" };
}
