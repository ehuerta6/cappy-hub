"use client";

import type { ReactNode } from "react";
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
];

export default function SiteNavigation({
  isAdmin,
  account,
}: {
  isAdmin: boolean;
  account: ReactNode;
}) {
  const pathname = usePathname();
  const visibleLinks = isAdmin
    ? [...links, { href: "/admin", label: "Admin" }]
    : links;

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground hover:text-foreground"
        >
          Cappy Hub
        </Link>
        <nav
          aria-label="Main navigation"
          className="order-last flex w-full gap-1 overflow-x-auto lg:order-none lg:w-auto"
        >
          {visibleLinks.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "shrink-0 whitespace-nowrap border-b border-foreground px-3 py-2 text-sm font-medium text-foreground"
                    : "shrink-0 whitespace-nowrap border-b border-transparent px-3 py-2 text-sm text-muted hover:text-foreground"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 max-w-[70%] items-center gap-3">
          <ThemeToggle />
          {account}
        </div>
      </div>
    </header>
  );
}
