import { expect, it } from "vitest";
import { listPageUrl } from "@/lib/list-url";
import {
  formatCalendarDate,
  formatEventFilterOption,
} from "@/lib/presentation";

it("preserves all filters in pagination URLs and removes page at reset", () => {
  const filters = new URLSearchParams(
    "q=Emi&type=participation&officer=-1013&event=-2001&status=all&from=2026-09-01&to=2026-10-01&page=3",
  );
  const next = new URL(listPageUrl("/points", filters, 4), "http://localhost");
  expect(next.searchParams.get("page")).toBe("4");
  for (const [key, value] of filters) {
    if (key !== "page") expect(next.searchParams.get(key)).toBe(value);
  }
  expect(listPageUrl("/points", filters, 1)).not.toContain("page=");
  expect(filters.get("page")).toBe("3");
});

it("formats canonical calendar dates without shifting the date", () => {
  expect(formatCalendarDate("2026-10-08")).toBe("Oct 8, 2026");
  expect(formatEventFilterOption("Intro Arrays Workshop", "2026-10-08")).toBe(
    "Intro Arrays Workshop — Oct 8, 2026",
  );
});
