"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

export async function saveOfficer(
  _previous: { error: string },
  formData: FormData,
) {
  const officerId = formData.get("id");
  const { data, error } = await supabase.rpc("save_officer", {
    p_officer_id: officerId ? Number(officerId) : undefined,
    p_name: String(formData.get("name") ?? ""),
    p_email: String(formData.get("email") ?? ""),
    p_position_id: Number(formData.get("position_id")),
    p_classification: String(formData.get("classification") ?? ""),
    p_status: String(formData.get("status") ?? ""),
    p_branch_ids: formData.getAll("branches").map(Number),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect(`/officers/${data}`);
}
