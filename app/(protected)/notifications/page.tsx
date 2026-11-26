import { PageHeader } from "@/components/ui";
import NotificationList from "./notification-list";
import { getAuthorizationContext } from "@/lib/authorization";
import { enrichOfficerNotifications } from "@/lib/notification-enrichment";
import { createClient } from "@/lib/supabase/server";
import styles from "./notifications.module.css";

export default async function NotificationsPage() {
  await getAuthorizationContext();
  const supabase = await createClient();
  const [notifications, count, unreadCount] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id,title,message,kind,entity_type,entity_id,href,priority,created_at,read_at",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("notifications").select("id", { count: "exact", head: true }),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  if (notifications.error || count.error || unreadCount.error)
    throw new Error("Could not load notifications");
  const total = count.count ?? 0;
  const enrichedNotifications = await enrichOfficerNotifications(
    supabase,
    notifications.data ?? [],
  );

  return (
    <div className={styles.page} data-page-width="wide">
      <PageHeader
        title="Notifications"
        description="Your in-app notification history, with read status."
      />
      {total === 0 ? (
        <section className={styles.empty} aria-live="polite">
          <h2>You’re all caught up</h2>
          <p>New notifications will appear here.</p>
        </section>
      ) : (
        <>
          {total > enrichedNotifications.length && (
            <p role="status" className="text-xs text-muted">
              Showing latest {enrichedNotifications.length} of {total}{" "}
              notifications.
            </p>
          )}
          <NotificationList
            notifications={enrichedNotifications}
            unreadCount={unreadCount.count ?? 0}
          />
        </>
      )}
    </div>
  );
}
