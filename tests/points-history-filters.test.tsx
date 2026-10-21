// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PointHistoryFilterControls from "@/app/(protected)/points/history-filters";
import { searchPointHistoryEvents } from "@/app/(protected)/points/actions";

vi.mock("@/app/(protected)/points/actions", () => ({
  searchPointHistoryEvents: vi.fn(),
}));

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
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.useRealTimers();
});

async function renderFilters({
  officerId,
  eventId,
  selectedEvent,
}: {
  officerId?: number;
  eventId?: number;
  selectedEvent?: { id: number; name: string; event_date: string } | null;
} = {}) {
  await act(async () => {
    root.render(
      createElement(PointHistoryFilterControls, {
        officers: [
          { id: 3, name: "Avery Officer" },
          { id: 8, name: `Jordan ${"Long name ".repeat(10)}Officer` },
        ],
        selectedEvent: selectedEvent ?? null,
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
  const form = await renderFilters({
    officerId: 8,
    eventId: 12,
    selectedEvent: {
      id: 12,
      name: "Archived Algorithms Workshop",
      event_date: "2025-02-14",
    },
  });
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

it("preserves a selected historical ID when its Event record is missing", async () => {
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
  expect(
    host.querySelector('input[placeholder="Search Events"]'),
  ).not.toBeNull();
});

it("retains the selected Event label while later remote results change", async () => {
  vi.useFakeTimers();
  vi.mocked(searchPointHistoryEvents)
    .mockResolvedValueOnce({
      events: [{ id: 12, name: "Archived Workshop", event_date: "2025-02-14" }],
      error: false,
    })
    .mockResolvedValueOnce({
      events: [
        { id: 13, name: "Cancelled Workshop", event_date: "2025-02-20" },
      ],
      error: false,
    });
  const form = await renderFilters();
  const input = form.querySelector<HTMLInputElement>(
    'input[placeholder="Search Events"]',
  )!;
  const setQuery = (value: string) => {
    act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  setQuery("Archived");
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(searchPointHistoryEvents).toHaveBeenCalledWith("Archived");
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  const archivedOption = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((option) => option.textContent?.includes("Archived Workshop"));
  expect(archivedOption).toBeDefined();
  expect(archivedOption?.textContent).toContain(
    "Archived Workshop — Feb 14, 2025",
  );
  await act(async () => {
    archivedOption!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    archivedOption!.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 }),
    );
    archivedOption!.click();
  });
  expect(new FormData(form).getAll("event")).toEqual(["12"]);
  setQuery("Cancelled");
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(searchPointHistoryEvents).toHaveBeenCalledWith("Cancelled");
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  expect(document.body.textContent).toContain(
    "Cancelled Workshop — Feb 20, 2025",
  );
  expect(host.textContent).toContain("Archived Workshop — Feb 14, 2025");
  vi.useRealTimers();
});

it("shows an accessible error when the bounded Event search fails", async () => {
  vi.useFakeTimers();
  vi.mocked(searchPointHistoryEvents).mockResolvedValue({
    events: [],
    error: true,
  });
  const form = await renderFilters();
  const input = form.querySelector<HTMLInputElement>(
    'input[placeholder="Search Events"]',
  )!;
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "Failure");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not search Events",
  );
  vi.useRealTimers();
});

it("announces loading and empty results separately", async () => {
  vi.useFakeTimers();
  vi.mocked(searchPointHistoryEvents).mockResolvedValue({
    events: [],
    error: false,
  });
  const form = await renderFilters();
  const input = form.querySelector<HTMLInputElement>(
    'input[placeholder="Search Events"]',
  )!;
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "No matches");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "Searching Events",
  );
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "No matching Events",
  );
});
