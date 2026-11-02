"use client";

import type { ReactNode } from "react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import ThemeToggle from "@/components/theme-toggle";
import AcademicPeriodSelector from "@/components/academic-period-selector";
import type { AcademicPeriodData } from "@/lib/academic-periods";
import styles from "./site-navigation.module.css";

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
  academicPeriods = { periods: [], currentDate: "", currentPeriodId: null },
}: {
  isAdmin: boolean;
  account: ReactNode;
  academicPeriods?: AcademicPeriodData;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const periodQuery = searchParams.get("period");
  const withPeriod = (href: Route): Route => {
    if (periodQuery === null) return href;
    const params = new URLSearchParams();
    params.set("period", periodQuery);
    return `${href}?${params.toString()}` as Route;
  };
  const visibleLinks = isAdmin ? adminLinks : links;
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
          <AcademicPeriodSelector {...academicPeriods} />
          <ThemeToggle />
          <div className={styles.account}>{account}</div>
        </div>
      </div>
    </header>
  );
}
