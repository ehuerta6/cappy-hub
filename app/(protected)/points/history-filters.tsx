import { ListFilterBar } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { formatEventFilterOption } from "@/lib/presentation";

type PointHistoryFilterControlsProps = {
  officers: { id: number; name: string }[];
  events: { id: number; name: string; event_date: string }[];
  isAdmin: boolean;
  status: string;
  fromDate: string;
  toDate: string;
  searchQuery: string;
  awardType?: string;
  officerId?: number;
  eventId?: number;
  dateRangeIsReversed: boolean;
};

export default function PointHistoryFilterControls({
  officers,
  events,
  isAdmin,
  status,
  fromDate,
  toDate,
  searchQuery,
  awardType,
  officerId,
  eventId,
  dateRangeIsReversed,
}: PointHistoryFilterControlsProps) {
  const officerOptions = officers.map((officer) => ({
    id: String(officer.id),
    label: officer.name,
  }));
  if (
    officerId !== undefined &&
    !officerOptions.some((option) => option.id === String(officerId))
  )
    officerOptions.push({
      id: String(officerId),
      label: `Officer #${officerId} (name unavailable)`,
    });

  const eventOptions = events.map((event) => ({
    id: String(event.id),
    label: formatEventFilterOption(event.name, event.event_date),
  }));
  if (
    eventId !== undefined &&
    !eventOptions.some((option) => option.id === String(eventId))
  )
    eventOptions.push({
      id: String(eventId),
      label: `Event #${eventId} (name unavailable)`,
    });

  const active = Boolean(
    searchQuery ||
    awardType ||
    officerId !== undefined ||
    eventId !== undefined ||
    fromDate ||
    toDate ||
    (isAdmin && status !== "active"),
  );

  return (
    <ListFilterBar
      key={JSON.stringify([
        searchQuery,
        awardType,
        officerId,
        eventId,
        status,
        fromDate,
        toDate,
      ])}
      action="/points"
      label="Point history filters"
      active={active}
      clearHref="/points"
    >
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
      <div className="min-w-40 flex-1">
        <SearchableSelect
          name="officer"
          label="Officer"
          options={officerOptions}
          initialValue={officerId === undefined ? "" : String(officerId)}
          placeholder="All officers"
        />
      </div>
      <div className="min-w-48 flex-1">
        <SearchableSelect
          name="event"
          label="Event"
          options={eventOptions}
          initialValue={eventId === undefined ? "" : String(eventId)}
          placeholder="All events"
        />
      </div>
      {isAdmin && (
        <label className="min-w-32">
          Status
          <select name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
        </label>
      )}
      <label className="min-w-40">
        From activity date
        <input
          name="from"
          type="date"
          defaultValue={fromDate}
          aria-invalid={dateRangeIsReversed || undefined}
          aria-describedby={
            dateRangeIsReversed ? "point-history-date-error" : undefined
          }
        />
      </label>
      <label className="min-w-40">
        To activity date
        <input
          name="to"
          type="date"
          defaultValue={toDate}
          aria-invalid={dateRangeIsReversed || undefined}
          aria-describedby={
            dateRangeIsReversed ? "point-history-date-error" : undefined
          }
        />
      </label>
    </ListFilterBar>
  );
}
