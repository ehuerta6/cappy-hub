import { expect, it } from "vitest";
import {
  currentEventWeek,
  organizeEventList,
  type EventListItem,
} from "@/lib/event-list";
import { eventListFiltersSchema } from "@/app/(protected)/events/filter-validation";

const now = new Date("2026-10-07T00:00:00.000Z"); // Tuesday, 6 PM in Denver

const event = (
  id: number,
  name: string,
  eventDate: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<EventListItem> = {},
): EventListItem => ({
  id,
  name,
  event_date: eventDate,
  starts_at: startsAt,
  ends_at: endsAt,
  status: "scheduled",
  deleted_at: null,
  participation_points_per_hour_at_end: null,
  event_types: { name: "Meeting" },
  event_branches: [],
  event_officers: [],
  ...extra,
});

it.each([
  [new Date("2026-10-05T18:00:00.000Z"), "2026-10-05", "2026-10-11"],
  [new Date("2026-10-11T18:00:00.000Z"), "2026-10-11", "2026-10-11"],
  [new Date("2026-10-05T05:59:00.000Z"), "2026-10-04", "2026-10-04"],
  [new Date("2026-10-05T06:00:00.000Z"), "2026-10-05", "2026-10-11"],
])("uses Denver week dates for %s", (instant, today, sunday) => {
  expect(currentEventWeek(instant)).toEqual({ today, sunday });
});

it("groups this week and upcoming events, excludes ended/cancelled/removed, and sorts nearest first", () => {
  const rows = [
    event(
      1,
      "Later today",
      "2026-10-06",
      "2026-10-07T01:00:00Z",
      "2026-10-07T02:00:00Z",
    ),
    event(
      2,
      "Happening now",
      "2026-10-06",
      "2026-10-06T23:45:00Z",
      "2026-10-07T00:15:00Z",
      { event_officers: [{ officer_id: 7 }] },
    ),
    event(
      3,
      "Next week",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
    ),
    event(
      4,
      "Ended earlier today",
      "2026-10-06",
      "2026-10-06T21:00:00Z",
      "2026-10-06T22:00:00Z",
    ),
    event(
      5,
      "Cancelled",
      "2026-10-07",
      "2026-10-07T17:00:00Z",
      "2026-10-07T18:00:00Z",
      { status: "cancelled" },
    ),
    event(
      6,
      "Removed",
      "2026-10-07",
      "2026-10-07T17:00:00Z",
      "2026-10-07T18:00:00Z",
      { deleted_at: "2026-10-01T00:00:00Z" },
    ),
  ];

  const result = organizeEventList(rows, undefined, now);
  expect(result.view).toBe("current");
  if (result.view !== "current") return;
  expect(result.thisWeek.map(({ name }) => name)).toEqual([
    "Happening now",
    "Later today",
  ]);
  expect(result.upcoming.map(({ name }) => name)).toEqual(["Next week"]);
  expect(result.thisWeek[0].event_officers).toEqual([{ officer_id: 7 }]);
});

it("shows ended Events only in explicit Past, newest ended first", () => {
  const rows = [
    event(
      1,
      "Earlier",
      "2026-10-06",
      "2026-10-06T20:00:00Z",
      "2026-10-06T21:00:00Z",
    ),
    event(
      2,
      "Recently ended",
      "2026-10-06",
      "2026-10-06T22:00:00Z",
      "2026-10-06T23:30:00Z",
    ),
    event(
      3,
      "Still happening",
      "2026-10-06",
      "2026-10-06T23:45:00Z",
      "2026-10-07T00:15:00Z",
    ),
    event(
      4,
      "Cancelled history",
      "2026-10-06",
      "2026-10-06T20:00:00Z",
      "2026-10-06T21:00:00Z",
      { status: "cancelled" },
    ),
  ];

  const result = organizeEventList(rows, "past", now);
  expect(result.view).toBe("single");
  if (result.view !== "single") return;
  expect(result.events.map(({ name }) => name)).toEqual([
    "Recently ended",
    "Earlier",
  ]);
});

it("shows only cancelled Events in the explicit Cancelled view", () => {
  const rows = [
    event(
      1,
      "Active",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
    ),
    event(
      2,
      "Cancelled",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
      { status: "cancelled" },
    ),
    event(
      3,
      "Removed cancellation",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
      { status: "cancelled", deleted_at: "2026-10-01T00:00:00Z" },
    ),
  ];

  const result = organizeEventList(rows, "cancelled", now);
  expect(result.view).toBe("single");
  if (result.view !== "single") return;
  expect(result.events.map(({ name }) => name)).toEqual(["Cancelled"]);
});

it("keeps Happening and Upcoming status filters active-only", () => {
  const rows = [
    event(
      1,
      "Happening",
      "2026-10-06",
      "2026-10-06T23:45:00Z",
      "2026-10-07T00:15:00Z",
    ),
    event(
      2,
      "Future",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
    ),
    event(
      3,
      "Ended",
      "2026-10-06",
      "2026-10-06T20:00:00Z",
      "2026-10-06T21:00:00Z",
    ),
    event(
      4,
      "Cancelled",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
      { status: "cancelled" },
    ),
    event(
      5,
      "Removed",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
      { deleted_at: "2026-10-01T00:00:00Z" },
    ),
  ];

  const happening = organizeEventList(rows, "happening", now);
  const upcoming = organizeEventList(rows, "upcoming", now);
  expect(
    happening.view === "single" && happening.events.map(({ name }) => name),
  ).toEqual(["Happening"]);
  expect(
    upcoming.view === "single" && upcoming.events.map(({ name }) => name),
  ).toEqual(["Future"]);
});

it("does not accept Removed as an Event list status", () => {
  expect(
    eventListFiltersSchema.parse({ status: "removed" }).status,
  ).toBeUndefined();
});
