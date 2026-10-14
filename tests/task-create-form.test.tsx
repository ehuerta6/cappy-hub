import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Tables } from "@/lib/database.types";

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

it("offers searchable Event links and retains a historical linked Event", () => {
  const html = renderToStaticMarkup(
    <TaskCreateForm
      branches={[]}
      events={events}
      taskEventIds={[22]}
      recurrenceRequestKey="00000000-0000-4000-8000-000000000001"
    />,
  );

  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-label="Linked Events"');
  expect(html).not.toContain('name="event_ids" multiple');
  expect(html).toContain("Historical meeting — Sep 20, 2026 (Cancelled)");
  expect(html).toContain('type="hidden" name="event_ids" value="22"');
  expect(html).toContain("Optional context:");
  expect(html).toContain("Search and select Events");
});

it("keeps the task title compact and describes recurrence as optional", () => {
  const html = renderToStaticMarkup(
    <TaskCreateForm
      branches={[]}
      recurrenceRequestKey="00000000-0000-4000-8000-000000000001"
    />,
  );

  expect(html).toContain('class="task-form grid max-w-6xl grid-cols-2');
  expect(html).toContain('class="task-form-title self-start block text-sm');
  expect(html).toContain('class="h-10 text-base font-medium"');
  expect(html).toContain('class="task-recurrence-fields"');
  expect(html).toContain("Optional recurrence");
  expect(html).not.toContain("<legend>Repeat</legend>");
  expect(html).toContain('name="recurrence_frequency"');
  expect(html).toContain("Does not repeat");
  expect(html).not.toContain('aria-label="Schedule preview"');
  expect(html.match(/required=""/g)).toHaveLength(6);
  for (const field of [
    "title",
    "description",
    "task_type",
    "branch_id",
    "due_date",
    "points",
  ]) {
    expect(html).toContain(`name="${field}"`);
  }
});

it("submits an empty event_ids selection without adding a placeholder value", () => {
  const html = renderToStaticMarkup(
    <TaskCreateForm
      branches={[]}
      events={events}
      recurrenceRequestKey="00000000-0000-4000-8000-000000000001"
    />,
  );

  expect(html).toContain('aria-label="Linked Events"');
  expect(html).not.toContain('name="event_ids" type="hidden"');
});

it("prefills an existing historical Event link when editing a Task", () => {
  const task: Tables<"tasks"> = {
    id: -8,
    title: "Existing task",
    description: "Task description",
    task_type: "Flyer",
    branch_id: -1,
    due_date: "2026-10-20",
    points: 1,
    approval_required: false,
    created_by: -2,
    created_at: "2026-10-01T00:00:00Z",
    recurrence_key: null,
    recurrence_series_id: null,
    removed_at: null,
    removed_by: null,
  };
  const html = renderToStaticMarkup(
    <TaskCreateForm
      task={task}
      taskEventIds={[22]}
      branches={[]}
      events={events}
      recurrenceRequestKey="00000000-0000-4000-8000-000000000001"
    />,
  );

  expect(html).toContain("Historical meeting — Sep 20, 2026 (Cancelled)");
  expect(html).toContain('type="hidden" name="event_ids" value="22"');
});
