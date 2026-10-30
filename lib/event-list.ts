import type { Tables } from "./database.types";
import { currentDenverWeek } from "./current-denver-week";

export type EventListStatus =
  "upcoming" | "happening" | "past" | "cancelled" | "archived" | undefined;

export type EventListItem = Pick<
  Tables<"events">,
  | "id"
  | "name"
  | "event_date"
  | "starts_at"
  | "ends_at"
  | "status"
  | "deleted_at"
  | "participation_points_per_hour_at_end"
  | "max_volunteers"
> & {
  event_types: { name: string };
  event_branches: { branches: { name: string } }[];
  event_officers: { officer_id: number; removed_at?: string | null }[];
  confirmed_count?: number;
};

export function eventSignupCountLabel(event: {
  max_volunteers: number | null;
  confirmed_count?: number;
}) {
  const confirmedCount = event.confirmed_count ?? 0;
  return event.max_volunteers == null
    ? `${confirmedCount} ${confirmedCount === 1 ? "officer" : "officers"}`
    : `${confirmedCount} / ${event.max_volunteers} confirmed`;
}

export function organizeEventList(
  events: EventListItem[],
  status: EventListStatus,
  now: Date,
) {
  const nowMs = now.getTime();
  const { today, sunday } = currentDenverWeek(now);
  const visible = events.filter((event) => {
    if (status === "archived") return event.deleted_at !== null;
    if (event.deleted_at) return false;
    if (status === "cancelled") return event.status === "cancelled";
    if (event.status === "cancelled") return false;

    const startsAt = new Date(event.starts_at).getTime();
    const endsAt = new Date(event.ends_at).getTime();
    if (status === "past") return endsAt <= nowMs;
    if (status === "happening") return startsAt <= nowMs && endsAt > nowMs;
    if (status === "upcoming") return startsAt > nowMs;

    return endsAt > nowMs && event.event_date >= today;
  });

  const sort = (left: EventListItem, right: EventListItem) => {
    if (status === "past")
      return right.ends_at.localeCompare(left.ends_at) || right.id - left.id;
    if (status === "cancelled" || status === "archived") {
      return (
        right.event_date.localeCompare(left.event_date) ||
        right.starts_at.localeCompare(left.starts_at) ||
        right.id - left.id
      );
    }
    return left.starts_at.localeCompare(right.starts_at) || left.id - right.id;
  };
  visible.sort(sort);

  if (status) return { view: "single" as const, events: visible };

  return {
    view: "current" as const,
    thisWeek: visible.filter((event) => event.event_date <= sunday),
    upcoming: visible.filter((event) => event.event_date > sunday),
  };
}

// Group only adjacent page rows: moving all personal Events ahead of other
// Events would change the schedule order used by server pagination.
export function groupEventPage(
  events: EventListItem[],
  status: EventListStatus,
  officerId: number,
  now: Date,
) {
  const { sunday } = currentDenverWeek(now);
  const groups: { label: string; events: EventListItem[] }[] = [];
  for (const event of events) {
    const yourEvent = event.event_officers.some(
      ({ officer_id, removed_at }) =>
        officer_id === officerId && removed_at == null,
    );
    const period =
      status === undefined
        ? event.event_date <= sunday
          ? "This week's events · "
          : "Upcoming events · "
        : "";
    const label = `${period}${yourEvent ? "Your events" : "Other events"}`;
    const last = groups.at(-1);
    if (last?.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}
