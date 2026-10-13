// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addTransaction, searchEvents } from "@/app/(protected)/points/actions";
import { EventSearchSelect } from "@/app/(protected)/points/event-search-select";

vi.mock("@/app/(protected)/points/actions", () => ({
  addTransaction: vi.fn(),
  searchEvents: vi.fn(),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import TransactionForm from "@/app/(protected)/points/transaction-form";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const repeatedEvents = [
  { id: 11, name: "Repeated event", event_date: "2026-10-08" },
  { id: 12, name: "Repeated event", event_date: "2026-10-15" },
];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.history.replaceState({}, "", "/points?q=monthly&type=manual&page=3");
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
  vi.useRealTimers();
});

async function renderTransactionForm() {
  await act(async () => {
    root.render(
      createElement(TransactionForm, {
        officers: [{ id: 3, name: "Test Officer" }],
        events: repeatedEvents,
      }),
    );
  });
}

function openDialog() {
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[type="button"]',
  );
  if (!trigger) throw new Error("Add transaction trigger not found");
  act(() => trigger.click());
  const dialog = host.querySelector<HTMLDialogElement>("dialog");
  if (!dialog) throw new Error("Transaction dialog not found");
  return { dialog, trigger };
}

function fillTransaction(dialog: HTMLDialogElement) {
  const officer = dialog.querySelector<HTMLInputElement>(
    'input[placeholder="Search Officers"]',
  )!;
  const points = dialog.querySelector<HTMLInputElement>(
    'input[name="points"]',
  )!;
  const reason = dialog.querySelector<HTMLInputElement>(
    'input[name="reason"]',
  )!;
  act(() => {
    officer.focus();
    officer.click();
  });
  act(() => {
    officer.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  act(() => {
    officer.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  expect(document.querySelector('[role="option"]')?.outerHTML).toContain(
    "data-highlighted",
  );
  act(() => {
    officer.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    for (const [input, value] of [
      [points, "2.5"],
      [reason, "Lifecycle check"],
    ] as const) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="officer_id"]')?.value,
  ).toBe("3");
}

async function submit(dialog: HTMLDialogElement) {
  const form = dialog.querySelector<HTMLFormElement>("form");
  if (!form) throw new Error("Transaction form not found");
  await act(async () => {
    form.requestSubmit();
    await Promise.resolve();
  });
}

it("renders recent Events with dates and an explicit No event option", async () => {
  await renderTransactionForm();
  const { dialog } = openDialog();
  const input = dialog.querySelector<HTMLInputElement>(
    'input[placeholder="Search Events"]',
  );
  expect(input).not.toBeNull();
  act(() => {
    input!.focus();
    input!.click();
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  expect(document.body.textContent).toContain("No event");
  expect(document.body.textContent).toContain("Repeated event — Oct 8, 2026");
  expect(document.body.textContent).toContain("Repeated event — Oct 15, 2026");
});

it("debounces remote lookup and enforces two non-whitespace characters", async () => {
  vi.useFakeTimers();
  vi.mocked(searchEvents).mockResolvedValue({ events: [], error: false });
  await renderTransactionForm();
  const { dialog } = openDialog();
  const input = dialog.querySelector<HTMLInputElement>(
    'input[placeholder="Search Events"]',
  )!;
  const setQuery = (value: string) => {
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  setQuery("A ");
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(searchEvents).not.toHaveBeenCalled();

  setQuery("Older");
  await act(async () => vi.advanceTimersByTimeAsync(299));
  expect(searchEvents).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(searchEvents).toHaveBeenCalledExactlyOnceWith("Older");
});

it("reports request errors separately and preserves selected Event IDs while searching", async () => {
  vi.mocked(searchEvents).mockResolvedValue({ events: [], error: true });
  await act(async () => {
    root.render(
      createElement(EventSearchSelect, { events: [], initialValue: "23" }),
    );
  });
  const input = host.querySelector<HTMLInputElement>(
    'input[placeholder="Search Events"]',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "Lookup");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));

  expect(
    host.querySelector<HTMLInputElement>('input[name="event_id"]')?.value,
  ).toBe("23");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not search Events",
  );
  act(() => {
    input.focus();
    input.click();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "No event");
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "No event",
        inputType: "insertText",
      }),
    );
  });
  const noEventOption = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((option) => option.textContent?.includes("No event"));
  expect(noEventOption).toBeDefined();
  act(() => {
    noEventOption?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    noEventOption?.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 }),
    );
    noEventOption?.click();
  });
  expect(
    host.querySelector<HTMLInputElement>('input[name="event_id"]')?.value,
  ).toBe("");
});

