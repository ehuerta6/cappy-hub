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

export function eventSignupOpen(
  event: Parameters<typeof eventStatus>[0] &
    Pick<Tables<"events">, "participation_points_per_hour_at_end">,
  now = Date.now(),
) {
  const status = eventStatus(event, now);
  return (
    event.participation_points_per_hour_at_end === null &&
    (status === "upcoming" || status === "happening")
  );
}
