import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import NotificationList from "./notification-list";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import styles from "./notifications.module.css";

const PAGE_SIZE = 50;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await getAuthorizationContext();
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  if (!Number.isSafeInteger(page) || page < 1) notFound();
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  const [notifications, count] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,title,message,kind,entity_type,priority,created_at,read_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    supabase.from("notifications").select("id", { count: "exact", head: true }),
  ]);
  if (notifications.error || count.error)
    throw new Error("Could not load notifications");
  const total = count.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.page}>
      <PageHeader
        title="Notifications"
        description="Your in-app notification history, with read status."
      />
      {notifications.data.length === 0 ? (
        <section className={styles.empty} aria-live="polite">
          <h2>You’re all caught up</h2>
          <p>New notifications will appear here.</p>
        </section>
      ) : (
        <NotificationList notifications={notifications.data} />
      )}
      {pages > 1 && (
        <nav className={styles.pagination} aria-label="Notification pages">
          {page > 1 ? (
            <Link href={`/notifications?page=${page - 1}`}>Newer</Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`/notifications?page=${page + 1}`}>Older</Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
