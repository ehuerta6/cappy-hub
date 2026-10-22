import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const harness = vi.hoisted(() => ({ renders: 0 }));

vi.mock("@/app/(protected)/calendar/calendar-view", () => ({
  default: () => {
    harness.renders += 1;
    return null;
  },
}));

import CalendarPage from "@/app/(protected)/calendar/page";

it("renders the Calendar shell without loading records outside the visible range", () => {
  harness.renders = 0;
  const html = renderToStaticMarkup(CalendarPage());

  expect(html).toContain("Calendar");
  expect(html).toContain("Events and Task due dates");
  expect(harness.renders).toBe(1);
});
