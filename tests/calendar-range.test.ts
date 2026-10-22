import { describe, expect, it } from "vitest";
import { parseCalendarRange } from "@/app/(protected)/calendar/calendar-range";

describe("Calendar visible range", () => {
  it("keeps instant bounds and derives Denver task dates across spring DST", () => {
    expect(
      parseCalendarRange(
        "2026-03-01T07:00:00.000Z",
        "2026-04-05T06:00:00.000Z",
      ),
    ).toEqual({
      start: "2026-03-01T07:00:00.000Z",
      end: "2026-04-05T06:00:00.000Z",
      startDate: "2026-03-01",
      endDate: "2026-04-05",
    });
  });

  it("rejects reversed, noncanonical, and unbounded ranges", () => {
    expect(() =>
      parseCalendarRange(
        "2026-04-01T00:00:00.000Z",
        "2026-03-01T00:00:00.000Z",
      ),
    ).toThrow("Invalid Calendar range");
    expect(() => parseCalendarRange("2026-03-01", "2026-04-01")).toThrow(
      "Invalid Calendar range",
    );
    expect(() =>
      parseCalendarRange(
        "2026-01-01T00:00:00.000Z",
        "2026-04-01T00:00:00.000Z",
      ),
    ).toThrow("Invalid Calendar range");
  });
});
