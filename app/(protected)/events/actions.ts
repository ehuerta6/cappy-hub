"use server";

import { getAuthorizationContext, canManageEvent } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";
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
  const start = String(formData.get("starts_at") ?? "");
  const end = String(formData.get("ends_at") ?? "");
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
  if (!timestampPattern.test(start) || !timestampPattern.test(end))
    return { error: "Enter valid start and end times" };
  const eventTypeId = Number(formData.get("event_type_id"));
  if (!Number.isSafeInteger(eventTypeId) || eventTypeId <= 0)
    return { error: "Select a valid event type" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_event", {
    p_event_id: id ? Number(id) : undefined,
    p_name: String(formData.get("name") ?? ""),
    p_description: String(formData.get("description") ?? ""),
    p_event_type_id: eventTypeId,
    p_location: String(formData.get("location") ?? ""),
    p_starts_at: start + "Z",
    p_ends_at: end + "Z",
    p_branch_ids: branches,
  });
  if (error) return { error: mutationError(error.message) };
  revalidatePath("/", "layout");
  redirect(`/events/${data}`);
}
export async function changeSignup(
  _previous: { error: string },
  formData: FormData,
) {
  await getAuthorizationContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_event_signup", {
    p_event_id: Number(formData.get("event_id")),
    p_officer_id: Number(formData.get("officer_id")),
    p_remove: formData.get("remove") === "true",
  });
  if (error) return { error: mutationError(error.message) };
  revalidatePath("/", "layout");
  return { error: "" };
}
export async function cancelEvent(
  _previous: { error: string },
  formData: FormData,
) {
  await getAuthorizationContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_event", {
    p_event_id: Number(formData.get("event_id")),
  });
  if (error) return { error: mutationError(error.message) };
  revalidatePath("/", "layout");
  return { error: "" };
}
