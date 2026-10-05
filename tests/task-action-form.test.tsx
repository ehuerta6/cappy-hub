import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/app/(protected)/tasks/actions", () => ({
  selfAssignTask: vi.fn(),
}));
import TaskSelfAssignForm from "@/app/(protected)/tasks/task-action-form";

it("renders the compact Assign to me row action", () => {
  const html = renderToStaticMarkup(<TaskSelfAssignForm taskId={17} />);

  expect(html).toContain('name="task_id" value="17"');
  expect(html).toContain('aria-label="Assign this task to me"');
  expect(html).toContain('class="whitespace-nowrap px-3 py-1.5"');
  expect(html).toContain(">Assign to me</button>");
  expect(html).not.toContain("Self-assign");
});
