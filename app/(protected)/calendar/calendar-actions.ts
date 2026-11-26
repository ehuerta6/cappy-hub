"use server";

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mapEventOccurrences, mapTaskOccurrences } from "./calendar-events";
import {
  fetchCalendarRecordsForRange,
  type CalendarScopeFilter,
} from "./calendar-query";
import { parseCalendarRange } from "./calendar-range";

export async function fetchCalendarRange(
  startValue: string,
  endValue: string,
  periodId?: number | null,
  scope?: "all" | "mine" | "branch",
) {
  const actor = await getAuthorizationContext();
  const range = parseCalendarRange(startValue, endValue);
  const supabase = await createClient();
  let period: { from: string; through: string } | undefined;
  if (periodId != null) {
    const { data, error } = await supabase
      .from("academic_periods")
      .select("starts_on,ends_on")
      .eq("id", periodId)
      .maybeSingle();
    if (error) throw new Error("Failed to load selected period");
    if (data) period = { from: data.starts_on, through: data.ends_on };
  }
  const scopeFilter: CalendarScopeFilter | undefined =
    scope === "mine"
      ? { officerId: actor.id }
      : scope === "branch" && actor.branchIds.length > 0
        ? { branchIds: actor.branchIds }
        : undefined;
  const [events, tasks] = await fetchCalendarRecordsForRange(
    supabase,
    range,
    period,
    scopeFilter,
  );
  return [...mapEventOccurrences(events), ...mapTaskOccurrences(tasks)];
}
