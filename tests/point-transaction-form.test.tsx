// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { addTransaction } from "@/app/(protected)/points/actions";

vi.mock("@/app/(protected)/points/actions", () => ({
  addTransaction: vi.fn(),
  searchEvents: vi.fn(),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import TransactionForm, {
  mergeEventSearchResults,
} from "@/app/(protected)/points/transaction-form";

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
  const officer = dialog.querySelector<HTMLSelectElement>(
    'select[name="officer_id"]',
  )!;
  const points = dialog.querySelector<HTMLInputElement>(
    'input[name="points"]',
  )!;
  const reason = dialog.querySelector<HTMLInputElement>(
    'input[name="reason"]',
  )!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set?.call(officer, "3");
    officer.dispatchEvent(new Event("change", { bubbles: true }));
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
}

async function submit(dialog: HTMLDialogElement) {
  const form = dialog.querySelector<HTMLFormElement>("form");
  if (!form) throw new Error("Transaction form not found");
  await act(async () => {
    form.requestSubmit();
    await Promise.resolve();
  });
}

it("disambiguates duplicate Event names by occurrence date and preserves IDs", () => {
  const html = renderToStaticMarkup(
    <TransactionForm officers={[]} events={repeatedEvents} />,
  );

  expect(html).toContain(
    '<option value="11">Repeated event — Oct 8, 2026</option>',
  );
  expect(html).toContain(
    '<option value="12">Repeated event — Oct 15, 2026</option>',
  );
});

it("retains a previously selected Event when another search returns new matches", () => {
  const selected = repeatedEvents[0];
  expect(
    mergeEventSearchResults(
      [selected],
      [{ id: 14, name: "Older event", event_date: "2025-02-10" }],
    ),
  ).toEqual([
    selected,
    { id: 14, name: "Older event", event_date: "2025-02-10" },
  ]);
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
    points: "2.5",
    reason: "Lifecycle check",
  });

  await act(async () => {
    rejectSave({
      error: "Could not save changes",
      success: "",
      values: {
        officer_id: "3",
        points: "2.5",
        reason: "Lifecycle check",
        award_type: "manual",
        event_id: "",
      },
    });
  });
  expect(dialog.open).toBe(true);
  expect(
    dialog.querySelector<HTMLSelectElement>('select[name="officer_id"]')?.value,
  ).toBe("3");
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="points"]')?.value,
  ).toBe("2.5");
  expect(
    dialog.querySelector<HTMLInputElement>('input[name="reason"]')?.value,
  ).toBe("Lifecycle check");
  expect(dialog.textContent).toContain("Could not save changes");

  await submit(dialog);
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
    nextDialog.querySelector<HTMLSelectElement>('select[name="officer_id"]')
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
