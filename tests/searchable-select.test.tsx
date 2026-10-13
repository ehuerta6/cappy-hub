// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SearchableSelect } from "@/components/searchable-select";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const officers = [
  { id: "3", label: "Avery Officer" },
  { id: "7", label: "Jordan " + "Very Long ".repeat(12) + "Officer" },
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

async function renderSelect(
  props: Partial<Parameters<typeof SearchableSelect>[0]> = {},
) {
  await act(async () => {
    root.render(
      <form>
        <SearchableSelect
          name="officer_id"
          label="Officer"
          options={officers}
          required
          {...props}
        />
      </form>,
    );
  });
  return {
    form: host.querySelector("form")!,
    input: host.querySelector<HTMLInputElement>('[role="combobox"]')!,
    hidden: host.querySelector<HTMLInputElement>('input[name="officer_id"]')!,
  };
}

function changeInput(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: value,
        inputType: "insertText",
      }),
    );
  });
}

function press(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

it("starts empty, filters names, selects one stable ID by keyboard, and retains it while searching", async () => {
  const { form, input, hidden } = await renderSelect();
  expect(input.getAttribute("aria-required")).toBe("true");
  expect(new FormData(form).getAll("officer_id")).toEqual([""]);

  act(() => {
    input.focus();
    input.click();
  });
  changeInput(input, "Jordan");
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  expect(document.querySelector('[role="option"]')?.textContent).toContain(
    "Jordan",
  );
  press(input, "ArrowDown");
  press(input, "Enter");
  expect(hidden.value).toBe("7");
  expect(host.textContent).toContain("Selected: Jordan");
  expect(new FormData(form).getAll("officer_id")).toEqual(["7"]);

  changeInput(input, "Nobody");
  expect(document.body.textContent).toContain("No matching options.");
  expect(host.textContent).toContain("Selected: Jordan");
  expect(hidden.value).toBe("7");
  changeInput(input, "");
  expect(new FormData(form).getAll("officer_id")).toEqual(["7"]);
});

it("clears only through the clear control and never accepts an unknown initial ID", async () => {
  const { form, input, hidden } = await renderSelect({ initialValue: "999" });
  expect(hidden.value).toBe("");
  input.click();
  press(input, "ArrowDown");
  press(input, "ArrowDown");
  press(input, "Enter");
  expect(hidden.value).toBe("3");

  act(() => {
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Clear officer search or selection"]',
      )
      ?.click();
  });
  expect(new FormData(form).getAll("officer_id")).toEqual([""]);
});

it("selects an Officer with a pointer click", async () => {
  const { form, input } = await renderSelect();
  act(() => {
    input.focus();
    input.click();
  });
  changeInput(input, "Avery");
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent === "Avery Officer");
  expect(option).toBeDefined();
  act(() => {
    option?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    option?.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 }),
    );
    option?.click();
  });
  expect(new FormData(form).getAll("officer_id")).toEqual(["3"]);
});

it("exposes server errors and disables selection while pending", async () => {
  const { input, hidden } = await renderSelect({
    initialValue: "3",
    error: "Select an officer",
    disabled: true,
  });
  expect(hidden.value).toBe("3");
  expect(input.disabled).toBe(true);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(input.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Select an officer");
});

it("serializes the Task Assignee parameter as a stable ID or empty value", async () => {
  const empty = await renderSelect({ name: "assignee" });
  expect(new FormData(empty.form).getAll("assignee")).toEqual([""]);

  await act(async () => root.unmount());
  root = createRoot(host);
  const selected = await renderSelect({
    name: "assignee",
    initialValue: "7",
  });
  expect(new FormData(selected.form).getAll("assignee")).toEqual(["7"]);
});
