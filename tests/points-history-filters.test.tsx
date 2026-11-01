// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PointHistoryFilterControls from "@/app/(protected)/points/history-filters";

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", props, children),
}));

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

async function renderFilters({
  isAdmin = true,
  hasActiveFilters = true,
}: { isAdmin?: boolean; hasActiveFilters?: boolean } = {}) {
  await act(async () => {
    root.render(
      createElement(PointHistoryFilterControls, {
        isAdmin,
        status: "removed",
        searchQuery: "arrays",
        awardType: "correction",
        hasActiveFilters,
      }),
    );
  });
  return host.querySelector<HTMLFormElement>(
    'form[aria-label="Point history filters"]',
  )!;
}

it("keeps history search, award type, and Admin status as the basic GET filters", async () => {
  const form = await renderFilters();

  expect([...new FormData(form).entries()]).toEqual([
    ["view", "history"],
    ["q", "arrays"],
    ["type", "correction"],
    ["status", "removed"],
  ]);
  expect(
    form.querySelector('input[name="q"]')?.getAttribute("placeholder"),
  ).toBe("Officer, reason, event, or task");
  expect(form.querySelector('select[name="type"]')?.textContent).toContain(
    "Correction",
  );
  expect(form.querySelector('select[name="status"]')?.textContent).toContain(
    "Removed",
  );
  expect(
    host
      .querySelector('a[aria-label="Clear current point history filters"]')
      ?.getAttribute("href"),
  ).toBe("/points?view=history");
});

it("does not expose removed-history status controls to non-admins", async () => {
  const form = await renderFilters({ isAdmin: false });

  expect(form.querySelector('select[name="status"]')).toBeNull();
  expect([...new FormData(form).entries()]).toEqual([
    ["view", "history"],
    ["q", "arrays"],
    ["type", "correction"],
  ]);
});

it("shows Clear filters when a legacy URL filter is active", async () => {
  await renderFilters({ hasActiveFilters: true });

  expect(
    host.querySelector('a[aria-label="Clear current point history filters"]'),
  ).not.toBeNull();
});
