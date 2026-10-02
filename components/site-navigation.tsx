"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/tasks", label: "Tasks" },
  { href: "/officers", label: "Officers" },
  { href: "/points", label: "Points" },
];

export default function SiteNavigation({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const visibleLinks = isAdmin
    ? [...links, { href: "/system-log", label: "System Log" }]
    : links;

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-100 hover:text-white"
        >
          Cappy Hub
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex gap-1 overflow-x-auto"
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
                    ? "border-b border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-100"
                    : "border-b border-transparent px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100"
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
