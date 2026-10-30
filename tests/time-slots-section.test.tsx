import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import TimeSlotsSection, {
  type EventTimeSlotWithRoster,
} from "@/app/(protected)/events/time-slots-section";

const historicalSlots: EventTimeSlotWithRoster[] = [
  {
    id: 101,
    starts_at: "2026-10-22T15:00:00.000Z",
    ends_at: "2026-10-22T15:30:00.000Z",
    capacity: 1,
    event_time_slot_officers: [
      { officer_id: 8, officers: { id: 8, name: "Full Officer" } },
    ],
  },
  {
    id: 102,
    starts_at: "2026-10-22T15:30:00.000Z",
    ends_at: "2026-10-22T16:00:00.000Z",
    capacity: null,
    event_time_slot_officers: [
      {
        officer_id: 9,
        officers: { id: 9, name: "Removed Officer" },
        event_officers: { removed_at: "2026-10-30T12:00:00Z" },
      },
    ],
  },
];

it("shows historical slots, assigned Officers, and preserved removed signups", () => {
  const html = renderToStaticMarkup(
    <TimeSlotsSection slots={historicalSlots} />,
  );

  expect(html).toContain("Historical Time Slots (2)");
  expect(html).toContain("Slot 1: 09:00–09:30");
  expect(html).toContain("Historical capacity: 1");
  expect(html).toContain("Full Officer");
  expect(html).toContain("Removed Officer");
  expect(html).toContain("Event signup removed");
});

it("offers no active Time Slot signup or assignment controls", () => {
  const html = renderToStaticMarkup(
    <TimeSlotsSection slots={historicalSlots} />,
  );

  expect(html).not.toContain("checkbox");
  expect(html).not.toContain("button");
  expect(html).not.toContain("Choose Time Slots");
  expect(html).not.toContain("Add to slot");
});

it("does not render a historical section without historical slot records", () => {
  expect(renderToStaticMarkup(<TimeSlotsSection slots={[]} />)).toBe("");
});
