"use client";

import { ChevronDown } from "lucide-react";
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
  const active = (href: string) =>
    href === "/"
      ? pathname === href
      : pathname === href ||
        pathname.startsWith(href + "/") ||
        (href === "/admin" &&
          (pathname === "/system-log" || pathname.startsWith("/system-log/")));
  const activeLink = visibleLinks.find(({ href }) => active(href)) ?? links[0];

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 max-[240px]:grid-cols-1 lg:flex lg:gap-x-4">
        <Link
          href="/"
          className="min-w-0 break-words text-sm font-semibold tracking-tight text-foreground hover:text-foreground"
        >
          Cappy Hub
        </Link>
        <details className="min-w-0 lg:hidden">
          <summary
            aria-label={"Main navigation, current section: " + activeLink.label}
            className="flex min-h-11 min-w-0 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-border bg-surface/40 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
          >
            <span className="min-w-0 break-words text-sm font-medium text-foreground">
              Section: {activeLink.label}
            </span>
            <ChevronDown aria-hidden="true" size={18} className="shrink-0" />
          </summary>
          <nav
            aria-label="Main navigation"
            className="mt-2 rounded-lg border border-border bg-surface p-2"
          >
            <ul className="grid list-none gap-1 p-0 sm:grid-cols-2">
              {visibleLinks.map(({ href, label }) => {
                const isActive = active(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={
                        isActive
                          ? "flex min-h-11 min-w-0 items-center break-words rounded-md border border-border-strong bg-surface-muted px-3 py-2 text-sm font-medium text-foreground"
                          : "flex min-h-11 min-w-0 items-center break-words rounded-md px-3 py-2 text-sm text-secondary hover:bg-hover hover:text-foreground"
                      }
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </details>
        <nav
          aria-label="Main navigation"
          className="hidden shrink-0 gap-1 lg:flex"
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
                    ? "shrink-0 whitespace-nowrap border-b border-foreground px-3 py-2 text-sm font-medium text-foreground"
                    : "shrink-0 whitespace-nowrap border-b border-transparent px-3 py-2 text-sm text-muted hover:text-foreground"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="col-span-2 flex w-full min-w-0 flex-wrap items-center gap-3 max-[240px]:col-span-1 lg:col-span-1 lg:ml-auto lg:w-auto lg:flex-nowrap">
          <ThemeToggle />
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1 lg:flex-none">
            {account}
          </div>
        </div>
      </div>
    </header>
  );
}
