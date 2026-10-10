import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(protected)/tasks/actions", () => ({
  createTask: vi.fn(),
  editRecurringTask: vi.fn(),
  editStandaloneTask: vi.fn(),
}));

import TaskCreateForm from "@/app/(protected)/tasks/task-create-form";

const events = [
  {
    id: 21,
    name: "Current workshop",
    event_date: "2026-10-20",
    status: "scheduled",
    deleted_at: null,
  },
  {
    id: 22,
    name: "Historical meeting",
    event_date: "2026-09-20",
    status: "cancelled",
    deleted_at: null,
  },
];

it("offers optional multiple Event links and labels a historical linked Event", () => {
  const html = renderToStaticMarkup(
    <TaskCreateForm
      branches={[]}
      events={events}
      taskEventIds={[22]}
      recurrenceRequestKey="00000000-0000-4000-8000-000000000001"
    />,
  );

  expect(html).toContain('name="event_ids" multiple');
  expect(html).toContain("Current workshop — Oct 20, 2026");
  expect(html).toContain("Historical meeting — Sep 20, 2026 (Cancelled)");
  expect(html).toContain('value="22" selected=""');
  expect(html).toContain("as optional context");
  expect(html).toContain("Hold Command (Mac) or Control (Windows/Linux)");
});
