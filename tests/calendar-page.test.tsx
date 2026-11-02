import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const harness = vi.hoisted(() => ({ renders: 0 }));

vi.mock("@/lib/academic-periods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-periods")>()),
  getAcademicPeriodData: async () => ({
    periods: [],
    currentDate: "2026-11-01",
    currentPeriodId: null,
  }),
}));

vi.mock("@/app/(protected)/calendar/calendar-view", () => ({
  default: () => {
    harness.renders += 1;
    return null;
  },
}));

import CalendarPage from "@/app/(protected)/calendar/page";

it("renders the Calendar shell without loading records outside the visible range", async () => {
  harness.renders = 0;
  const html = renderToStaticMarkup(await CalendarPage({}));

  expect(html).toContain("Calendar");
  expect(html).toContain("Events and Task due dates");
  expect(harness.renders).toBe(1);
});
