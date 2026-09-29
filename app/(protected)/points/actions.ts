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
  const officerId = Number(formData.get("officer_id"));
  if (!Number.isSafeInteger(officerId) || officerId <= 0)
    return { error: "Select an officer", success: "" };
  const eventId = formData.get("event_id");
  if (
    eventId &&
    (!Number.isSafeInteger(Number(eventId)) || Number(eventId) <= 0)
  )
    return { error: "Select a valid event", success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_manual_transaction", {
    p_officer_id: officerId,
    p_event_id: eventId ? Number(eventId) : undefined,
    p_points: points,
    p_reason: reason,
    p_award_type: awardType,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Transaction added" };
}

export async function changeParticipationRate(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return { error: "Admin required", success: "" };
  const rawRate = String(formData.get("rate") ?? "").trim();
  const rate = Number(rawRate);
  if (!rawRate || !Number.isFinite(rate) || rate <= 0)
    return { error: "Enter a finite positive rate", success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_participation_rate", {
    p_rate: rate,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Rate saved" };
}

export async function removeParticipationAward(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return { error: "Admin required", success: "" };
  const id = Number(formData.get("transaction_id"));
  if (!Number.isSafeInteger(id) || id <= 0)
    return { error: "Invalid transaction", success: "" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_participation_award", {
    p_transaction_id: id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return {
    error: "",
    success: data ? "Award removed" : "Award was already removed",
  };
}

export async function editPointTransaction(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return { error: "Admin required", success: "" };
  const id = Number(formData.get("transaction_id"));
  const raw = String(formData.get("points") ?? "").trim();
  const points = Number(raw);
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !raw ||
    !Number.isFinite(points) ||
    points === 0
  )
    return { error: "Enter a finite nonzero point value", success: "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_point_transaction", {
    p_transaction_id: id,
    p_points: points,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Points updated" };
}
export async function removePointTransaction(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return { error: "Admin required", success: "" };
  const id = Number(formData.get("transaction_id"));
  if (!Number.isSafeInteger(id) || id <= 0)
    return { error: "Invalid transaction", success: "" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_point_transaction", {
    p_transaction_id: id,
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return {
    error: "",
    success: data ? "Transaction removed" : "Already removed",
  };
}
export async function searchEvents(term: string) {
  const actor = await getAuthorizationContext();
  if (!canManagePoints(actor)) return [];
  const query = term.trim().slice(0, 80);
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
