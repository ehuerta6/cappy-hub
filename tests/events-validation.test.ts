import { expect, it } from "vitest";
import {
  restoreEventInputSchema,
  saveEventInputSchema,
} from "@/app/(protected)/events/validation";

it("validates Event shape and keeps Event range boundaries", () => {
  const validEvent = {
    id: "",
    name: " Club meeting ",
    description: "Agenda",
    event_type_id: "2",
    location: "Campus",
    event_date: "2026-10-12",
    start_time: "06:00",
    end_time: "23:59",
    branches: ["-4", "2"],
    slides_url: "",
    meeting_notes_url: "",
  };
  expect(saveEventInputSchema.safeParse(validEvent).success).toBe(true);
  expect(
    saveEventInputSchema.safeParse({ ...validEvent, event_date: "10/12/2026" })
      .success,
  ).toBe(false);
  expect(
    saveEventInputSchema.safeParse({ ...validEvent, start_time: "05:59" })
      .success,
  ).toBe(false);
  expect(
    saveEventInputSchema.safeParse({ ...validEvent, name: " " }).success,
  ).toBe(false);
});

it("validates a restore request with a safe Event ID", () => {
  expect(restoreEventInputSchema.safeParse({ event_id: "-12" }).success).toBe(
    true,
  );
  expect(restoreEventInputSchema.safeParse({ event_id: "0" }).success).toBe(
    true,
  );
  expect(restoreEventInputSchema.safeParse({ event_id: "12x" }).success).toBe(
    false,
  );
});
