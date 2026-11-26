"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatDateTime,
  formatNotificationDestination,
  formatNotificationMessage,
} from "@/lib/presentation";
import { emitToast } from "@/components/toast-region";
import {
  markAllNotificationsRead,
  openNotification,
  setNotificationReadStatus,
} from "./actions";
import styles from "./notifications.module.css";

type Notification = {
  id: number;
  title: string;
  message: string;
  kind: string;
  entity_type: string;
  priority: string;
  created_at: string;
  read_at: string | null;
};

type EntityFilter = "all" | "event" | "task" | "point" | "warning";

const ENTITY_FILTERS: { value: EntityFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "event", label: "Events" },
  { value: "task", label: "Tasks" },
  { value: "point", label: "Points" },
  { value: "warning", label: "Warnings" },
];

function notificationBucket(createdAt: string): "Today" | "This week" | "Earlier" {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "Earlier";
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const ts = created.getTime();
  if (ts >= startOfToday) return "Today";
  if (ts >= startOfToday - 6 * 86_400_000) return "This week";
  return "Earlier";
}

function matchesEntityFilter(notification: Notification, filter: EntityFilter) {
  if (filter === "all") return true;
  if (filter === "warning")
    return (
      notification.entity_type === "warning" ||
      notification.kind.startsWith("warning.")
    );
  return notification.entity_type === filter;
}

