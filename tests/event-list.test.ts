import { expect, it } from "vitest";
import { currentDenverWeek } from "@/lib/current-denver-week";
import {
  groupEventPage,
  openPresenterSlotCount,
  openPresenterSlotLabel,
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
  max_volunteers: null,
  participation_points_per_hour_at_end: null,
  event_types: { name: "Meeting" },
  event_branches: [],
  event_officers: [],
  ...extra,
});

it.each([
  [new Date("2026-10-05T18:00:00.000Z"), "2026-10-05", "2026-10-11"],
  [new Date("2026-10-11T18:00:00.000Z"), "2026-10-11", "2026-10-11"],
  [new Date("2026-10-12T05:59:00.000Z"), "2026-10-11", "2026-10-11"],
  [new Date("2026-10-12T06:00:00.000Z"), "2026-10-12", "2026-10-18"],
  [new Date("2026-10-05T05:59:00.000Z"), "2026-10-04", "2026-10-04"],
  [new Date("2026-10-05T06:00:00.000Z"), "2026-10-05", "2026-10-11"],
])("uses Denver week dates for %s", (instant, today, sunday) => {
  expect(currentDenverWeek(instant)).toEqual({ today, sunday });
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

it("accepts positive URL pages and falls back for malformed page values", () => {
  expect(eventListFiltersSchema.parse({ page: "2" }).page).toBe(2);
  expect(eventListFiltersSchema.parse({ page: "0" }).page).toBe(1);
  expect(eventListFiltersSchema.parse({ page: "2x" }).page).toBe(1);
  expect(eventListFiltersSchema.parse({ page: ["2", "3"] }).page).toBe(1);
});

it("shows archived Events only in the explicit Archived view", () => {
  const result = organizeEventList(
    [
      event(
        1,
        "Archived",
        "2026-10-01",
        "2026-10-01T16:00:00Z",
        "2026-10-01T17:00:00Z",
        {
          deleted_at: "2026-10-01T00:00:00Z",
        },
      ),
      event(
        2,
        "Active",
        "2026-10-08",
        "2026-10-08T16:00:00Z",
        "2026-10-08T17:00:00Z",
      ),
    ],
    "archived",
    new Date("2026-10-07T12:00:00Z"),
  );
  expect(result.view).toBe("single");
  if (result.view === "single")
    expect(result.events.map(({ deleted_at }) => deleted_at)).toEqual([
      "2026-10-01T00:00:00Z",
    ]);
});

it("keeps schedule order when own and other Events cross a page group boundary", () => {
  const items = [
    event(
      1,
      "Other first",
      "2026-10-06",
      "2026-10-07T01:00:00Z",
      "2026-10-07T02:00:00Z",
    ),
    event(
      2,
      "Own second",
      "2026-10-06",
      "2026-10-07T02:00:00Z",
      "2026-10-07T03:00:00Z",
      {
        event_officers: [{ officer_id: 7 }],
      },
    ),
    event(
      3,
      "Other next week",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
    ),
    event(
      4,
      "Waitlisted next week",
      "2026-10-12",
      "2026-10-12T18:00:00Z",
      "2026-10-12T19:00:00Z",
      {
        event_waitlist: [{ officer_id: 7 }],
      },
    ),
  ];
  const groups = groupEventPage(items, undefined, 7, now);
  expect(groups.map(({ label }) => label)).toEqual([
    "This week's events · Other events",
    "This week's events · Your events",
    "Upcoming events · Other events",
    "Upcoming events · Your events",
  ]);
  expect(groups.flatMap(({ events }) => events.map(({ id }) => id))).toEqual([
    1, 2, 3, 4,
  ]);
});

it("uses event IDs to break schedule ties in every selected view", () => {
  const tied = [
    event(
      1,
      "First",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
    ),
    event(
      2,
      "Second",
      "2026-10-12",
      "2026-10-12T17:00:00Z",
      "2026-10-12T18:00:00Z",
    ),
  ];
  expect(organizeEventList([...tied].reverse(), "upcoming", now)).toMatchObject(
    {
      events: [{ id: 1 }, { id: 2 }],
    },
  );
  expect(
    organizeEventList([...tied], "past", new Date("2026-10-13T00:00:00Z")),
  ).toMatchObject({
    events: [{ id: 2 }, { id: 1 }],
  });
});

it("counts open presenter slots only on upcoming open Sessions", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const session = {
    status: "upcoming",
    deleted_at: null,
    starts_at: "2026-10-21T23:00:00Z",
    participation_points_per_hour_at_end: null,
    event_types: { name: " Session " },
    presentation_slots: [
      { officer_id: 5 },
      { officer_id: null },
      { officer_id: 5 },
      { officer_id: null },
      { officer_id: null },
    ],
  };
  expect(openPresenterSlotCount(session, now)).toBe(3);
  expect(
    openPresenterSlotCount(
      { ...session, presentation_slots: [{ officer_id: 5 }] },
      now,
    ),
  ).toBe(0);
  expect(
    openPresenterSlotCount({ ...session, presentation_slots: [] }, now),
  ).toBe(0);
  expect(
    openPresenterSlotCount(
      { ...session, event_types: { name: "Workshop" } },
      now,
    ),
  ).toBe(0);
  expect(openPresenterSlotCount({ ...session, status: "cancelled" }, now)).toBe(
    0,
  );
  expect(
    openPresenterSlotCount(
      { ...session, deleted_at: "2026-10-19T00:00:00Z" },
      now,
    ),
  ).toBe(0);
  expect(
    openPresenterSlotCount(
      { ...session, participation_points_per_hour_at_end: 5 },
      now,
    ),
  ).toBe(0);
  expect(
    openPresenterSlotCount(session, Date.parse("2026-10-21T23:30:00Z")),
  ).toBe(0);
  expect(openPresenterSlotLabel(1)).toBe("1 presenter slot open");
  expect(openPresenterSlotLabel(3)).toBe("3 presenter slots open");
});
