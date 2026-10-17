// @vitest-environment jsdom

import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/(protected)/tasks/actions", () => ({
  bulkAssignTaskOfficers: vi.fn(),
  removeTaskAssignment: vi.fn(),
  setTaskAssignmentCompletion: vi.fn(),
}));

import {
  BulkTaskOfficersForm,
  TaskCompletionControl,
} from "@/app/(protected)/tasks/task-officer-controls";
import {
  bulkAssignTaskOfficers,
  setTaskAssignmentCompletion,
} from "@/app/(protected)/tasks/actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

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

it("keeps completion state synchronized through successful saves and failures", async () => {
  let persisted = false;
  let submissions = 0;
  vi.mocked(setTaskAssignmentCompletion).mockImplementation(
    async (_previous, formData) => {
      submissions += 1;
      const requested = formData.get("completed") === "true";
      if (submissions === 4) {
        return {
          error: "Could not update task completion",
          success: "",
          values: { task_id: "17", officer_id: "3", completed: "false" },
        };
      }
      persisted = requested;
      return {
        error: "",
        success: requested ? "Marked completed" : "Marked not completed",
      };
    },
  );

  const render = (completed: boolean) =>
    root.render(
      createElement(TaskCompletionControl, {
        taskId: 17,
        officerId: 3,
        officerName: "Avery Chen",
        completed,
      }),
    );
  await act(async () => render(false));
  const checkbox = host.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  const form = host.querySelector<HTMLFormElement>("form");
  if (!checkbox || !form) throw new Error("Task completion form not found");
  const submit = async () => {
    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  expect(checkbox.checked).toBe(false);
  expect(host.textContent).toContain("Not completed");

  await act(async () => checkbox.click());
  expect(checkbox.checked).toBe(true);
  await submit();
  expect(persisted).toBe(true);
  expect(checkbox.checked).toBe(true);
  await act(async () => render(persisted));
  expect(host.textContent).toContain("Completed");
  expect(host.textContent).toContain("Marked completed");

  await act(async () => checkbox.click());
  expect(checkbox.checked).toBe(false);
  await submit();
  expect(persisted).toBe(false);
  expect(checkbox.checked).toBe(false);
  await act(async () => render(persisted));
  expect(host.textContent).toContain("Not completed");
  expect(host.textContent).toContain("Marked not completed");

  await act(async () => checkbox.click());
  await submit();
  expect(persisted).toBe(true);
  expect(checkbox.checked).toBe(true);
  await act(async () => render(persisted));
  expect(host.textContent).toContain("Marked completed");

  await act(async () => checkbox.click());
  expect(checkbox.checked).toBe(false);
  await submit();
  expect(persisted).toBe(true);
  expect(checkbox.checked).toBe(false);
  expect(new FormData(form).get("completed")).toBe("false");
  expect(host.textContent).toContain("Could not update task completion");
  expect(host.textContent).not.toContain("Marked not completed");
});

it("reports when there are no active Officers left to add", () => {
  const html = renderToStaticMarkup(
    <BulkTaskOfficersForm taskId={17} officers={[]} />,
  );

  expect(html).toContain("No active officers are available to add.");
  expect(html).toContain(
    'button type="button" class="button-secondary min-h-11" disabled=""',
  );
});

it("keeps success visible and moves focus to the Officers section after the last Officer is added", async () => {
  vi.mocked(bulkAssignTaskOfficers).mockResolvedValue({
    error: "",
    success: "1 officer added",
  });

  const render = (officers: { id: number; name: string }[]) =>
    root.render(
      createElement(
        "section",
        { "aria-label": "Officers", tabIndex: -1 },
        createElement(BulkTaskOfficersForm, { taskId: 17, officers }),
      ),
    );

  await act(async () => render([{ id: 3, name: "Avery Chen" }]));
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[type="button"]',
  );
  if (!trigger) throw new Error("Add officers button not found");

  await act(async () => trigger.click());
  const dialog = host.querySelector<HTMLDialogElement>("dialog");
  const checkbox = dialog?.querySelector<HTMLInputElement>(
    'input[name="officer_ids"]',
  );
  const form = dialog?.querySelector<HTMLFormElement>("form");
  if (!dialog || !checkbox || !form)
    throw new Error("Assignment dialog not found");
  expect(dialog.open).toBe(true);

  await act(async () => {
    checkbox.click();
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(dialog.open).toBe(false);

  await act(async () => render([]));
  expect(host.textContent).toContain("1 officer added");
  expect(host.textContent).toContain(
    "No active officers are available to add.",
  );
  expect(
    host.querySelector<HTMLButtonElement>('button[type="button"]')?.disabled,
  ).toBe(true);
  expect(document.activeElement).toBe(
    host.querySelector<HTMLElement>('[aria-label="Officers"]'),
  );
});

it.each([
  {
    failure: "validation",
    taskId: Number.NaN,
    state: {
      error: "Task not found",
      success: "",
      fieldErrors: { task_id: "Task not found" },
      values: { task_id: "NaN", officer_ids: ["3", "4"] },
    },
    message: "Task not found",
  },
  {
    failure: "persistence",
    taskId: 17,
    state: {
      error: "Could not update task assignments",
      success: "",
      values: { task_id: "17", officer_ids: ["3", "4"] },
    },
    message: "Could not update task assignments",
  },
])(
  "preserves selected Officers after $failure failure",
  async ({ state, taskId, message }) => {
    vi.mocked(bulkAssignTaskOfficers).mockResolvedValue(state);

    await act(async () =>
      root.render(
        createElement(BulkTaskOfficersForm, {
          taskId,
          officers: [
            { id: 3, name: "Avery Chen" },
            { id: 4, name: "Casey Nguyen" },
          ],
        }),
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[type="button"]',
    );
    if (!trigger) throw new Error("Add officers button not found");
    await act(async () => trigger.click());

    const dialog = host.querySelector<HTMLDialogElement>("dialog");
    const checkboxes = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[name="officer_ids"]'),
    );
    const form = host.querySelector<HTMLFormElement>("dialog form");
    if (!dialog || checkboxes.length !== 2 || !form)
      throw new Error("Assignment dialog controls not found");
    await act(async () => {
      checkboxes.forEach((checkbox) => checkbox.click());
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(dialog.open).toBe(true);
    expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([
      true,
      true,
    ]);
    expect(host.textContent).toContain(message);
  },
);
