"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reviewNotificationsForCurrentPage } from "@/app/(protected)/notifications/actions";

export default function NotificationReviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const event = pathname.match(/^\/events\/(\d+)$/);
    const task = pathname.match(/^\/tasks\/(\d+)$/);
    const officer = pathname.match(/^\/officers\/(\d+)$/);
    if (event)
      void reviewNotificationsForCurrentPage("event", Number(event[1]));
    else if (task)
      void reviewNotificationsForCurrentPage("task", Number(task[1]));
    else if (officer)
      void reviewNotificationsForCurrentPage("warning", Number(officer[1]));
    else if (pathname === "/points")
      void reviewNotificationsForCurrentPage("point", 0);
  }, [pathname]);

  return null;
}
