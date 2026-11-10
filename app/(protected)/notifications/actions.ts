"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  revalidatePath("/", "layout");
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

export async function setNotificationReadStatus(
  notificationId: number,
  isRead: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await getAuthorizationContext();
  if (!Number.isSafeInteger(notificationId) || notificationId < 1)
    return { ok: false, error: "Could not update notification status" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_notification_read_status", {
    p_notification_id: notificationId,
    p_is_read: isRead,
  });
  if (error)
    return { ok: false, error: "Could not update notification status" };
  revalidatePath("/", "layout");
  revalidatePath("/notifications");
  return { ok: true };
}
