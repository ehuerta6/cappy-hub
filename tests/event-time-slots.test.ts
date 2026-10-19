import { expect, it } from "vitest";
import {
  eventTimeSlotsInputSchema,
  timeSlotBoundsError,
} from "@/app/(protected)/events/validation";
import { calculateEqualSlots } from "@/app/(protected)/events/time-slots-editor";

const slots = (value: unknown) => eventTimeSlotsInputSchema.safeParse(value);

it("accepts optional capacity and custom gaps within the Event schedule", () => {
  const result = slots(
    JSON.stringify([
      { start_time: "10:00", end_time: "11:00", capacity: 4 },
      { start_time: "12:00", end_time: "13:30", capacity: null },
    ]),
  );
  expect(result.success).toBe(true);
  if (result.success)
    expect(timeSlotBoundsError(result.data, "09:00", "14:00")).toBeUndefined();
});

it("rejects overlapping, out-of-bounds, and empty slot configurations", () => {
  const overlapping = slots(
    JSON.stringify([
      { start_time: "10:00", end_time: "12:00", capacity: null },
      { start_time: "11:30", end_time: "13:00", capacity: null },
    ]),
  );
  expect(overlapping.success).toBe(true);
  if (overlapping.success)
    expect(timeSlotBoundsError(overlapping.data, "09:00", "14:00")).toBe(
      "Time Slots cannot overlap",
    );

  const outside = slots(
    JSON.stringify([
      { start_time: "08:30", end_time: "10:00", capacity: null },
    ]),
  );
  expect(outside.success).toBe(true);
  if (outside.success)
    expect(timeSlotBoundsError(outside.data, "09:00", "14:00")).toMatch(
      /fit within the Event schedule/,
    );
  expect(slots("[]").success).toBe(false);
});

it("treats null as an Event without Time Slots", () => {
  expect(slots("null")).toEqual({ success: true, data: null });
  expect(timeSlotBoundsError(null, "09:00", "10:00")).toBeUndefined();
});

it("divides an Event into equal intervals", () => {
  expect(calculateEqualSlots("09:00", "12:00", 3)).toEqual([
    { start_time: "09:00", end_time: "10:00", capacity: null },
    { start_time: "10:00", end_time: "11:00", capacity: null },
    { start_time: "11:00", end_time: "12:00", capacity: null },
  ]);
  expect(calculateEqualSlots("09:00", "10:01", 3)).toEqual([]);
});
