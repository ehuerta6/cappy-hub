import type { Tables } from "./database.types";
import { formatDate, formatDateTime } from "./presentation";
export function participationLabel(participating: boolean, untimed: boolean) {
  if (untimed) return participating ? "Assigned" : "Not assigned";
  return participating ? "Signed up" : "Not signed up";
}
export function eventStatus(
  event: Pick<
    Tables<"events">,
    "status" | "starts_at" | "ends_at" | "event_date" | "deleted_at"
  >,
  now = Date.now(),
) {
  if (event.deleted_at) return "removed";
  if (event.status === "cancelled") return "cancelled";
  if (event.starts_at === null || event.ends_at === null) {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now));
    return event.event_date < today ? "past" : "upcoming";
  }
  if (now >= new Date(event.ends_at).getTime()) return "past";
  if (now >= new Date(event.starts_at).getTime()) return "happening";
  return "upcoming";
}
export function displayDate(value: string) {
  return formatDate(value);
}

export function displayDateTime(value: string) {
  return formatDateTime(value);
}
