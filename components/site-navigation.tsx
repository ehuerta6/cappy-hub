"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-100 hover:text-white"
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
                    ? "shrink-0 whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-100"
                    : "shrink-0 whitespace-nowrap border-b border-transparent px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto min-w-0 max-w-[70%]">{account}</div>
      </div>
    </header>
  );
}
