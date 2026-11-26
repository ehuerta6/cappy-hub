"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { reviewNotificationsForCurrentPage } from "@/app/(protected)/notifications/actions";

export default function NotificationReviewTracker() {
  const pathname = usePathname();
  const router = useRouter();
  const lastReviewedPath = useRef<string | null>(null);

  useEffect(() => {
    if (lastReviewedPath.current === pathname) return;
    const event = pathname.match(/^\/events\/(\d+)$/);
    const task = pathname.match(/^\/tasks\/(\d+)$/);
    const officer = pathname.match(/^\/officers\/(\d+)$/);
    let target: ["event" | "task" | "point" | "warning", number] | null = null;
    if (event) target = ["event", Number(event[1])];
    else if (task) target = ["task", Number(task[1])];
    else if (officer) target = ["warning", Number(officer[1])];
    else if (pathname === "/points") target = ["point", 0];
    if (!target) return;

    lastReviewedPath.current = pathname;
    let active = true;
    void reviewNotificationsForCurrentPage(target[0], target[1])
      .then(() => {
        if (active) router.refresh();
      })
      .catch(() => {
        if (active) lastReviewedPath.current = null;
      });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  return null;
}
