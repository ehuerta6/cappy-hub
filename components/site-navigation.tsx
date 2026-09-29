"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/officers", label: "Officers" },
  { href: "/points", label: "Points" },
];

function HistoryControls() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const [position, setPosition] = useState({ index: 0, length: 1 });
  const trail = useRef<string[]>([]);
  const cursor = useRef(0);
  const pending = useRef<"back" | "forward" | null>(null);
  useEffect(() => {
    const route = window.location.pathname + window.location.search;
    if (trail.current.length === 0) trail.current = [route];
    else if (pending.current === "back")
      cursor.current = Math.max(0, cursor.current - 1);
    else if (pending.current === "forward")
      cursor.current = Math.min(trail.current.length - 1, cursor.current + 1);
    else if (trail.current[cursor.current] !== route) {
      const previous = trail.current[cursor.current - 1];
      const next = trail.current[cursor.current + 1];
      if (route === previous) cursor.current -= 1;
      else if (route === next) cursor.current += 1;
      else {
        trail.current = [...trail.current.slice(0, cursor.current + 1), route];
        cursor.current = trail.current.length - 1;
      }
    }
    pending.current = null;
    setPosition({ index: cursor.current, length: trail.current.length });
  }, [pathname, query]);
  const browserHasBack =
    typeof window !== "undefined" && window.history.length > 1;
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="button-secondary"
        disabled={position.index === 0 && !browserHasBack}
        onClick={() => {
          pending.current = "back";
          window.history.back();
        }}
      >
        Back
      </button>
      <button
        type="button"
        className="button-secondary"
        disabled={position.index >= position.length - 1}
        onClick={() => {
          pending.current = "forward";
          window.history.forward();
        }}
      >
        Forward
      </button>
    </div>
  );
}

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
        <Suspense
          fallback={
            <div className="flex gap-2">
              <button disabled>Back</button>
              <button disabled>Forward</button>
            </div>
          }
        >
          <HistoryControls />
        </Suspense>
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
