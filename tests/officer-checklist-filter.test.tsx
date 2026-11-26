// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SearchableOfficerChecklist } from "@/components/officer-checklist-filter";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

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

const officers = [
  { id: 1, name: "Ada Lovelace", branches: ["technical"] },
  { id: 2, name: "Grace Hopper", branches: ["technical", "operations"] },
  { id: 3, name: "Alan Turing", branches: ["marketing"] },
];

it("supports branch quick-select chips, preserves FormData while filtering, and clears all selections", async () => {
  await act(async () => {
    root.render(
      <form>
        <SearchableOfficerChecklist officers={officers} />
      </form>,
    );
  });

  const form = host.querySelector("form")!;
  const techChip = [...host.querySelectorAll("button")].find((btn) =>
    btn.textContent?.includes("+ Technical (2)"),
  )!;

  act(() => {
    techChip.click();
  });
  expect(new FormData(form).getAll("officer_ids")).toEqual(["1", "2"]);
  expect(host.textContent).toContain("2 selected");

  const search = host.querySelector<HTMLInputElement>(
    'input[aria-label="Filter officers by name"]',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(search, "Alan");
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Hidden checked boxes remain mounted so FormData stays intact.
  expect(new FormData(form).getAll("officer_ids")).toEqual(["1", "2"]);

  const clearBtn = [...host.querySelectorAll("button")].find(
    (btn) => btn.textContent === "Clear",
  )!;
  act(() => {
    clearBtn.click();
  });
  expect(new FormData(form).getAll("officer_ids")).toEqual([]);
  expect(host.textContent).toContain("0 selected");
});
