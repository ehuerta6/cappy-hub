"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";

export async function openNotification(formData: FormData) {
  await getAuthorizationContext();
  const rawId = formData.get("notification_id");
  const id = typeof rawId === "string" ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) redirect("/notifications");

  const supabase = await createClient();
  const { data: notification, error: loadError } = await supabase
    .from("notifications")
    .select("href")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !notification) redirect("/notifications");

  const { error: readError } = await supabase.rpc("mark_notification_opened", {
    p_notification_id: id,
  });
  if (readError) throw new Error("Could not mark the notification as read");
  redirect(notification.href as Route);
}

export async function reviewNotificationsForCurrentPage(
  entityType: "event" | "task" | "point" | "warning",
  entityId: number,
) {
  await getAuthorizationContext();
  if (!Number.isSafeInteger(entityId) || entityId < 0)
    throw new Error("Invalid notification target");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_reviewed", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw new Error("Could not update notification review state");
}
