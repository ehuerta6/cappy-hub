import type { Tables } from "./database.types";
import { formatDate, formatDateTime } from "./presentation";
export function eventStatus(
  event: Pick<Tables<"events">, "status" | "starts_at" | "ends_at">,
  now = Date.now(),
) {
  if (event.status === "cancelled") return "cancelled";
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
