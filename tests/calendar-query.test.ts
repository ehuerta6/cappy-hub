import { describe, expect, it } from "vitest";
import {
  CALENDAR_QUERY_PAGE_SIZE,
  fetchAllCalendarPages,
  fetchCalendarRecordsForRange,
} from "@/app/(protected)/calendar/calendar-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

describe("calendar query pagination", () => {
  it.each([
    ["empty results", 0],
    ["fewer than one page", 17],
    ["exactly one full page", CALENDAR_QUERY_PAGE_SIZE],
    ["more than one page", CALENDAR_QUERY_PAGE_SIZE + 3],
    ["more than 1,000 records", 1_037],
  ])("loads %s completely", async (_label, size) => {
    const source = Array.from({ length: Number(size) }, (_, id) => ({ id }));
    const ranges: Array<[number, number]> = [];

    const rows = await fetchAllCalendarPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null };
    });

    expect(rows).toEqual(source);
    expect(new Set(rows.map(({ id }) => id)).size).toBe(source.length);
    expect(ranges.at(-1)?.[0]).toBe(
      source.length === 0
        ? 0
        : Math.floor(source.length / CALENDAR_QUERY_PAGE_SIZE) *
            CALENDAR_QUERY_PAGE_SIZE,
    );
  });

  it("continues across page boundaries when timestamps are identical", async () => {
    const source = Array.from({ length: 1_003 }, (_, id) => ({
      id: id + 1,
      starts_at: "2026-10-08T23:00:00Z",
    }));

    const rows = await fetchAllCalendarPages(async (from, to) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));

    expect(rows.map(({ id }) => id)).toEqual(source.map(({ id }) => id));
    expect(new Set(rows.map(({ id }) => id)).size).toBe(source.length);
  });

  it("surfaces query errors and missing page data", async () => {
    await expect(
      fetchAllCalendarPages(async () => ({
        data: null,
        error: new Error("request failed"),
      })),
    ).rejects.toThrow("Failed to load calendar entries");

    await expect(
      fetchAllCalendarPages(async () => ({ data: null, error: null })),
    ).rejects.toThrow("Failed to load calendar entries");
  });

  it("queries the visible interval with overlap semantics and complete pagination", async () => {
    const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
    const fixture = {
      events: Array.from({ length: 503 }, (_, id) => ({ id })),
      tasks: Array.from({ length: 2 }, (_, id) => ({ id })),
    };
    const client = {
      from(table: "events" | "tasks") {
        const builder = {
          select: (...args: unknown[]) => record("select", ...args),
          is: (...args: unknown[]) => record("is", ...args),
          neq: (...args: unknown[]) => record("neq", ...args),
          lt: (...args: unknown[]) => record("lt", ...args),
          gt: (...args: unknown[]) => record("gt", ...args),
          gte: (...args: unknown[]) => record("gte", ...args),
          order: (...args: unknown[]) => record("order", ...args),
          range: async (from: number, to: number) => {
            calls.push({ table, method: "range", args: [from, to] });
            const rows = fixture[table].slice(from, to + 1);
            return { data: rows, error: null };
          },
        };
        function record(method: string, ...args: unknown[]) {
          calls.push({ table, method, args });
          return builder;
        }
        return builder;
      },
    } as unknown as SupabaseClient<Database>;

    const [events, tasks] = await fetchCalendarRecordsForRange(client, {
      start: "2026-03-01T07:00:00.000Z",
      end: "2026-04-05T06:00:00.000Z",
      startDate: "2026-03-01",
      endDate: "2026-04-05",
    });

    expect(events).toHaveLength(503);
    expect(tasks).toHaveLength(2);
    expect(calls).toContainEqual({
      table: "events",
      method: "lt",
      args: ["starts_at", "2026-04-05T06:00:00.000Z"],
    });
    expect(calls).toContainEqual({
      table: "events",
      method: "gt",
      args: ["ends_at", "2026-03-01T07:00:00.000Z"],
    });
    expect(calls).toContainEqual({
      table: "tasks",
      method: "gte",
      args: ["due_date", "2026-03-01"],
    });
    expect(calls).toContainEqual({
      table: "tasks",
      method: "lt",
      args: ["due_date", "2026-04-05"],
    });
    expect(
      calls.filter(
        (call) => call.table === "events" && call.method === "range",
      ),
    ).toEqual([
      { table: "events", method: "range", args: [0, 499] },
      { table: "events", method: "range", args: [500, 999] },
    ]);
  });
});
