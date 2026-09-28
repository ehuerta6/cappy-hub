"use server";

import { requireCurrentOfficer } from "@/lib/current-officer";
import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
export async function addTransaction(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  await requireCurrentOfficer();
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
  const { error } = await supabase.from("point_transactions").insert({
    officer_id: Number(formData.get("officer_id")),
    event_id: eventId ? Number(eventId) : null,
    points,
    reason,
    award_type: awardType,
    created_by: null,
  });
  if (error) return { error: error.message, success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Transaction added" };
}
