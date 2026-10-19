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
  event_officers: { officer_id: number }[];
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

// Counts real slots, so a fourth or later slot counts and repeated difficulty
// does not merge slots. Mirrors private.presenter_slots_open for closed Events.
export function openPresenterSlotCount(
  event: Pick<
    Tables<"events">,
    | "status"
    | "deleted_at"
    | "starts_at"
    | "participation_points_per_hour_at_end"
  > & {
    event_types: { name: string } | null;
    presentation_slots?: { officer_id: number | null }[];
  },
  now = Date.now(),
) {
  if (event.event_types?.name.trim().toLowerCase() !== "session") return 0;
  if (
    event.deleted_at ||
    event.status === "cancelled" ||
    event.participation_points_per_hour_at_end !== null ||
    now >= new Date(event.starts_at).getTime()
  )
    return 0;
  return (event.presentation_slots ?? []).filter(
    ({ officer_id }) => officer_id === null,
  ).length;
}

export function openPresenterSlotLabel(count: number) {
  return `${count} presenter ${count === 1 ? "slot" : "slots"} open`;
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
      ({ officer_id }) => officer_id === officerId,
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
