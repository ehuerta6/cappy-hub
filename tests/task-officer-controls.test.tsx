import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/(protected)/tasks/actions", () => ({
  bulkAssignTaskOfficers: vi.fn(),
  removeTaskAssignment: vi.fn(),
  setTaskAssignmentCompletion: vi.fn(),
}));

import {
  BulkTaskOfficersForm,
  TaskCompletionControl,
} from "@/app/(protected)/tasks/task-officer-controls";

it("keeps the bulk Officer checklist behind an on-demand dialog", () => {
  const html = renderToStaticMarkup(
    <BulkTaskOfficersForm
      taskId={17}
      officers={[
        { id: 3, name: "Avery Chen" },
        { id: 4, name: "Casey Nguyen" },
      ]}
    />,
  );

  expect(html).toContain(">Add officers</button>");
  expect(html).toContain('<dialog aria-labelledby="task-officers-title"');
  expect(html).toContain("Add officers to this task");
  expect(html).toContain("Choose one or more active officers");
  expect(html).toContain('name="task_id" value="17"');
  expect(html).toContain('name="officer_ids" value="3"');
  expect(html).toContain('name="officer_ids" value="4"');
  expect(html).not.toContain("<dialog open");
  expect(html).toContain(">Cancel</button>");
  expect(html).toContain(">Add selected officers</button>");
});

it("does not show a completion Save action until the state is changed", () => {
  const html = renderToStaticMarkup(
    <TaskCompletionControl
      taskId={17}
      officerId={3}
      officerName="Avery Chen"
      completed={false}
    />,
  );

  expect(html).toContain('aria-label="Completed for Avery Chen"');
  expect(html).toContain('name="completed" value="false"');
  expect(html).not.toContain(">Save</button>");
});

it("reports when there are no active Officers left to add", () => {
  const html = renderToStaticMarkup(
    <BulkTaskOfficersForm taskId={17} officers={[]} />,
  );

  expect(html).toContain("All active officers are assigned.");
  expect(html).not.toContain("Add officers</button>");
});
