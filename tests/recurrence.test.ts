import { expect, it } from "vitest";
import { denverParts, denverTimestamp } from "@/lib/event-time";
import {
  mapEventOccurrences,
  mapTaskOccurrences,
} from "@/app/(protected)/calendar/calendar-events";
import {
  canonicalRecurrenceRule,
  expandRecurrenceDates,
  type RecurrenceInput,
} from "@/lib/recurrence";

const recurrence = (values: Partial<RecurrenceInput>): RecurrenceInput => ({
  frequency: "daily",
  interval: 1,
  weekdays: [],
  count: 3,
  until: null,
  ...values,
});

it("expands daily recurrence and includes the first date", () => {
  expect(expandRecurrenceDates("2026-10-01", recurrence({}))).toEqual([
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
  ]);
});

it("expands weekly selected weekdays and intervals", () => {
  expect(
    expandRecurrenceDates(
      "2026-10-05",
      recurrence({
        frequency: "weekly",
        interval: 2,
        weekdays: ["MO", "WE"],
        count: 5,
      }),
    ),
  ).toEqual([
    "2026-10-05",
    "2026-10-07",
    "2026-10-19",
    "2026-10-21",
    "2026-11-02",
  ]);
});

it("honors inclusive end-date and count boundaries", () => {
  expect(
    expandRecurrenceDates(
      "2026-10-01",
      recurrence({ count: null, until: "2026-10-04" }),
    ),
  ).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  expect(() =>
    expandRecurrenceDates(
      "2026-10-01",
      recurrence({ count: 2, until: "2026-10-04" }),
    ),
  ).toThrow("either an occurrence count or an end date");
});

it("stores a canonical bounded RFC recurrence line", () => {
  expect(
    canonicalRecurrenceRule(
      recurrence({
        frequency: "weekly",
        interval: 2,
        weekdays: ["MO", "WE"],
        count: 8,
      }),
    ),
  ).toBe("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=8");
});

it("keeps the intended Denver wall time across spring DST", () => {
  const dates = expandRecurrenceDates("2026-03-06", recurrence({ count: 5 }));
  const starts = dates.map((date) => denverTimestamp(date, "10:00"));
  expect(starts.every(Boolean)).toBe(true);
  expect(starts.map((start) => denverParts(start!).time)).toEqual([
    "10:00",
    "10:00",
    "10:00",
    "10:00",
    "10:00",
  ]);
  expect(starts[1]).toContain("T17:00:00");
  expect(starts[2]).toContain("T16:00:00");
});

it("keeps the intended Denver wall time as DST ends", () => {
  const dates = expandRecurrenceDates("2026-10-31", recurrence({ count: 3 }));
  const starts = dates.map((date) => denverTimestamp(date, "10:00"));
  expect(starts.map((start) => denverParts(start!).time)).toEqual([
    "10:00",
    "10:00",
    "10:00",
  ]);
  expect(starts[0]).toContain("T16:00:00");
  expect(starts[2]).toContain("T17:00:00");
});

it("renders independently materialized Event occurrences in the calendar mapper", () => {
  const entries = mapEventOccurrences([
    {
      id: 41,
      name: "Workshop",
      starts_at: "2026-10-05T16:00:00Z",
      ends_at: "2026-10-05T17:00:00Z",
    },
    {
      id: 42,
      name: "Workshop",
      starts_at: "2026-10-12T16:00:00Z",
      ends_at: "2026-10-12T17:00:00Z",
    },
  ]);
  expect(entries.map((entry) => entry.url)).toEqual([
    "/events/41",
    "/events/42",
  ]);
  expect(entries[0].id).not.toBe(entries[1].id);
});

it("maps Task occurrences as unchanged date-only calendar entries", () => {
  expect(
    mapTaskOccurrences([{ id: 34, title: "Publish", due_date: "2026-03-08" }]),
  ).toEqual([
    expect.objectContaining({
      id: "task-34-2026-03-08",
      start: "2026-03-08",
      allDay: true,
    }),
  ]);
});
