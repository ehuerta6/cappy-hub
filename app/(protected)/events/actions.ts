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
  const date = String(formData.get("event_date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { error: "Choose one event date" };
  if (startTime < "06:00" || endTime > "23:59" || endTime <= startTime)
    return { error: "Choose a same-day range from 6:00 AM through 11:59 PM" };
  const start = denverTimestamp(date, startTime);
  const end = denverTimestamp(date, endTime);
  if (!start || !end) return { error: "Enter valid El Paso times" };
  if (
    !String(formData.get("name") ?? "").trim() ||
    !String(formData.get("description") ?? "").trim() ||
    !String(formData.get("location") ?? "").trim()
  )
    return { error: "Name, description and location are required" };
  const eventTypeId = Number(formData.get("event_type_id"));
  if (!Number.isSafeInteger(eventTypeId) || eventTypeId <= 0)
    return { error: "Select a valid event type" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_event_with_links", {
    p_event_id: id ? Number(id) : undefined,
    p_name: String(formData.get("name") ?? ""),
    p_description: String(formData.get("description") ?? ""),
    p_event_type_id: eventTypeId,
    p_location: String(formData.get("location") ?? ""),
    p_event_date: date,
    p_starts_at: start,
    p_ends_at: end,
    p_branch_ids: branches,
    p_slides_url: String(formData.get("slides_url") ?? "").trim(),
    p_meeting_notes_url: String(formData.get("meeting_notes_url") ?? "").trim(),
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
export async function selfSignup(
  previous: { error: string; success: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  const signup = new FormData();
  signup.set("event_id", String(formData.get("event_id") ?? ""));
  signup.set("officer_id", String(actor.id));
  return changeSignup(previous, signup);
}
export async function bulkAddEventOfficers(
  _previous: { error: string; success: string },
  formData: FormData,
) {
  await getAuthorizationContext();
  const eventId = Number(formData.get("event_id"));
  const rawIds = formData.getAll("officer_ids");
  if (!Number.isSafeInteger(eventId) || eventId === 0 || rawIds.length === 0)
    return { error: "Select at least one officer", success: "" };
  const officerIds = rawIds.map((value) => String(value));
  if (
    officerIds.some((value) => !/^-?[1-9]\d*$/.test(value)) ||
    officerIds.some((value) => !Number.isSafeInteger(Number(value)))
  )
    return { error: "Select valid officers", success: "" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_add_event_officers", {
    p_event_id: eventId,
    p_officer_ids: officerIds.map(Number),
  });
  if (error) return { error: mutationError(error.message), success: "" };
  revalidatePath("/", "layout");
  const result = data as {
    added_officer_ids?: number[];
    awarded_officer_ids?: number[];
    points_per_officer?: number | null;
  };
  const count = result.added_officer_ids?.length ?? 0;
  const awards = result.awarded_officer_ids?.length ?? 0;
  return {
    error: "",
    success:
      awards > 0
        ? `Added ${count} attendee${count === 1 ? "" : "s"}; awarded ${awards} officer${awards === 1 ? "" : "s"} ${result.points_per_officer} points each`
        : count > 0
          ? `Added ${count} officer${count === 1 ? "" : "s"}`
          : "No changes were needed; selected officers were already added.",
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
