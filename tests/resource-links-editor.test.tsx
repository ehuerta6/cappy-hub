/** @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import ResourceLinksEditor from "@/components/resource-links-editor";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const initialRows = [
  {
    kind: "custom",
    label: "First",
    url: "https://example.org/1",
    legacy_key: null,
  },
  {
    kind: "custom",
    label: "Middle",
    url: "https://example.org/2",
    legacy_key: null,
  },
  {
    kind: "custom",
    label: "Last",
    url: "https://example.org/3",
    legacy_key: null,
  },
];

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function renderEditor(rows: unknown[] = [], error?: string) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      createElement(ResourceLinksEditor, {
        initialValue: JSON.stringify(rows),
        error,
      }),
    );
  });
  return host;
}

async function click(selector: string) {
  const button = host?.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing button: ${selector}`);
  await act(async () => button.click());
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

it("adds a row and places focus in its editable label", async () => {
  await renderEditor();

  await click("button:not([aria-label])");

  expect(document.activeElement).toBe(
    host?.querySelector('[aria-label="Link 1 label"]'),
  );
  expect(
    host?.querySelector<HTMLInputElement>('input[name="resource_links"]')
      ?.value,
  ).toContain('"url":""');
});

it("preserves legacy link fields without submitting internal row identities", async () => {
  const legacyUrl = `https://example.org/${"x".repeat(2050)}`;
  await renderEditor([
    {
      kind: "slides",
      label: "Slides",
      url: legacyUrl,
      legacy_key: "slides",
    },
  ]);

  const submitted = JSON.parse(
    host?.querySelector<HTMLInputElement>('input[name="resource_links"]')
      ?.value ?? "[]",
  );
  expect(submitted).toEqual([
    {
      kind: "slides",
      label: "Slides",
      url: legacyUrl,
      legacy_key: "slides",
    },
  ]);
});

it("keeps row identity and focuses the next row after a middle removal", async () => {
  await renderEditor(initialRows);
  const lastRowType = host?.querySelector<HTMLSelectElement>(
    '[aria-label="Link 3 type"]',
  );

  await click('button[aria-label="Remove link 2"]');

  expect(
    host?.querySelector<HTMLInputElement>('[aria-label="Link 2 label"]')?.value,
  ).toBe("Last");
  expect(document.activeElement).toBe(lastRowType);
  expect(
    host?.querySelector<HTMLInputElement>('input[name="resource_links"]')
      ?.value,
  ).toContain("https://example.org/3");
});

it("focuses the next row after removing the first row", async () => {
  await renderEditor(initialRows.slice(0, 2));
  const nextRowType = host?.querySelector<HTMLSelectElement>(
    '[aria-label="Link 2 type"]',
  );

  await click('button[aria-label="Remove link 1"]');

  expect(
    host?.querySelector<HTMLInputElement>('[aria-label="Link 1 label"]')?.value,
  ).toBe("Middle");
  expect(document.activeElement).toBe(nextRowType);
});

it("focuses the previous row after removing the last row", async () => {
  await renderEditor(initialRows.slice(0, 2));
  const previousRowType = host?.querySelector<HTMLSelectElement>(
    '[aria-label="Link 1 type"]',
  );

  await click('button[aria-label="Remove link 2"]');

  expect(
    host?.querySelector<HTMLInputElement>('[aria-label="Link 1 label"]')?.value,
  ).toBe("First");
  expect(document.activeElement).toBe(previousRowType);
});

it("returns focus to Add link when removing the only row", async () => {
  await renderEditor(initialRows.slice(0, 1));

  await click('button[aria-label="Remove link 1"]');

  expect(host?.querySelector("[aria-label$='URL']")).toBeNull();
  expect(document.activeElement).toBe(
    host?.querySelector("button:not([aria-label])"),
  );
});

it("associates and announces resource validation errors", async () => {
  await renderEditor(initialRows, "Enter a valid HTTP or HTTPS URL");

  const group = host?.querySelector("fieldset");
  const controls = host?.querySelectorAll(
    'select[aria-label^="Link "], input[aria-label^="Link "]',
  );
  const firstControl = host?.querySelector('[aria-label="Link 1 label"]');
  const error = host?.querySelector('[role="alert"]');
  expect(group?.getAttribute("aria-describedby")).toContain(
    "resource-links-error",
  );
  expect(controls?.length).toBe(9);
  controls?.forEach((control) => {
    expect(control.getAttribute("aria-describedby")).toBe(
      "resource-links-error",
    );
    expect(control.getAttribute("aria-invalid")).toBeNull();
  });
  expect(firstControl?.getAttribute("aria-invalid")).toBeNull();
  expect(error?.textContent).toBe("Enter a valid HTTP or HTTPS URL");
  expect(document.activeElement).toBe(error);
});