it("keeps newer results when an older request resolves last", async () => {
  vi.useFakeTimers();
  let resolveOlder!: (result: {
    events: { id: number; name: string; event_date: string }[];
    error: false;
  }) => void;
  let resolveNewer!: (result: {
    events: { id: number; name: string; event_date: string }[];
    error: false;
  }) => void;
  vi.mocked(searchEvents)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOlder = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNewer = resolve;
        }),
    );
  await act(async () => {
    root.render(createElement(EventSearchSelect, { events: [] }));
  });
  const input = host.querySelector<HTMLInputElement>(
    'input[placeholder="Search Events"]',
  )!;
  const setQuery = (value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  setQuery("Older");
  await act(async () => vi.advanceTimersByTimeAsync(300));
  setQuery("Newer");
  await act(async () => vi.advanceTimersByTimeAsync(300));
  await act(async () => {
    resolveNewer({
      events: [{ id: 2, name: "Newer Event", event_date: "2026-10-16" }],
      error: false,
    });
  });
  await act(async () => {
    resolveOlder({
      events: [{ id: 1, name: "Older Event", event_date: "2026-10-15" }],
      error: false,
    });
  });

  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  expect(document.body.textContent).toContain("Newer Event — Oct 16, 2026");
  expect(document.body.textContent).not.toContain("Older Event — Oct 15, 2026");
});

it("keeps the dialog and submitted values after persistence failure, blocks pending dismissal, then resets and refreshes on success", async () => {
  let rejectSave!: (state: {
    error: string;
    success: string;
    values: Record<string, string>;
  }) => void;
  vi.mocked(addTransaction)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          rejectSave = resolve;
        }),
    )
    .mockResolvedValueOnce({ error: "", success: "Point transaction added" });

  await renderTransactionForm();
  const { dialog, trigger } = openDialog();
  fillTransaction(dialog);
  const eventInput = dialog.querySelector<HTMLInputElement>(
    'input[placeholder="Search Events"]',
  )!;
  act(() => {
    eventInput.focus();
    eventInput.click();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(eventInput, "Repeated");
    eventInput.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "Repeated",
        inputType: "insertText",
      }),
    );
  });
  act(() =>
    eventInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  act(() =>
    eventInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="event_id"]')?.value,
  ).toBe("12");
  await submit(dialog);

  const form = dialog.querySelector<HTMLFormElement>("form")!;
  const cancel = dialog.querySelector<HTMLButtonElement>(
    'button[type="button"].button-secondary',
  )!;
  expect(form.dataset.pending).toBe("true");
  expect(cancel.disabled).toBe(true);
  const cancelEvent = new Event("cancel", { cancelable: true });
  expect(dialog.dispatchEvent(cancelEvent)).toBe(false);
  expect(dialog.open).toBe(true);
  expect(addTransaction).toHaveBeenCalledTimes(1);
  expect(
    Object.fromEntries(vi.mocked(addTransaction).mock.calls[0][1] as FormData),
  ).toMatchObject({
    officer_id: "3",
    event_id: "12",
    points: "2.5",
    reason: "Lifecycle check",
  });
  expect(
    (vi.mocked(addTransaction).mock.calls[0][1] as FormData).getAll(
      "officer_id",
    ),
  ).toEqual(["3"]);

  await act(async () => {
    rejectSave({
      error: "Could not save changes",
      success: "",
      values: {
        officer_id: "3",
        points: "2.5",
        reason: "Lifecycle check",
        award_type: "manual",
        event_id: "12",
      },
    });
  });
  expect(dialog.open).toBe(true);
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="officer_id"]')?.value,
  ).toBe("3");
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="points"]')?.value,
  ).toBe("2.5");
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="reason"]')?.value,
  ).toBe("Lifecycle check");
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="event_id"]')?.value,
  ).toBe("12");
  expect(dialog.textContent).toContain("Could not save changes");

  const officerSearch = dialog.querySelector<HTMLInputElement>(
    'input[placeholder="Search Officers"]',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(officerSearch, "Nobody");
    officerSearch.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "Nobody",
        inputType: "insertText",
      }),
    );
  });
  expect(officerSearch.value).toBe("Nobody");
  expect(dialog.textContent).toContain("Selected: Test Officer");
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="officer_id"]')?.value,
  ).toBe("3");

  await submit(dialog);
  expect(
    (vi.mocked(addTransaction).mock.calls[1][1] as FormData).getAll(
      "officer_id",
    ),
  ).toEqual(["3"]);
  expect(
    (vi.mocked(addTransaction).mock.calls[1][1] as FormData).getAll("event_id"),
  ).toEqual(["12"]);
  expect(dialog.open).toBe(false);
  expect(trigger.ownerDocument.activeElement).toBe(trigger);
  expect(refresh).toHaveBeenCalledOnce();
  expect(window.location.pathname + window.location.search).toBe(
    "/points?q=monthly&type=manual&page=3",
  );

  act(() => trigger.click());
  const nextDialog = host.querySelector<HTMLDialogElement>("dialog")!;
  expect(nextDialog.open).toBe(true);
  expect(
    nextDialog.querySelector<HTMLInputElement>('input[name="officer_id"]')
      ?.value,
  ).toBe("");
  expect(
    nextDialog.querySelector<HTMLInputElement>('input[name="points"]')?.value,
  ).toBe("");
  expect(
    nextDialog.querySelector<HTMLInputElement>('input[name="reason"]')?.value,
  ).toBe("");
  expect(addTransaction).toHaveBeenCalledTimes(2);
});
