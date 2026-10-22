import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const CALENDAR_QUERY_PAGE_SIZE = 500;

type CalendarPage<T> = {
  data: T[] | null;
  error: unknown;
};

/** Fetches every row from a query factory using bounded, contiguous ranges. */
export async function fetchAllCalendarPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<CalendarPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += CALENDAR_QUERY_PAGE_SIZE) {
    const { data, error } = await fetchPage(
      from,
      from + CALENDAR_QUERY_PAGE_SIZE - 1,
    );

    if (error || data === null)
      throw new Error("Failed to load calendar entries");

    rows.push(...data);
    if (data.length < CALENDAR_QUERY_PAGE_SIZE) return rows;
  }
}

export function fetchCalendarRecords(supabase: SupabaseClient<Database>) {
  return Promise.all([
    fetchAllCalendarPages((from, to) =>
      supabase
        .from("events")
        .select("id,name,starts_at,ends_at")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("starts_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllCalendarPages((from, to) =>
      supabase
        .from("tasks")
        .select("id,title,due_date")
        .is("removed_at", null)
        .order("due_date")
        .order("id")
        .range(from, to),
    ),
  ]);
}

export function fetchCalendarRecordsForRange(
  supabase: SupabaseClient<Database>,
  range: { start: string; end: string; startDate: string; endDate: string },
) {
  return Promise.all([
    fetchAllCalendarPages((from, to) =>
      supabase
        .from("events")
        .select("id,name,starts_at,ends_at")
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .lt("starts_at", range.end)
        .gt("ends_at", range.start)
        .order("starts_at")
        .order("id")
        .range(from, to),
    ),
    fetchAllCalendarPages((from, to) =>
      supabase
        .from("tasks")
        .select("id,title,due_date")
        .is("removed_at", null)
        .gte("due_date", range.startDate)
        .lt("due_date", range.endDate)
        .order("due_date")
        .order("id")
        .range(from, to),
    ),
  ]);
}
