"use server";

import {
  getAuthorizationContext,
  canManageOfficers,
} from "@/lib/authorization";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mutationError } from "@/lib/mutation-error";

export async function saveOfficer(
  _previous: { error: string },
  formData: FormData,
) {
  const actor = await getAuthorizationContext();
  if (!canManageOfficers(actor)) return { error: "Admin required" };
  const officerId = formData.get("id");
  const utepEmail = String(formData.get("utep_email") ?? "").trim();
  const personalEmail = String(formData.get("personal_email") ?? "").trim();
  if (!utepEmail && !personalEmail)
    return { error: "Provide at least one email" };
  const supabase = await createClient();
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
  if (error) return { error: mutationError(error.message) };
  revalidatePath("/", "layout");
  redirect(`/officers/${data}`);
}
