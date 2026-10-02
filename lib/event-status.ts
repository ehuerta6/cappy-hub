import type { Tables } from "./database.types";
export function participationLabel(participating: boolean) {
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
  if (now >= new Date(event.ends_at).getTime()) return "past";
  if (now >= new Date(event.starts_at).getTime()) return "happening";
  return "upcoming";
}
