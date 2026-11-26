import "server-only";
import type { createClient } from "@/lib/supabase/server";

type OfficerEnrichableNotification = {
  entity_type: string;
  entity_id?: number | null;
  href?: string | null;
  title: string;
  message: string;
};

function resolveOfficerId(
  notification: OfficerEnrichableNotification,
): number | null {
  if (
    notification.entity_type === "officer" &&
    typeof notification.entity_id === "number"
  ) {
    return notification.entity_id;
  }
  if (typeof notification.href === "string") {
    const match = /^\/officers\/(-?[1-9]\d*)(?:[/?#]|$)/.exec(
      notification.href,
    );
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Enriches officer-scoped notifications (such as "Officer reached 3 active Warnings")
 * with the referenced Officer's name when neither the title nor message already includes it.
 */
export async function enrichOfficerNotifications<
  T extends OfficerEnrichableNotification,
>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  notifications: T[],
): Promise<T[]> {
  const officerIds = [
    ...new Set(
      notifications
        .map(resolveOfficerId)
        .filter((id): id is number => id !== null),
    ),
  ];
  if (officerIds.length === 0) return notifications;

  const { data, error } = await supabase
    .from("officers")
    .select("id,name")
    .in("id", officerIds);
  if (error || !data?.length) return notifications;

  const namesById = new Map(data.map((officer) => [officer.id, officer.name]));
  return notifications.map((notification) => {
    const officerId = resolveOfficerId(notification);
    if (officerId === null) return notification;
    const officerName = namesById.get(officerId);
    if (!officerName) return notification;
    const lowerName = officerName.toLowerCase();
    if (
      notification.title.toLowerCase().includes(lowerName) ||
      notification.message.toLowerCase().includes(lowerName)
    ) {
      return notification;
    }
    return {
      ...notification,
      message: notification.message
        ? `${officerName} — ${notification.message}`
        : officerName,
    };
  });
}
