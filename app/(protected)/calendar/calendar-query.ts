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
        .is("no_longer_needed_at", null)
        .order("due_date")
        .order("id")
        .range(from, to),
    ),
  ]);
}

export type CalendarScopeFilter = {
  officerId?: number;
  branchIds?: number[];
};

export function fetchCalendarRecordsForRange(
  supabase: SupabaseClient<Database>,
  range: { start: string; end: string; startDate: string; endDate: string },
  period?: { from: string; through: string },
  scopeFilter?: CalendarScopeFilter,
) {
  const filterByOfficer = scopeFilter?.officerId !== undefined;
  const filterByBranches =
    !filterByOfficer &&
    scopeFilter?.branchIds !== undefined &&
    scopeFilter.branchIds.length > 0;
  return Promise.all([
    fetchAllCalendarPages((from, to) => {
      const select = filterByOfficer
        ? "id,name,starts_at,ends_at,my_signup:event_officers!inner(officer_id,removed_at)"
        : filterByBranches
          ? "id,name,starts_at,ends_at,scope_branch:event_branches!inner(branch_id)"
          : "id,name,starts_at,ends_at";
      let query = supabase
        .from("events")
        .select(select)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .lt("starts_at", range.end)
        .gt("ends_at", range.start)
        .order("starts_at")
        .order("id");
      if (filterByOfficer) {
        query = query
          .eq("my_signup.officer_id", scopeFilter.officerId!)
          .is("my_signup.removed_at", null);
      } else if (filterByBranches) {
        query = query.in("scope_branch.branch_id", scopeFilter.branchIds!);
      }
      if (period)
        query = query
          .gte("event_date", period.from)
          .lte("event_date", period.through);
      return query.range(from, to) as PromiseLike<
        CalendarPage<{
          id: number;
          name: string;
          starts_at: string;
          ends_at: string;
        }>
      >;
    }),
    fetchAllCalendarPages((from, to) => {
      const select = filterByOfficer
        ? "id,title,due_date,my_assignment:task_officer_assignments!inner(officer_id,removed_at)"
        : "id,title,due_date";
      let query = supabase
        .from("tasks")
        .select(select)
        .is("removed_at", null)
        .is("no_longer_needed_at", null)
        .lt("due_date", range.endDate)
        .order("due_date")
        .order("id");
      if (filterByOfficer) {
        query = query
          .eq("my_assignment.officer_id", scopeFilter.officerId!)
          .is("my_assignment.removed_at", null);
      } else if (filterByBranches) {
        query = query.in("branch_id", scopeFilter.branchIds!);
      }
      query = period
        ? query.gte("due_date", period.from).lte("due_date", period.through)
        : query.gte("due_date", range.startDate);
      return query.range(from, to) as PromiseLike<
        CalendarPage<{ id: number; title: string; due_date: string }>
      >;
    }),
  ]);
}
