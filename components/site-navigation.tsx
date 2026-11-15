"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  formatDateTime,
  formatNotificationDestination,
  formatNotificationMessage,
} from "@/lib/presentation";
import ThemeToggle from "@/components/theme-toggle";
import AcademicPeriodSelector from "@/components/academic-period-selector";
import type { AcademicPeriodData } from "@/lib/academic-periods";
import styles from "./site-navigation.module.css";
import {
  markAllNotificationsRead,
  openNotification,
} from "@/app/(protected)/notifications/actions";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/officers", label: "Officers" },
  { href: "/points", label: "Points" },
] as const satisfies readonly { href: Route; label: string }[];
const adminLinks = [...links, { href: "/admin", label: "Admin" }] as const;

export default function SiteNavigation({
  isAdmin,
  account,
  recentNotifications,
  unreadNotificationCount,
  academicPeriods = { periods: [], currentDate: "", currentPeriodId: null },
}: {
  isAdmin: boolean;
  account: ReactNode;
  recentNotifications?: {
    id: number;
    title: string;
    message: string;
    kind: string;
    entity_type: string;
    created_at: string;
    read_at: string | null;
  }[];
  unreadNotificationCount?: number;
  academicPeriods?: AcademicPeriodData;
}) {
  recentNotifications ??= [];
  unreadNotificationCount ??= 0;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const periodQuery = searchParams.get("period");
  const withPeriod = (href: Route): Route => {
    if (periodQuery === null) return href;
    const params = new URLSearchParams();
    params.set("period", periodQuery);
    return `${href}?${params.toString()}` as Route;
  };
  const visibleLinks = isAdmin ? adminLinks : links;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [bulkReadRevision, setBulkReadRevision] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [bulkReadError, setBulkReadError] = useState("");
  const previewRevision = `${unreadNotificationCount}:${recentNotifications.map(({ id, read_at }) => `${id}:${read_at ?? ""}`).join(",")}`;
  const locallyReadAll = bulkReadRevision === previewRevision;
  const displayUnreadCount = locallyReadAll ? 0 : unreadNotificationCount;
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const notificationBellRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!notificationsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node))
        setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNotificationsOpen(false);
      notificationBellRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);
  async function markAllRead() {
    setBulkReadError("");
    setMarkingAllRead(true);
    try {
      const result = await markAllNotificationsRead();
      if (!result.ok) {
        setBulkReadError(result.error);
        return;
      }
      setBulkReadRevision(previewRevision);
      router.refresh();
    } catch {
      setBulkReadError("Could not mark notifications as read");
    } finally {
      setMarkingAllRead(false);
    }
  }
  const active = (href: string) =>
    href === "/"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className={styles.shell}>
      <div className={styles.inner}>
        <Link href={withPeriod("/")} className={styles.brand}>
          <Image
            src="/favicon.ico"
            alt=""
            aria-hidden="true"
            width={26}
            height={26}
            className="size-[26px] shrink-0"
          />
          <span className="min-w-0 break-words">Cappy Hub</span>
        </Link>
        <nav aria-label="Main navigation" className={styles.nav}>
          {visibleLinks.map(({ href, label }) => {
            const isActive = active(href);
            return (
              <Link
                key={href}
                href={withPeriod(href)}
                aria-current={isActive ? "page" : undefined}
                className={isActive ? styles.navActive : styles.navLink}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.controls}>
          <div className={styles.notificationMenu} ref={notificationMenuRef}>
            <button
              ref={notificationBellRef}
              className={styles.notificationBell}
              type="button"
              aria-expanded={notificationsOpen}
              aria-controls="notification-preview"
              aria-label={`Notifications${displayUnreadCount ? `, ${displayUnreadCount} unread` : ""}`}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell aria-hidden="true" size={18} />
              {displayUnreadCount > 0 && (
                <span className={styles.notificationCount}>
                  {displayUnreadCount > 99 ? "99+" : displayUnreadCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div
                id="notification-preview"
                className={styles.notificationPopover}
              >
                <div className={styles.notificationPopoverTitle}>
                  <span className={styles.notificationPopoverHeading}>
                    <strong>Notifications</strong>
                    <span>
                      {displayUnreadCount === 0
                        ? "All caught up"
                        : `${displayUnreadCount} unread`}
                    </span>
                  </span>
                  <Link
                    href="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    Inbox
                  </Link>
                </div>
                {displayUnreadCount > 0 && (
                  <button
                    type="button"
                    className={styles.markAllNotificationsRead}
                    disabled={markingAllRead}
                    onClick={() => void markAllRead()}
                  >
                    {markingAllRead ? "Updating…" : "Mark all as read"}
                  </button>
                )}
                {bulkReadError && (
                  <p className={styles.notificationError} role="alert">
                    {bulkReadError}
                  </p>
                )}
                {recentNotifications.length === 0 ? (
                  <p className={styles.notificationEmpty}>
                    You’re all caught up.
                  </p>
                ) : (
                  <ul className={styles.notificationPreviewList}>
                    {recentNotifications.map((notification) => (
                      <li key={notification.id}>
                        <form action={openNotification}>
                          <input
                            type="hidden"
                            name="notification_id"
                            value={notification.id}
                          />
                          <button
                            className={`${styles.notificationPreviewButton} ${notification.read_at || locallyReadAll ? "" : styles.notificationPreviewUnread}`}
                            type="submit"
                            onClick={() => setNotificationsOpen(false)}
                          >
                            <span className={styles.notificationPreviewTitle}>
                              {notification.title}
                            </span>
                            {!notification.read_at && !locallyReadAll && (
                              <span className={styles.notificationUnreadLabel}>
                                Unread
                              </span>
                            )}
                            {notification.message && (
                              <span
                                className={styles.notificationPreviewMessage}
                              >
                                {formatNotificationMessage(
                                  notification.kind,
                                  notification.message,
                                )}
                              </span>
                            )}
                            <span className={styles.notificationPreviewMeta}>
                              <span>
                                {formatNotificationDestination(
                                  notification.entity_type,
                                )}
                              </span>
                              <time dateTime={notification.created_at}>
                                {formatDateTime(notification.created_at)}
                              </time>
                            </span>
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  className={styles.allNotifications}
                  href="/notifications"
                  onClick={() => setNotificationsOpen(false)}
                >
                  View all notifications
                </Link>
              </div>
            )}
          </div>
          <AcademicPeriodSelector {...academicPeriods} />
          <ThemeToggle />
          <div className={styles.account}>{account}</div>
        </div>
      </div>
    </header>
  );
}
