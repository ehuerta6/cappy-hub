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
  officerId,
  eventId,
}: {
  officerId?: number;
  eventId?: number;
} = {}) {
  await act(async () => {
    root.render(
      createElement(PointHistoryFilterControls, {
        officers: [
          { id: 3, name: "Avery Officer" },
          { id: 8, name: `Jordan ${"Long name ".repeat(10)}Officer` },
        ],
        events: [
          {
            id: 12,
            name: "Archived Algorithms Workshop",
            event_date: "2025-02-14",
          },
          { id: 13, name: "Cancelled Workshop", event_date: "2025-02-20" },
        ],
        isAdmin: true,
        status: "removed",
        fromDate: "2025-02-01",
        toDate: "2025-02-28",
        searchQuery: "arrays",
        awardType: "manual",
        officerId,
        eventId,
        dateRangeIsReversed: false,
      }),
    );
  });
  return host.querySelector<HTMLFormElement>(
    'form[aria-label="Point history filters"]',
  )!;
}

it("restores filter IDs and serializes the existing GET fields exactly once", async () => {
  const form = await renderFilters({ officerId: 8, eventId: 12 });
  const data = new FormData(form);

  expect([...data.entries()]).toEqual([
    ["view", "history"],
    ["q", "arrays"],
    ["type", "manual"],
    ["officer", "8"],
    ["event", "12"],
    ["status", "removed"],
    ["from", "2025-02-01"],
    ["to", "2025-02-28"],
  ]);
  expect(host.textContent).toContain("Jordan Long name");
  expect(host.textContent).toContain(
    "Archived Algorithms Workshop — Feb 14, 2025",
  );
  expect(
    host.querySelector('a[aria-label="Clear current point history filters"]'),
  ).not.toBeNull();
  expect(
    host
      .querySelector('a[aria-label="Clear current point history filters"]')
      ?.getAttribute("href"),
  ).toBe("/points?view=history");
});

it("preserves a selected historical ID with an informative unavailable label", async () => {
  const form = await renderFilters({ officerId: 404, eventId: 505 });

  expect(new FormData(form).getAll("officer")).toEqual(["404"]);
  expect(new FormData(form).getAll("event")).toEqual(["505"]);
  expect(host.textContent).toContain("Officer #404 (name unavailable)");
  expect(host.textContent).toContain("Event #505 (name unavailable)");
});

it("submits empty values for the All officer and All event state", async () => {
  const form = await renderFilters();
  const data = new FormData(form);

  expect(data.getAll("officer")).toEqual([""]);
  expect(data.getAll("event")).toEqual([""]);
  expect(
    host.querySelector('input[placeholder="All officers"]'),
  ).not.toBeNull();
  expect(host.querySelector('input[placeholder="All events"]')).not.toBeNull();
});
