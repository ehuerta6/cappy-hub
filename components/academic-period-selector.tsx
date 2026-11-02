"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AcademicPeriod } from "@/lib/academic-periods";
import type { Route } from "next";

export default function AcademicPeriodSelector({
  periods,
  currentDate,
  currentPeriodId,
}: {
  periods: Pick<AcademicPeriod, "id" | "name" | "starts_on" | "ends_on">[];
  currentDate: string;
  currentPeriodId: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("period");
  const selectedId =
    requested === null || requested === "current"
      ? currentPeriodId
      : requested === "none"
        ? null
        : Number(requested);
  const selectedPeriod =
    periods.find((period) => period.id === selectedId) ??
    (requested === "none"
      ? undefined
      : periods.find((period) => period.id === currentPeriodId));
  const selectValue =
    requested === "none"
      ? "none"
      : selectedPeriod && selectedPeriod.id !== currentPeriodId
        ? String(selectedPeriod.id)
        : "current";
  const historical =
    selectedPeriod !== undefined && selectedPeriod.ends_on < currentDate;
  const emptyLabel =
    requested === "none"
      ? "All dates"
      : currentPeriodId === null
        ? "No current period"
        : "Current period";

  function selectPeriod(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "current") next.delete("period");
    else next.set("period", value);
    const query = next.toString();
    router.push((query ? `${pathname}?${query}` : pathname) as Route);
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <label className="sr-only" htmlFor="academic-period-select">
        View academic period
      </label>
      <select
        id="academic-period-select"
        aria-describedby="academic-period-state"
        className="min-h-9 max-w-44 rounded-md border border-border bg-surface px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
        value={selectValue}
        onChange={(event) => selectPeriod(event.target.value)}
      >
        <option value="current">
          {currentPeriodId === null
            ? "No current period"
            : (periods.find((period) => period.id === currentPeriodId)?.name ??
              "Current period")}
        </option>
        {currentPeriodId === null && <option value="none">All dates</option>}
        {periods
          .filter((period) => period.id !== currentPeriodId)
          .map((period) => (
            <option key={period.id} value={String(period.id)}>
              {period.name}
            </option>
          ))}
      </select>
      <span
        id="academic-period-state"
        aria-live="polite"
        className="text-xs text-muted"
      >
        {historical
          ? "Historical · read only"
          : selectedPeriod
            ? selectedPeriod.id === currentPeriodId
              ? "Current period"
              : selectedPeriod.starts_on > currentDate
                ? "Future period"
                : "Period view"
            : emptyLabel}
      </span>
    </div>
  );
}

export function AcademicPeriodWriteContextField() {
  const searchParams = useSearchParams();
  return (
    <input
      type="hidden"
      name="writable_period"
      value={searchParams?.get("period") ?? "current"}
    />
  );
}
