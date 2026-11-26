"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Award,
  Bell,
  Calendar,
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  Menu,
  Shield,
  Users,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  formatDateTime,
  formatNotificationDestination,
  formatNotificationMessage,
} from "@/lib/presentation";
import ThemeToggle from "@/components/theme-toggle";
import AcademicPeriodSelector from "@/components/academic-period-selector";
import { emitToast } from "@/components/toast-region";
import type { AcademicPeriodData } from "@/lib/academic-periods";
import styles from "./site-navigation.module.css";
import { withPeriodParam } from "@/lib/period-url";
import {
  markAllNotificationsRead,
  openNotification,
} from "@/app/(protected)/notifications/actions";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/officers", label: "Officers", icon: Users },
  { href: "/points", label: "Points", icon: Award },
] as const;

const adminLinks = [
  ...links,
  { href: "/admin" as Route, label: "Admin", icon: Shield },
] as const;

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
  const withPeriod = (href: Route): Route => withPeriodParam(href, periodQuery);
  const visibleLinks = isAdmin ? adminLinks : links;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [bulkReadRevision, setBulkReadRevision] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [bulkReadError, setBulkReadError] = useState("");
  const previewRevision = `${unreadNotificationCount}:${recentNotifications.map(({ id, read_at }) => `${id}:${read_at ?? ""}`).join(",")}`;
  const locallyReadAll = bulkReadRevision === previewRevision;
  const displayUnreadCount = locallyReadAll ? 0 : unreadNotificationCount;
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const notificationBellRef = useRef<HTMLButtonElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
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
  useEffect(() => {
    if (!mobileControlsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileControlsOpen(false);
      mobileToggleRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileControlsOpen]);
  async function markAllRead() {
    const previousRevision = bulkReadRevision;
    setBulkReadError("");
    setMarkingAllRead(true);
    setBulkReadRevision(previewRevision);
    try {
      const result = await markAllNotificationsRead();
      if (!result.ok) {
        setBulkReadRevision(previousRevision);
        setBulkReadError(result.error);
        return;
      }
      emitToast("All notifications marked as read");
      startTransition(() => router.refresh());
    } catch {
      setBulkReadRevision(previousRevision);
      setBulkReadError("Could not mark notifications as read");
    } finally {
      setMarkingAllRead(false);
    }
  }
  const active = (href: string) => {
    if (
      pathname === "/officers/catalogs" ||
      pathname.startsWith("/officers/catalogs/")
    ) {
      return href === "/admin";
    }
    return href === "/"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <header className={styles.shell}>
      <div className={styles.inner}>
        <div className={styles.brandRow}>
          <Link href={withPeriod("/")} className={styles.brand}>
            <Image
              src="/favicon.ico"
              alt=""
              aria-hidden="true"
              width={26}
              height={26}
              className="size-[26px] shrink-0"
            />
            <span className={styles.brandName}>Cappy Hub</span>
          </Link>
          <button
            ref={mobileToggleRef}
            type="button"
            className={styles.mobileControlsToggle}
            aria-expanded={mobileControlsOpen}
            aria-controls="shell-controls"
            aria-label={
              mobileControlsOpen
                ? "Hide account and period controls"
                : "Show account and period controls"
            }
            onClick={() => setMobileControlsOpen((open) => !open)}
          >
            {mobileControlsOpen ? (
              <X aria-hidden="true" size={16} />
            ) : (
              <Menu aria-hidden="true" size={16} />
            )}
            <span>Menu</span>
          </button>
        </div>
        <nav aria-label="Main navigation" className={styles.nav}>
          {visibleLinks.map(({ href, label, icon: Icon }) => {
            const isActive = active(href);
            return (
              <Link
                key={href}
                href={withPeriod(href)}
                aria-current={isActive ? "page" : undefined}
                className={isActive ? styles.navActive : styles.navLink}
              >
                <Icon aria-hidden="true" size={16} className={styles.navIcon} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div
          id="shell-controls"
          className={`${styles.controls} ${mobileControlsOpen ? styles.controlsExpanded : styles.controlsCollapsed}`}
        >
          <div className={styles.utilityRow}>
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
                <Bell aria-hidden="true" size={17} />
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
                    <div className="flex items-center gap-3">
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
                      <Link
                        href="/notifications"
                        onClick={() => setNotificationsOpen(false)}
                      >
                        Inbox
                      </Link>
                    </div>
                  </div>
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
                                <span
                                  className={styles.notificationUnreadLabel}
                                >
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
            <ThemeToggle />
          </div>
          <div className={styles.periodWrap}>
            <AcademicPeriodSelector {...academicPeriods} />
          </div>
          <div className={styles.account}>{account}</div>
        </div>
      </div>
    </header>
  );
}
