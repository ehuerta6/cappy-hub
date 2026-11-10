import { expect, it } from "vitest";
import {
  formatNotificationDestination,
  formatNotificationMessage,
} from "@/lib/presentation";

it("removes insignificant trailing zeros from Point notification messages", () => {
  expect(formatNotificationMessage("point.changed", "2.00000 Points")).toBe(
    "2 Points",
  );
  expect(formatNotificationMessage("point.changed", "-2.250000 Points")).toBe(
    "-2.25 Points",
  );
  expect(formatNotificationMessage("event.changed", "2.00000 Points")).toBe(
    "2.00000 Points",
  );
});

it.each([
  ["event", "Event"],
  ["task", "Task"],
  ["point", "Points"],
  ["warning", "Officer profile"],
  ["unknown", "Notification"],
])("labels the %s notification destination", (entityType, label) => {
  expect(formatNotificationDestination(entityType)).toBe(label);
});
