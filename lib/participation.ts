import { supabase } from "./supabase";
// Prototype configuration: changing the rate affects only awards not yet recorded.
export const participationPointsPerHour = Number(
  process.env.PARTICIPATION_POINTS_PER_HOUR ?? 1,
);
export async function processCompletedEvents() {
  if (
    !Number.isFinite(participationPointsPerHour) ||
    participationPointsPerHour <= 0
  )
    throw new Error(
      "PARTICIPATION_POINTS_PER_HOUR must be positive and finite",
    );
  const { error } = await supabase.rpc("process_completed_events", {
    p_points_per_hour: participationPointsPerHour,
  });
  if (error)
    throw new Error(`Failed to process participation points: ${error.message}`);
}
export function displayPoints(points: number) {
  const value = points.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return points > 0 ? `+${value}` : value;
}
