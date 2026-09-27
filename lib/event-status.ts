import type { Tables } from "./database.types";
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
  return new Date(value).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC";
}
