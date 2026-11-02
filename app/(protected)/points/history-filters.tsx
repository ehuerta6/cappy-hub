import { ListFilterBar } from "@/components/ui";

type PointHistoryFilterControlsProps = {
  isAdmin: boolean;
  status: string;
  searchQuery: string;
  awardType?: string;
  hasActiveFilters: boolean;
  period?: string | string[];
};

export default function PointHistoryFilterControls({
  isAdmin,
  status,
  searchQuery,
  awardType,
  hasActiveFilters,
  period,
}: PointHistoryFilterControlsProps) {
  return (
    <ListFilterBar
      key={JSON.stringify([searchQuery, awardType, status, hasActiveFilters])}
      action="/points"
      label="Point history filters"
      active={hasActiveFilters}
      clearHref={
        period
          ? `/points?view=history&period=${period}`
          : "/points?view=history"
      }
    >
      <input type="hidden" name="view" value="history" />
      {period !== undefined && (
        <input type="hidden" name="period" value={String(period)} />
      )}
      <label className="min-w-56 flex-1">
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
        </select>
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
  );
}
