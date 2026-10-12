// @vitest-environment jsdom

import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/officers/catalogs/actions", () => ({
  changeCatalog: vi.fn(),
}));

import CatalogManager from "@/app/(protected)/officers/catalogs/manager";
import { changeCatalog } from "@/app/(protected)/officers/catalogs/actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it("protects system Positions by machine identity and leaves deceptive custom labels editable", () => {
  const html = renderToStaticMarkup(
    createElement(CatalogManager, {
      catalog: "position",
      title: "Positions",
      records: [
        { id: 1, name: "President display label", code: "president" },
        { id: 2, name: "President", code: null },
      ],
    }),
  );

  expect(html).toContain("President display label");
  expect(html).toContain("(required position)");
  expect(html).toContain('name="id" value="2"');
  expect(html).not.toContain('name="id" value="1"');
});

it("shows retired catalog state and a reactivation action", () => {
  const html = renderToStaticMarkup(
    createElement(CatalogManager, {
      catalog: "branch",
      title: "Branches",
      records: [{ id: 8, name: "Systems", is_active: false }],
    }),
  );
  expect(html).toContain("Retired");
  expect(html).toContain('name="operation" value="reactivate"');
});

it("renders compact editable management rows without unsupported location retirement", () => {
  const branchHtml = renderToStaticMarkup(
    createElement(CatalogManager, {
      catalog: "branch",
      title: "Branches",
      records: [{ id: 8, name: "Systems", is_active: true }],
    }),
  );
  const locationHtml = renderToStaticMarkup(
    createElement(CatalogManager, {
      catalog: "event_location",
      title: "Event locations",
      records: [{ id: 9, name: "Engineering Building" }],
    }),
  );

  expect(branchHtml).toContain('class="catalog-record-row"');
  expect(branchHtml).toContain("Systems");
  expect(branchHtml).toContain(">Rename</button>");
  expect(branchHtml).not.toContain('name="operation" value="rename"');
  expect(branchHtml).toContain('name="operation" value="retire"');
  expect(locationHtml).toContain('class="catalog-record-row"');
  expect(locationHtml).not.toContain('name="operation" value="retire"');
  expect(locationHtml).not.toContain('name="operation" value="reactivate"');
});

it("opens inline rename on demand and retains validation values and focus", async () => {
  vi.mocked(changeCatalog)
    .mockResolvedValueOnce({
      error: "A record with this name already exists",
      success: "",
      fieldErrors: { name: "This name is already in use" },
      values: { name: "Updated Systems" },
    })
    .mockResolvedValue({ error: "", success: "Branch updated" });
  await act(async () => {
    root.render(
      createElement(CatalogManager, {
        catalog: "branch",
        title: "Branches",
        records: [{ id: 8, name: "Systems", is_active: true }],
      }),
    );
  });

  expect(
    host.querySelector('.catalog-rename-form input[name="name"]'),
  ).toBeNull();
  const renameButton = host.querySelector<HTMLButtonElement>(
    'button[type="button"]',
  );
  if (!renameButton) throw new Error("Rename button not found");
  await act(async () => renameButton.click());

  const input = host.querySelector<HTMLInputElement>(
    '.catalog-rename-form input[name="name"]',
  );
  if (!input) throw new Error("Rename input not found");
  expect(document.activeElement).toBe(input);
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, "Updated Systems");
  const form = input.form;
  if (!form) throw new Error("Rename form not found");
  await act(async () => {
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const retainedInput = host.querySelector<HTMLInputElement>(
    '.catalog-rename-form input[name="name"]',
  );
  expect(retainedInput?.value).toBe("Updated Systems");
  expect(host.textContent).toContain("This name is already in use");
  expect(document.activeElement).toBe(retainedInput);

  const cancelButton = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Cancel",
  );
  if (!cancelButton) throw new Error("Cancel button not found");
  await act(async () => cancelButton.click());
  expect(document.activeElement).toBe(
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Rename",
    ),
  );
  expect(
    host.querySelector('.catalog-rename-form input[name="name"]'),
  ).toBeNull();

  const restoredRenameButton = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Rename",
  );
  if (!restoredRenameButton) throw new Error("Rename button not found");
  await act(async () => restoredRenameButton.click());
  const nextInput = host.querySelector<HTMLInputElement>(
    '.catalog-rename-form input[name="name"]',
  );
  if (!nextInput?.form) throw new Error("Rename form not found");
  await act(async () => {
    nextInput.form?.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(changeCatalog).toHaveBeenCalledTimes(2);
  expect(
    host.querySelector('.catalog-rename-form input[name="name"]'),
  ).toBeNull();
  expect(host.textContent).toContain("Branch updated");
  expect(document.activeElement).toBe(
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Rename",
    ),
  );
});

it.each([
  [
    "position",
    "Position",
    "Data Analyst",
    "A Position in use cannot be deleted.",
  ],
  [
    "branch",
    "Branch",
    "Systems",
    "Branches used by Officers, Events, or Tasks cannot be deleted.",
  ],
  [
    "event_location",
    "Event location",
    "Engineering Building",
    "Existing Events keep their recorded location.",
  ],
] as const)(
  "requires confirmation before deleting a %s and identifies its record",
  (catalog, catalogName, recordName, consequence) => {
    const html = renderToStaticMarkup(
      createElement(CatalogManager, {
        catalog,
        title: catalogName,
        records: [{ id: 8, name: recordName, code: null }],
      }),
    );

    expect(html).toContain(`<dialog`);
    expect(html).toContain(`Delete ${catalogName}?`);
    expect(html).toContain(recordName);
    expect(html).toContain(consequence);
    expect(html).toContain(`Delete ${catalogName}`);
    expect(html).toContain('name="operation" value="delete"');
    expect(html).toContain('name="id" value="8"');
    expect(html).toContain('<button type="button"');
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain(`type="submit"`);
  },
);
