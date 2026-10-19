// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import TimeSlotsEditor from "@/app/(protected)/events/time-slots-editor";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: { root: Root; host: HTMLFormElement }[] = [];

afterEach(async () => {
  await act(async () => {
    for (const { root, host } of roots.splice(0)) {
      root.unmount();
      host.remove();
    }
  });
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
}

it("submits an optional independent capacity for each equal slot", async () => {
  const host = document.createElement("form");
  document.body.append(host);
  const root = createRoot(host);
  roots.push({ root, host });

  await act(async () => {
    root.render(
      <TimeSlotsEditor
        eventStart="09:00"
        eventEnd="11:00"
        eventTypeName="Meeting"
        initialSlots={[]}
        enabledInitially={false}
      />,
    );
  });

  const enableSlots = host.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(enableSlots).not.toBeNull();
  await act(async () => enableSlots!.click());

  const equalMethod = host.querySelector<HTMLInputElement>(
    'input[type="radio"][value="equal"]',
  );
  expect(equalMethod).not.toBeNull();
  await act(async () => equalMethod!.click());

  const capacityInputs = host.querySelectorAll<HTMLInputElement>(
    'input[type="number"]',
  );
  expect(capacityInputs).toHaveLength(3);
  expect(capacityInputs[1].getAttribute("min")).toBe("1");
  expect(capacityInputs[2].getAttribute("min")).toBe("1");

  await act(async () => {
    setInputValue(capacityInputs[1], "3");
    capacityInputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    capacityInputs[1].dispatchEvent(new Event("change", { bubbles: true }));
  });

  expect(JSON.parse(String(new FormData(host).get("time_slots")))).toEqual([
    {
      start_time: "09:00",
      end_time: "10:00",
      capacity: 3,
    },
    {
      start_time: "10:00",
      end_time: "11:00",
      capacity: null,
    },
  ]);
});
