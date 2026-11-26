"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { Archive, ArrowLeft } from "lucide-react";
import type { AcademicPeriodData } from "@/lib/academic-periods";

export default function HistoricalPeriodBanner({
  academicPeriods,
}: {
  academicPeriods: AcademicPeriodData;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const periodParam = searchParams.get("period");
  if (!periodParam || periodParam === "none") return null;

  const periodId = Number(periodParam);
  const selectedPeriod = Number.isSafeInteger(periodId)
    ? (academicPeriods.periods.find((item) => item.id === periodId) ?? null)
    : null;
  if (!selectedPeriod || !(selectedPeriod.ends_on < academicPeriods.currentDate))
    return null;

  const currentPeriod = academicPeriods.periods.find(
    (period) => period.id === academicPeriods.currentPeriodId,
  );
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("period");
  const returnHref = (
    nextParams.size ? `${pathname}?${nextParams.toString()}` : pathname
  ) as Route;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning-border bg-warning-bg px-3.5 py-2 text-xs text-foreground"
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <Archive
          aria-hidden="true"
          size={14}
          className="shrink-0 text-warning"
        />
        <span>
          Viewing <strong>{selectedPeriod.name}</strong> (read-only archive).
          Changes and signups are disabled in historical periods.
        </span>
      </span>
      <Link
        href={returnHref}
        className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
      >
        <ArrowLeft aria-hidden="true" size={13} />
        {currentPeriod
          ? `Return to ${currentPeriod.name}`
          : "Return to current period"}
      </Link>
    </div>
  );
}
