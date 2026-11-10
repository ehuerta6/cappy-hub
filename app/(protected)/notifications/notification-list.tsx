"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, formatNotificationMessage } from "@/lib/presentation";
import { openNotification, setNotificationReadStatus } from "./actions";
import styles from "./notifications.module.css";

type Notification = {
  id: number;
  title: string;
  message: string;
  kind: string;
  priority: string;
  created_at: string;
  read_at: string | null;
};

export default function NotificationList({
  notifications,
}: {
  notifications: Notification[];
}) {
  const [readById, setReadById] = useState<Record<number, boolean>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function toggleRead(notification: Notification) {
    const isRead = !(
      readById[notification.id] ?? Boolean(notification.read_at)
    );
    setError("");
    setPendingId(notification.id);
    try {
      const result = await setNotificationReadStatus(notification.id, isRead);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReadById((current) => ({ ...current, [notification.id]: isRead }));
      router.refresh();
    } catch {
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
      <ol className={styles.list} aria-label="Notification history">
        {notifications.map((notification) => {
          const isRead =
            readById[notification.id] ?? Boolean(notification.read_at);
          return (
            <li
              key={notification.id}
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
                      {notification.priority === "confirmation"
                        ? "Confirmation"
                        : "Needs attention"}
                      {" · "}
                      {formatDateTime(notification.created_at)}
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
            </li>
          );
        })}
      </ol>
    </>
  );
}
