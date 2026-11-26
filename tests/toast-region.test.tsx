// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ToastRegion, { emitToast } from "@/components/toast-region";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it("renders success and error toasts with proper roles, deduplicates rapid identical toasts, and supports manual dismiss", async () => {
  await act(async () => {
    root.render(<ToastRegion />);
  });
  expect(host.textContent).toBe("");

  act(() => {
    emitToast("Saved changes", "success");
    emitToast("Saved changes", "success");
    emitToast("Save failed", "error");
  });

  const liveRegion = host.querySelector('[aria-live="polite"]');
  expect(liveRegion).not.toBeNull();
  expect(liveRegion?.getAttribute("aria-atomic")).toBeNull();

  const statuses = host.querySelectorAll('[role="status"]');
  const alerts = host.querySelectorAll('[role="alert"]');
  expect(statuses).toHaveLength(1);
  expect(statuses[0]?.textContent).toContain("Saved changes");
  expect(alerts).toHaveLength(1);
  expect(alerts[0]?.textContent).toContain("Save failed");

  const dismissButtons = host.querySelectorAll<HTMLButtonElement>(
    'button[aria-label="Dismiss notification"]',
  );
  act(() => {
    dismissButtons[0]?.click();
  });
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(host.querySelectorAll('[role="status"]')).toHaveLength(0);
  expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1);
});
