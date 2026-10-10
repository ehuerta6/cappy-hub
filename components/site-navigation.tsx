"use client";

import type { ReactNode } from "react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/theme-toggle";

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
}: {
  isAdmin: boolean;
  account: ReactNode;
}) {
  const pathname = usePathname();
  const visibleLinks = isAdmin ? adminLinks : links;
  const active = (href: string) =>
    href === "/"
      ? pathname === href
      : pathname === href ||
        pathname.startsWith(href + "/") ||
        (href === "/admin" &&
          (pathname === "/system-log" || pathname.startsWith("/system-log/")));

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-foreground hover:text-foreground"
        >
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
        <nav
          aria-label="Main navigation"
          className="flex min-w-0 flex-1 flex-wrap gap-x-1"
        >
          {visibleLinks.map(({ href, label }) => {
            const isActive = active(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "shrink-0 whitespace-nowrap border-b border-foreground px-2 py-2 text-sm font-medium text-foreground"
                    : "shrink-0 whitespace-nowrap border-b border-transparent px-2 py-2 text-sm text-muted hover:text-foreground"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-3">
          <ThemeToggle />
          <div className="min-w-0">{account}</div>
        </div>
      </div>
    </header>
  );
}
