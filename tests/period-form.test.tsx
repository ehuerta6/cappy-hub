// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AcademicPeriodForm } from "@/app/(protected)/admin/periods/period-form";

vi.mock("@/app/(protected)/admin/periods/actions", () => ({
  saveAcademicPeriodAction: vi.fn(),
}));

vi.mock("@/components/academic-period-selector", () => ({
  AcademicPeriodWriteContextField: () => null,
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

it("derives deterministic semester presets from server currentDate and previews duration", async () => {
  await act(async () => {
    root.render(<AcademicPeriodForm currentDate="2026-11-26" />);
  });

  const springBtn = [...host.querySelectorAll("button")].find(
    (btn) => btn.textContent === "Spring 2027",
  )!;
  expect(springBtn).toBeDefined();

  act(() => {
    springBtn.click();
  });

  expect(
    host.querySelector<HTMLInputElement>('input[name="name"]')?.value,
  ).toBe("Spring 2027");
  expect(
    host.querySelector<HTMLInputElement>('input[name="starts_on"]')?.value,
  ).toBe("2027-01-12");
  expect(
    host.querySelector<HTMLInputElement>('input[name="ends_on"]')?.value,
  ).toBe("2027-05-15");
  expect(host.textContent).toContain("Duration: 18 weeks (124 days)");
});
