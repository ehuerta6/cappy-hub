import type { Route } from "next";
import { ListFilterBar, type ActiveFilterChip } from "@/components/ui";
import { formatCalendarDate, formatLabel } from "@/lib/presentation";

type PointHistoryFilterControlsProps = {
  isAdmin: boolean;
  status: string;
  searchQuery: string;
  awardType?: string;
  fromDate?: string;
  toDate?: string;
  dateRangeIsReversed?: boolean;
  hasActiveFilters: boolean;
  period?: string | string[];
};

export default function PointHistoryFilterControls({
  isAdmin,
  status,
  searchQuery,
  awardType,
  fromDate,
  toDate,
  dateRangeIsReversed = false,
  hasActiveFilters,
  period,
}: PointHistoryFilterControlsProps) {
  const baseParams = new URLSearchParams();
  baseParams.set("view", "history");
  if (period !== undefined) baseParams.set("period", String(period));
  if (searchQuery) baseParams.set("q", searchQuery);
  if (awardType) baseParams.set("type", awardType);
  if (fromDate) baseParams.set("from", fromDate);
  if (toDate) baseParams.set("to", toDate);
  if (isAdmin && status !== "active") baseParams.set("status", status);

  const without = (key: string): Route => {
    const next = new URLSearchParams(baseParams);
    next.delete(key);
    return `/points?${next.toString()}` as Route;
  };

  const activeFilters: ActiveFilterChip[] = [];
  if (searchQuery)
    activeFilters.push({
      label: `Search: "${searchQuery}"`,
      removeHref: without("q"),
    });
  if (awardType)
    activeFilters.push({
      label: `Type: ${formatLabel(awardType)}`,
      removeHref: without("type"),
    });
  if (fromDate)
    activeFilters.push({
      label: `From: ${formatCalendarDate(fromDate)}`,
      removeHref: without("from"),
    });
  if (toDate)
    activeFilters.push({
      label: `To: ${formatCalendarDate(toDate)}`,
      removeHref: without("to"),
    });
  if (isAdmin && status !== "active")
    activeFilters.push({
      label: `Status: ${formatLabel(status)}`,
      removeHref: without("status"),
    });

  return (
    <div className="space-y-2">
      <ListFilterBar
        key={JSON.stringify([
          searchQuery,
          awardType,
          status,
          fromDate,
          toDate,
          hasActiveFilters,
        ])}
        action="/points"
        label="Point history filters"
        active={hasActiveFilters}
        clearHref={
          period
            ? `/points?view=history&period=${period}`
            : "/points?view=history"
        }
        activeFilters={activeFilters}
      >
        <input type="hidden" name="view" value="history" />
        {period !== undefined && (
          <input type="hidden" name="period" value={String(period)} />
        )}
        <label className="min-w-52 flex-1">
          Search point history
          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            maxLength={100}
            placeholder="Officer, reason, event, or task"
          />
        </label>
        <label className="min-w-36">
          Award type
          <select name="type" defaultValue={awardType ?? ""}>
            <option value="">All types</option>
            <option value="participation">Participation</option>
            <option value="task">Task</option>
            <option value="manual">Manual</option>
            <option value="correction">Correction</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <label className="min-w-36">
          From
          <input type="date" name="from" defaultValue={fromDate ?? ""} />
        </label>
        <label className="min-w-36">
          To
          <input type="date" name="to" defaultValue={toDate ?? ""} />
        </label>
        {isAdmin && (
          <label className="min-w-32">
            History status
            <select name="status" defaultValue={status}>
              <option value="active">Active</option>
              <option value="removed">Removed</option>
              <option value="all">All</option>
            </select>
          </label>
        )}
      </ListFilterBar>
      {dateRangeIsReversed && (
        <p role="alert" className="text-xs font-medium text-danger">
          The “From” date is after the “To” date. Swap or clear one to filter by
          date range.
        </p>
      )}
    </div>
  );
}
