"use server";

import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
import { denverTimestamp } from "@/lib/event-time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function saveEvent(
  _previous: { error: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  const id = formData.get("id");
  const branches = formData.getAll("branches").map(Number);
  if (!id && !canManageEvent(actor, branches))
    return { error: "Event outside branch scope" };
  const kind = String(formData.get("kind") ?? "");
  const date = String(formData.get("event_date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { error: "Choose one event date" };
  let start: string | null = null;
  let end: string | null = null;
  let fixedPoints: number | null = null;
  if (kind === "timed") {
    if (startTime < "06:00" || endTime > "23:59" || endTime <= startTime)
      return { error: "Choose a same-day range from 6:00 AM through 11:59 PM" };
    start = denverTimestamp(date, startTime);
    end = denverTimestamp(date, endTime);
    if (!start || !end) return { error: "Enter valid El Paso times" };
  } else if (kind === "untimed") {
    fixedPoints = Number(formData.get("fixed_points"));
    if (!Number.isFinite(fixedPoints) || fixedPoints === 0)
      return { error: "Enter finite, nonzero fixed points" };
  } else return { error: "Choose an event kind" };
  const eventTypeId = Number(formData.get("event_type_id"));
  if (!Number.isSafeInteger(eventTypeId) || eventTypeId <= 0)
    return { error: "Select a valid event type" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_event_v2", {
    p_event_id: id ? Number(id) : undefined,
    p_name: String(formData.get("name") ?? ""),
    p_description: String(formData.get("description") ?? ""),
    p_event_type_id: eventTypeId,
    p_location: String(formData.get("location") ?? ""),
    p_event_date: date,
    p_starts_at: start as string,
    p_ends_at: end as string,
    p_fixed_points: fixedPoints as number,
    p_branch_ids: branches,
  });
  if (error) return { error: mutationError(error.message) };
  revalidatePath("/", "layout");
  redirect(`/events/${data}`);
}
export async function changeSignup(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  await getAuthorizationContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_event_signup", {
    p_event_id: Number(formData.get("event_id")),
    p_officer_id: Number(formData.get("officer_id")),
    p_remove: formData.get("remove") === "true",
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return {
    error: "",
    success:
      formData.get("remove") === "true" ? "Signup removed" : "Officer added",
  };
}
export async function cancelEvent(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  await getAuthorizationContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_event", {
    p_event_id: Number(formData.get("event_id")),
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return { error: "", success: "Event cancelled" };
}

export async function removeEvent(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  await getAuthorizationContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_event", {
    p_event_id: Number(formData.get("event_id")),
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  return {
    error: "",
    success: data ? "Event removed" : "Event was already removed",
  };
}