export default function NotificationList({
  notifications,
  unreadCount,
}: {
  notifications: Notification[];
  unreadCount: number;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const inboxRevision = `${unreadCount}:${notifications.map(({ id, read_at }) => `${id}:${read_at ?? ""}`).join(",")}`;
  const [readOverrideState, setReadOverrideState] = useState<{
    revision: string;
    byId: Record<number, boolean>;
  }>({ revision: inboxRevision, byId: {} });
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [allReadRevision, setAllReadRevision] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const readById =
    readOverrideState.revision === inboxRevision ? readOverrideState.byId : {};

  const isNotificationRead = (notification: Notification) =>
    readById[notification.id] ?? Boolean(notification.read_at);

  const remainingUnread =
    allReadRevision === inboxRevision
      ? 0
      : notifications.filter((n) => !isNotificationRead(n)).length;

  const visibleNotifications = notifications.filter((notification) => {
    if (filter === "unread" && isNotificationRead(notification)) return false;
    if (attentionOnly && notification.priority === "confirmation") return false;
    return matchesEntityFilter(notification, entityFilter);
  });

  async function markAllRead() {
    setError("");
    setMarkingAllRead(true);
    const previousAllRead = allReadRevision;
    const previousOverrides = readById;
    setReadOverrideState({
      revision: inboxRevision,
      byId: {
        ...previousOverrides,
        ...Object.fromEntries(notifications.map(({ id }) => [id, true])),
      },
    });
    setAllReadRevision(inboxRevision);
    try {
      const result = await markAllNotificationsRead();
      if (!result.ok) {
        setReadOverrideState({
          revision: inboxRevision,
          byId: previousOverrides,
        });
        setAllReadRevision(previousAllRead);
        setError(result.error);
        return;
      }
      emitToast("All notifications marked as read");
      startTransition(() => router.refresh());
    } catch {
      setReadOverrideState({
        revision: inboxRevision,
        byId: previousOverrides,
      });
      setAllReadRevision(previousAllRead);
      setError("Could not mark notifications as read");
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function toggleRead(notification: Notification) {
    const isRead = !isNotificationRead(notification);
    const previousOverrides = readById;
    setError("");
    setPendingId(notification.id);
    setReadOverrideState({
      revision: inboxRevision,
      byId: { ...previousOverrides, [notification.id]: isRead },
    });
    try {
      const result = await setNotificationReadStatus(notification.id, isRead);
      if (!result.ok) {
        setReadOverrideState({
          revision: inboxRevision,
          byId: previousOverrides,
        });
        setError(result.error);
        return;
      }
      emitToast(isRead ? "Marked as read" : "Marked as unread");
      startTransition(() => router.refresh());
    } catch {
      setReadOverrideState({
        revision: inboxRevision,
        byId: previousOverrides,
      });
      setError("Could not update notification status");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className="space-y-2.5">
        {(remainingUnread > 0 || filter === "unread") && (
          <div className={styles.toolbar}>
            <div
              className={styles.filterGroup}
              role="tablist"
              aria-label="Filter notifications"
            >
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                className={
                  filter === "all" ? styles.filterTabActive : styles.filterTab
                }
                onClick={() => setFilter("all")}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "unread"}
                className={
                  filter === "unread"
                    ? styles.filterTabActive
                    : styles.filterTab
                }
                onClick={() => setFilter("unread")}
              >
                Unread ({remainingUnread})
              </button>
            </div>
            {unreadCount > 0 && allReadRevision !== inboxRevision && (
              <button
                className={styles.markAllRead}
                type="button"
                disabled={markingAllRead || pendingId !== null}
                onClick={() => void markAllRead()}
              >
                {markingAllRead ? "Updating…" : "Mark all as read"}
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by notification category"
          >
            {ENTITY_FILTERS.map(({ value, label }) => {
              const active = entityFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setEntityFilter(value)}
                  className={`!min-h-7 !rounded-full !px-2.5 !py-0.5 text-xs font-medium transition-colors ${
                    active
                      ? "!border-brand-border !bg-brand-bg !text-brand"
                      : "!border-border !bg-surface !text-muted hover:!border-border-strong hover:!bg-hover hover:!text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-pressed={attentionOnly}
            onClick={() => setAttentionOnly((current) => !current)}
            className={`!min-h-7 !rounded-full !px-2.5 !py-0.5 text-xs font-medium transition-colors ${
              attentionOnly
                ? "!border-warning-border !bg-warning-bg !text-warning"
                : "!border-border !bg-surface !text-muted hover:!border-border-strong hover:!bg-hover hover:!text-foreground"
            }`}
          >
            Needs attention only
          </button>
        </div>
      </div>
      {visibleNotifications.length === 0 ? (
        <section className={styles.empty} aria-live="polite">
          <h2>All caught up</h2>
          <p>
            {attentionOnly || entityFilter !== "all"
              ? "No notifications match these filters."
              : "No unread notifications."}
          </p>
        </section>
      ) : (
        <ol className={styles.list} aria-label="Notification history">
          {visibleNotifications.map((notification, index) => {
            const isRead = isNotificationRead(notification);
            const bucket = notificationBucket(notification.created_at);
            const previousBucket =
              index > 0
                ? notificationBucket(visibleNotifications[index - 1].created_at)
                : null;
            const showBucketHeader = bucket !== previousBucket;
            return (
              <li key={notification.id} className="space-y-1.5">
                {showBucketHeader && (
                  <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {bucket}
                  </p>
                )}
                <div
                  className={`${styles.item} ${isRead ? "" : styles.unread}`}
                >
                  <div className={styles.row}>
                    <form action={openNotification}>
                      <input
                        type="hidden"
                        name="notification_id"
                        value={notification.id}
                      />
                      <button className={styles.open} type="submit">
                        <span className={styles.titleRow}>
                          <strong>{notification.title}</strong>
                          {!isRead && (
                            <span className={styles.unreadLabel}>Unread</span>
                          )}
                        </span>
                        {notification.message && (
                          <span>
                            {formatNotificationMessage(
                              notification.kind,
                              notification.message,
                            )}
                          </span>
                        )}
                        <span className={styles.meta}>
                          {formatNotificationDestination(
                            notification.entity_type,
                          )}
                          {" · "}
                          {notification.priority === "confirmation"
                            ? "Confirmation"
                            : "Needs attention"}
                          {" · "}
                          <time dateTime={notification.created_at}>
                            {formatDateTime(notification.created_at)}
                          </time>
                        </span>
                      </button>
                    </form>
                    <button
                      className={styles.statusButton}
                      type="button"
                      disabled={pendingId === notification.id}
                      onClick={() => void toggleRead(notification)}
                    >
                      {pendingId === notification.id
                        ? "Updating…"
                        : isRead
                          ? "Mark as unread"
                          : "Mark as read"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
