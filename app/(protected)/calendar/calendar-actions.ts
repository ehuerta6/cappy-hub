"use server";

import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { mapEventOccurrences, mapTaskOccurrences } from "./calendar-events";
import { fetchCalendarRecordsForRange } from "./calendar-query";
import { parseCalendarRange } from "./calendar-range";

export async function fetchCalendarRange(startValue: string, endValue: string) {
  await getAuthorizationContext();
  const range = parseCalendarRange(startValue, endValue);
  const supabase = await createClient();
  const [events, tasks] = await fetchCalendarRecordsForRange(supabase, range);
  return [...mapEventOccurrences(events), ...mapTaskOccurrences(tasks)];
}
