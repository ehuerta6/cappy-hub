"use server";
import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function saveEvent(
  _previous: { error: string },
  formData: FormData,
) {
  const id = formData.get("id");
  const start = String(formData.get("starts_at") ?? "");
  const end = String(formData.get("ends_at") ?? "");
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
  if (!timestampPattern.test(start) || !timestampPattern.test(end))
    return { error: "Enter valid start and end times" };
  const { data, error } = await supabase.rpc("save_event", {
    p_event_id: id ? Number(id) : undefined,
    p_name: String(formData.get("name") ?? ""),
    p_description: String(formData.get("description") ?? ""),
    p_type: String(formData.get("type") ?? ""),
    p_location: String(formData.get("location") ?? ""),
    p_starts_at: start + "Z",
    p_ends_at: end + "Z",
    p_branch_ids: formData.getAll("branches").map(Number),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect(`/events/${data}`);
}
export async function changeSignup(
  _previous: { error: string },
  formData: FormData,
) {
  const { error } = await supabase.rpc("change_event_signup", {
    p_event_id: Number(formData.get("event_id")),
    p_officer_id: Number(formData.get("officer_id")),
    p_remove: formData.get("remove") === "true",
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: "" };
}
export async function cancelEvent(
  _previous: { error: string },
  formData: FormData,
) {
  const { data, error } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", Number(formData.get("event_id")))
    .neq("status", "cancelled")
    .gt("ends_at", new Date().toISOString())
    .select("id");
  if (error) return { error: error.message };
  if (!data.length) return { error: "This event cannot be cancelled" };
  revalidatePath("/", "layout");
  return { error: "" };
}
