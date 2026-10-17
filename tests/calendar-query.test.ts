import { describe, expect, it } from "vitest";
import {
  CALENDAR_QUERY_PAGE_SIZE,
  fetchAllCalendarPages,
} from "@/app/(protected)/calendar/calendar-query";

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
});
