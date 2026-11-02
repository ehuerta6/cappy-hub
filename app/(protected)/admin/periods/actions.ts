"use server";

import { getAuthorizationContext, isAdmin } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveAcademicPeriod(formData: FormData) {
  const actor = await getAuthorizationContext({
    enforceWritablePeriod: true,
    periodContext: formData.get("writable_period"),
  });
  if (!isAdmin(actor)) redirect("/admin/periods?error=admin");
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "");
  const idValue = String(formData.get("id") ?? "");
  const periodId = idValue ? Number(idValue) : null;
  if (
    !name ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) ||
    endsOn < startsOn ||
    (periodId !== null && !Number.isSafeInteger(periodId))
  )
    redirect("/admin/periods?error=invalid");
  const supabase = await createClient();
  const saveArgs = {
    p_name: name,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
    ...(periodId === null ? {} : { p_period_id: periodId }),
  };
  const { error } = await supabase.rpc("save_academic_period", saveArgs);
  if (error) {
    if (error.code === "23P01") redirect("/admin/periods?error=overlap");
    redirect("/admin/periods?error=save");
  }
  revalidatePath("/", "layout");
  redirect("/admin/periods?saved=1");
}
