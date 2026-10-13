// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/events/actions", () => ({
  saveEvent: vi.fn(),
}));

import { EventLocationAutocomplete } from "@/components/event-location-autocomplete";
import EventForm from "@/app/(protected)/events/event-form";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: { root: Root; host: HTMLElement }[] = [];

afterEach(async () => {
  await act(async () => {
    for (const { root, host } of roots.splice(0)) {
      root.unmount();
      host.remove();
    }
  });
});

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push({ root, host });
  return act(async () => {
    root.render(node);
    return host;
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
}

it("submits arbitrary location text directly through the required location field", async () => {
  const formHost = document.createElement("form");
  document.body.append(formHost);
  const root = createRoot(formHost);
  roots.push({ root, host: formHost });

  await act(async () => {
    root.render(
      <EventLocationAutocomplete
        locations={[
          { id: 1, name: "Engineering Building" },
          { id: 2, name: "University Library" },
        ]}
      />,
    );
  });

  const input = formHost.querySelector<HTMLInputElement>(
    'input[name="location"]',
  );
  expect(input).not.toBeNull();
  expect(input?.required).toBe(true);

  await act(async () => {
    input!.focus();
    setInputValue(input!, "Custom campus room 1.032");
    input!.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );
    input!.dispatchEvent(new Event("change", { bubbles: true }));
  });

  expect(new FormData(formHost).get("location")).toBe(
    "Custom campus room 1.032",
  );
  expect(formHost.querySelector('[name="location_id"]')).toBeNull();
});

it("selects a matching catalog Location with the keyboard and submits its text", async () => {
  const formHost = document.createElement("form");
  document.body.append(formHost);
  const root = createRoot(formHost);
  roots.push({ root, host: formHost });
  await act(async () => {
    root.render(
      <EventLocationAutocomplete
        locations={[
          { id: 1, name: "Engineering Building" },
          { id: 2, name: "University Library" },
        ]}
      />,
    );
  });

  const input = formHost.querySelector<HTMLInputElement>(
    'input[name="location"]',
  )!;
  await act(async () => {
    input.focus();
    setInputValue(input, "engineering");
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );
  });

  const options = document.body.querySelectorAll('[role="option"]');
  expect(options).toHaveLength(1);
  expect(options[0].textContent).toContain("Engineering Building");

  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });

  expect(new FormData(formHost).get("location")).toBe("Engineering Building");
});

it("selects an existing catalog Location with a pointer", async () => {
  const formHost = document.createElement("form");
  document.body.append(formHost);
  const root = createRoot(formHost);
  roots.push({ root, host: formHost });
  await act(async () => {
    root.render(
      <EventLocationAutocomplete
        locations={[{ id: 1, name: "Engineering Building" }]}
      />,
    );
  });

  const input = formHost.querySelector<HTMLInputElement>(
    'input[name="location"]',
  )!;
  await act(async () => {
    input.focus();
    setInputValue(input, "engineering");
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );
  });

  const option = document.body.querySelector<HTMLElement>('[role="option"]');
  expect(option).not.toBeNull();
  await act(async () => option!.click());

  expect(new FormData(formHost).get("location")).toBe("Engineering Building");
});

it("tracks an edited free-text Location for the existing recurring-edit patch", async () => {
  const host = await mount(
    <EventForm
      branches={[]}
      eventTypes={[{ id: 9, name: "Session" }]}
      locations={[{ id: 1, name: "Engineering Building" }]}
      event={
        {
          id: 12,
          name: "CIC meeting",
          description: "Agenda",
          location: "Engineering Building",
          event_type_id: 9,
          slides_url: null,
          meeting_notes_url: null,
          signup_sheet_url: null,
          max_volunteers: null,
          event_date: "2026-10-12",
          starts_at: "2026-10-12T16:00:00.000Z",
          ends_at: "2026-10-12T17:00:00.000Z",
          recurrence_key: "2026-10-12",
        } as never
      }
      branchIds={[]}
      series={
        {
          id: 19,
          revision: 2,
          recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT=4",
          starts_on: "2026-10-12",
        } as never
      }
      mutationRequestKey="test-request-key"
    />,
  );

  const form = host.querySelector<HTMLFormElement>("form")!;
  const input = form.querySelector<HTMLInputElement>('input[name="location"]')!;
  await act(async () => {
    input.focus();
    setInputValue(input, "New campus room");
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  expect(new FormData(form).get("location")).toBe("New campus room");
  expect(new FormData(form).getAll("edited_fields")).toContain("location");
});
