import { expect, it } from "vitest";
import { pointHistoryUrl } from "@/app/(protected)/points/history-url";
import {
  formatCalendarDate,
  formatEventFilterOption,
} from "@/lib/presentation";

it("preserves Point History filters in URLs and resets page after filter changes", () => {
  const currentFilters =
    "q=Emi&type=participation&officer=-1013&event=-2001&status=removed&from=2026-09-01&to=2026-10-01&page=8";
  const updatedFilters = pointHistoryUrl("/points", currentFilters, {
    type: "manual",
  });
  expect(updatedFilters).toContain("q=Emi");
  expect(updatedFilters).toContain("type=manual");
  expect(updatedFilters).toContain("officer=-1013");
  expect(updatedFilters).toContain("event=-2001");
  expect(updatedFilters).toContain("status=removed");
  expect(updatedFilters).toContain("from=2026-09-01");
  expect(updatedFilters).toContain("to=2026-10-01");
  expect(updatedFilters).toContain("page=1");
  expect(updatedFilters).not.toContain("page=8");
});

it("preserves all active Point History filters when changing pages", () => {
  const nextPageUrl = pointHistoryUrl(
    "/points",
    "q=Emi&type=participation&officer=-1013&event=-2001&status=all&from=2026-09-01&to=2026-10-01&page=3",
    {},
    4,
  );
  expect(nextPageUrl).toContain("q=Emi");
  expect(nextPageUrl).toContain("type=participation");
  expect(nextPageUrl).toContain("officer=-1013");
  expect(nextPageUrl).toContain("event=-2001");
  expect(nextPageUrl).toContain("status=all");
  expect(nextPageUrl).toContain("from=2026-09-01");
  expect(nextPageUrl).toContain("to=2026-10-01");
  expect(nextPageUrl).toContain("page=4");
});

it("formats canonical calendar dates without shifting the date", () => {
  expect(formatCalendarDate("2026-10-08")).toBe("Oct 8, 2026");
  expect(formatEventFilterOption("Intro Arrays Workshop", "2026-10-08")).toBe(
    "Intro Arrays Workshop — Oct 8, 2026",
  );
});
