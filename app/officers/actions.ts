"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

export async function saveOfficer(
  _previous: { error: string },
  formData: FormData,
) {
  const officerId = formData.get("id");
  const utepEmail = String(formData.get("utep_email") ?? "").trim();
  const personalEmail = String(formData.get("personal_email") ?? "").trim();
  if (!utepEmail && !personalEmail)
    return { error: "Provide at least one email" };
  const { data, error } = await supabase.rpc("save_officer", {
    p_officer_id: officerId ? Number(officerId) : undefined,
    p_name: String(formData.get("name") ?? ""),
    p_utep_email: utepEmail || undefined,
    p_personal_email: personalEmail || undefined,
    p_position_id: Number(formData.get("position_id")),
    p_classification:
      String(formData.get("classification") ?? "").trim() || undefined,
    p_status: officerId ? String(formData.get("status") ?? "") : "active",
    p_branch_ids: formData.getAll("branches").map(Number),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect(`/officers/${data}`);
}
