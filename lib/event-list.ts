import { Temporal } from "temporal-polyfill";
import type { Tables } from "./database.types";
import { denverParts } from "./event-time";

export type EventListStatus =
  "upcoming" | "happening" | "past" | "cancelled" | undefined;

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
> & {
  event_types: { name: string };
  event_branches: { branches: { name: string } }[];
  event_officers: { officer_id: number }[];
};

export function currentEventWeek(now: Date) {
  const today = Temporal.PlainDate.from(denverParts(now).date);
  return {
    today: today.toString(),
    sunday: today.add({ days: 7 - today.dayOfWeek }).toString(),
  };
}

export function organizeEventList(
  events: EventListItem[],
  status: EventListStatus,
  now: Date,
) {
  const nowMs = now.getTime();
  const { today, sunday } = currentEventWeek(now);
  const visible = events.filter((event) => {
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
    if (status === "past") return right.ends_at.localeCompare(left.ends_at);
    if (status === "cancelled") {
      return (
        right.event_date.localeCompare(left.event_date) ||
        right.starts_at.localeCompare(left.starts_at)
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
