// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(protected)/officers/warning-actions", () => ({
  createWarning: vi.fn(),
  updateWarning: vi.fn(),
  voidWarning: vi.fn(),
}));

import {
  createWarning,
  updateWarning,
} from "@/app/(protected)/officers/warning-actions";
import {
  CreateWarningForm,
  EditWarningForm,
} from "@/app/(protected)/officers/warning-forms";

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

async function renderForm() {
  await act(async () => {
    root.render(createElement(CreateWarningForm, { officerId: 23 }));
  });
}

function openDialog() {
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[type="button"]',
  );
  if (!trigger) throw new Error("Create warning trigger not found");
  act(() => trigger.click());
  const dialog = host.querySelector<HTMLDialogElement>("dialog");
  if (!dialog) throw new Error("Create warning dialog not found");
  return { dialog, trigger };
}

function setReason(dialog: HTMLDialogElement, reason: string) {
  const input = dialog.querySelector<HTMLTextAreaElement>(
    'textarea[name="reason"]',
  );
  if (!input) throw new Error("Warning reason field not found");
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(input, reason);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(dialog: HTMLDialogElement) {
  const form = dialog.querySelector<HTMLFormElement>("form");
  if (!form) throw new Error("Warning form not found");
  await act(async () => {
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("explains immediate effect and audited corrections", async () => {
  await renderForm();
  const { dialog } = openDialog();
  expect(dialog.getAttribute("aria-labelledby")).toBe("create-warning-title");
  expect(dialog.getAttribute("aria-describedby")).toBe(
    "create-warning-description",
  );
  expect(dialog.textContent).toContain("takes effect immediately");
  expect(dialog.textContent).not.toContain("President");
  expect(dialog.textContent).toContain("correct its reason later");
  expect(
    dialog.querySelector('textarea[name="reason"]')?.getAttribute("required"),
  ).not.toBeNull();
  expect(
    dialog.querySelector('input[name="officer_id"]')?.getAttribute("value"),
  ).toBe("23");
});

it("retains values on cancel and validation failure, blocks pending dismissal, and refreshes only after success", async () => {
  let finishCreate!: (state: {
    error: string;
    success: string;
    values?: Record<string, string>;
    fieldErrors?: Record<string, string>;
  }) => void;
  vi.mocked(createWarning)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCreate = resolve;
        }),
    )
    .mockResolvedValueOnce({
      error: "",
      success: "Warning created",
    });

  await renderForm();
  const { dialog, trigger } = openDialog();
  setReason(dialog, "A sufficiently long warning reason");
  const cancel = dialog.querySelector<HTMLButtonElement>(
    'button[type="button"].button-secondary',
  );
  if (!cancel) throw new Error("Cancel button not found");
  act(() => cancel.click());
  expect(dialog.open).toBe(false);

  act(() => trigger.click());
  expect(
    dialog.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')?.value,
  ).toBe("A sufficiently long warning reason");
  await submit(dialog);
  expect(dialog.querySelector<HTMLFormElement>("form")?.dataset.pending).toBe(
    "true",
  );
  const cancelEvent = new Event("cancel", { cancelable: true });
  expect(dialog.dispatchEvent(cancelEvent)).toBe(false);
  expect(dialog.open).toBe(true);
  expect(createWarning).toHaveBeenCalledTimes(1);
  expect(
    Object.fromEntries(vi.mocked(createWarning).mock.calls[0][1] as FormData),
  ).toMatchObject({
    officer_id: "23",
    reason: "A sufficiently long warning reason",
  });

  await act(async () => {
    finishCreate({
      error: "Warning reason is required",
      success: "",
      values: {
        officer_id: "23",
        reason: "A sufficiently long warning reason",
      },
      fieldErrors: { reason: "Warning reason is required" },
    });
  });
  expect(dialog.open).toBe(true);
  expect(
    dialog.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')?.value,
  ).toBe("A sufficiently long warning reason");
  expect(dialog.textContent).toContain("Warning reason is required");

  await submit(dialog);
  expect(createWarning).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledOnce();
  expect(dialog.open).toBe(false);
  expect(trigger.ownerDocument.activeElement).toBe(trigger);
  expect(refresh).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Warning created");

  act(() => trigger.click());
  expect(
    dialog.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')?.value,
  ).toBe("");
});

it("edits historical reasons through the existing dialog with retained values", async () => {
  vi.mocked(updateWarning).mockResolvedValue({
    error: "",
    success: "Warning updated",
  });
  await act(async () =>
    root.render(
      createElement(EditWarningForm, {
        officerId: 23,
        warningId: 14,
        reason: "Historical reason",
      }),
    ),
  );
  const { dialog } = openDialog();
  expect(dialog.textContent).toContain(
    "Historical status and approval history are preserved",
  );
  expect(dialog.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
    "Historical reason",
  );
  setReason(dialog, "Corrected historical reason");
  await submit(dialog);
  const submitted = vi.mocked(updateWarning).mock.calls[0][1];
  expect(submitted.get("warning_id")).toBe("14");
  expect(submitted.get("reason")).toBe("Corrected historical reason");
  expect(refresh).toHaveBeenCalledOnce();
  expect(dialog.open).toBe(false);
});
