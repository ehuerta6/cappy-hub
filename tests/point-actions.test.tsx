// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/points/actions", () => ({
  editPointTransaction: vi.fn().mockResolvedValue({ error: "", success: "" }),
  removePointTransaction: vi.fn().mockResolvedValue({ error: "", success: "" }),
}));

import PointActions from "@/app/(protected)/points/point-actions";
import { editPointTransaction } from "@/app/(protected)/points/actions";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let root: Root;
let host: HTMLDivElement;

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
});

async function renderPointActions() {
  await act(async () => {
    root.render(
      createElement(PointActions, { transactionId: 18, points: -2.5 }),
    );
  });
}

it("keeps the transaction read-only until editing is requested", async () => {
  await renderPointActions();

  expect(host.querySelector('input[name="points"]')).toBeNull();
  expect(host.textContent).toContain("Edit points");
  expect(host.textContent).toContain("Remove");
});

it("shows the current signed amount with explicit Save and Cancel actions while editing", async () => {
  await renderPointActions();

  const edit = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Edit points"),
  );
  if (!edit) throw new Error("Edit points button not found");
  await act(async () => edit.click());

  expect(host.textContent).toContain("Current amount: -2.5 points");
  expect(
    host.querySelector<HTMLInputElement>('input[name="points"]')?.value,
  ).toBe("-2.5");
  expect(host.textContent).toContain("Save points");
  expect(host.textContent).toContain("Cancel");
});

it("closes editing on Cancel and restores focus to Edit points", async () => {
  await renderPointActions();

  const trigger = host.querySelector<HTMLButtonElement>(
    'button[type="button"].button-secondary',
  );
  if (!trigger) throw new Error("Edit points button not found");
  await act(async () => trigger.click());

  const cancel = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Cancel",
  );
  if (!cancel) throw new Error("Cancel button not found");
  await act(async () => cancel.click());

  expect(host.querySelector('input[name="points"]')).toBeNull();
  expect(host.ownerDocument.activeElement?.textContent).toBe("Edit points");
});

it("retains the proposed amount and field error after a rejected save", async () => {
  vi.mocked(editPointTransaction).mockResolvedValueOnce({
    error: "Review the proposed amount",
    success: "",
    values: { points: "-3.25" },
    fieldErrors: { points: "Amount is not allowed" },
  });
  await renderPointActions();
  const edit = host.querySelector<HTMLButtonElement>(
    'button[type="button"].button-secondary',
  );
  if (!edit) throw new Error("Edit points button not found");
  await act(async () => edit.click());

  const input = host.querySelector<HTMLInputElement>('input[name="points"]');
  if (!input) throw new Error("Proposed amount input not found");
  const form = input.closest("form");
  if (!form) throw new Error("Edit form not found");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "-3.25");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("-3.25");
    form.requestSubmit();
    await Promise.resolve();
  });

  const retainedInput = host.querySelector<HTMLInputElement>(
    'input[name="points"]',
  );
  expect(retainedInput?.value).toBe("-3.25");
  expect(retainedInput?.getAttribute("aria-invalid")).toBe("true");
  expect(host.textContent).toContain("Amount is not allowed");
  expect(host.textContent).toContain("Review the proposed amount");
  expect(editPointTransaction).toHaveBeenCalledOnce();
  expect(
    Object.fromEntries(
      vi.mocked(editPointTransaction).mock.calls[0][1] as FormData,
    ),
  ).toMatchObject({ transaction_id: "18", points: "-3.25" });
});
