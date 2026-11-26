// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EventRosterTableClient from "@/app/(protected)/events/event-roster-client";

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
  vi.restoreAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it("filters roster by participation type and copies deduplicated visible emails", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  await act(async () => {
    root.render(
      <EventRosterTableClient
        showTimeSlots={false}
        canCopyEmails
        rows={[
          {
            id: 1,
            participationType: "volunteer",
            email: "ada@utep.edu",
            row: (
              <tr key={1}>
                <td>Ada Lovelace</td>
                <td>Volunteer</td>
              </tr>
            ),
          },
          {
            id: 2,
            participationType: "attendee",
            email: "alan@utep.edu",
            row: (
              <tr key={2}>
                <td>Alan Turing</td>
                <td>Attend</td>
              </tr>
            ),
          },
        ]}
      />,
    );
  });

  expect(host.querySelectorAll("tbody tr")).toHaveLength(2);

  const volunteersBtn = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Volunteers (1)"),
  )!;
  act(() => {
    volunteersBtn.click();
  });
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.textContent).toContain("Ada Lovelace");
  expect(host.textContent).not.toContain("Alan Turing");

  const copyBtn = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Copy volunteer emails (1)"),
  )!;
  await act(async () => {
    copyBtn.click();
  });
  expect(writeText).toHaveBeenCalledWith("ada@utep.edu");
});
