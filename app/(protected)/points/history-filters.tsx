import { ListFilterBar } from "@/components/ui";
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
}: PointHistoryFilterControlsProps) {
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
      <label className="w-full min-w-0 sm:w-auto sm:min-w-56 sm:flex-1">
        Search point history
        <input
          type="search"
          name="q"
          defaultValue={searchQuery}
          maxLength={100}
          placeholder="Officer, reason, event, or task"
        />
      </label>
      <label className="w-full min-w-0 sm:w-auto sm:min-w-36">
        Award type
        <select name="type" defaultValue={awardType ?? ""}>
          <option value="">All types</option>
          <option value="participation">Participation</option>
          <option value="task">Task</option>
          <option value="manual">Manual</option>
          <option value="correction">Correction</option>
        </select>
      </label>
      <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
        Officer
        <select name="officer" defaultValue={officerId ?? ""}>
          <option value="">All officers</option>
          {officers.map((officer) => (
            <option key={officer.id} value={officer.id}>
              {officer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="w-full min-w-0 sm:w-auto sm:min-w-48 sm:flex-1">
        Event
        <select name="event" defaultValue={eventId ?? ""}>
          <option value="">All events</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {formatEventFilterOption(event.name, event.event_date)}
            </option>
          ))}
        </select>
      </label>
      {isAdmin && (
        <label className="w-full min-w-0 sm:w-auto sm:min-w-32">
          Status
          <select name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="removed">Removed</option>
            <option value="all">All</option>
          </select>
        </label>
      )}
      <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
        From activity date
        <input name="from" type="date" defaultValue={fromDate} />
      </label>
      <label className="w-full min-w-0 sm:w-auto sm:min-w-40">
        To activity date
        <input name="to" type="date" defaultValue={toDate} />
      </label>
    </ListFilterBar>
  );
}
