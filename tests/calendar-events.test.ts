import { describe, expect, it } from "vitest";
import {
  mapEventOccurrences,
  mapTaskOccurrences,
  filterCalendarEntries,
} from "@/app/(protected)/calendar/calendar-events";

describe("calendar entry mapping", () => {
  it("maps an Event occurrence to its timed schedule and detail page", () => {
    expect(
      mapEventOccurrences([
        {
          id: 12,
          name: "Club meeting",
          starts_at: "2026-10-08T23:00:00.000Z",
          ends_at: "2026-10-09T01:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        id: "event-12-2026-10-08T23:00:00.000Z",
        title: "Club meeting",
        start: "2026-10-08T23:00:00.000Z",
        end: "2026-10-09T01:00:00.000Z",
        allDay: false,
        url: "/events/12",
        className: "calendar-entry-event",
        color: "var(--info-bg)",
        contrastColor: "var(--info)",
        extendedProps: {
          kind: "event",
          description:
            "Event: Club meeting, Oct 8 · 5:00–7:00 PM (America/Denver)",
        },
      },
    ]);
  });

  it("maps a Task due date as an all-day entry without timezone conversion", () => {
    expect(
      mapTaskOccurrences([
        { id: 9, title: "Prepare slides", due_date: "2026-10-08" },
      ]),
    ).toEqual([
      {
        id: "task-9-2026-10-08",
        title: "Prepare slides",
        start: "2026-10-08",
        allDay: true,
        url: "/tasks/9",
        className: "calendar-entry-task",
        color: "var(--surface-muted)",
        contrastColor: "var(--foreground)",
        extendedProps: {
          kind: "task",
          description: "Task: Prepare slides, due Oct 8, 2026",
        },
      },
    ]);
  });
});

describe("Calendar presentation", () => {
  const events = mapEventOccurrences([
    {
      id: 1,
      name: "Summer",
      starts_at: "2026-07-09T00:00:00Z",
      ends_at: "2026-07-09T01:00:00Z",
    },
    {
      id: 2,
      name: "Winter",
      starts_at: "2026-12-09T01:00:00Z",
      ends_at: "2026-12-09T02:00:00Z",
    },
  ]);
  const tasks = mapTaskOccurrences([
    { id: 3, title: "DST start", due_date: "2026-03-08" },
    { id: 4, title: "DST end", due_date: "2026-11-01" },
    { id: 5, title: "Year boundary", due_date: "2027-01-01" },
  ]);

  it("keeps Events in Denver on both sides of DST and the UTC date boundary", () => {
    expect(events[0].extendedProps.description).toContain(
      "Jul 8 · 6:00–7:00 PM (America/Denver)",
    );
    expect(events[1].extendedProps.description).toContain(
      "Dec 8 · 6:00–7:00 PM (America/Denver)",
    );
    expect(events[0].start).toBe("2026-07-09T00:00:00Z");
    expect(events[1].start).toBe("2026-12-09T01:00:00Z");
  });

  it("keeps Task dates literal across DST and year boundaries", () => {
    expect(tasks.map((task) => task.start)).toEqual([
      "2026-03-08",
      "2026-11-01",
      "2027-01-01",
    ]);
    expect(tasks.map((task) => task.extendedProps.description)).toEqual([
      "Task: DST start, due Mar 8, 2026",
      "Task: DST end, due Nov 1, 2026",
      "Task: Year boundary, due Jan 1, 2027",
    ]);
    expect(tasks.every((task) => task.allDay && !task.end)).toBe(true);
  });

  it("filters either type or both without modifying source entries", () => {
    const entries = [...events, ...tasks];
    expect(filterCalendarEntries(entries, { event: true, task: true })).toEqual(
      entries,
    );
    expect(
      filterCalendarEntries(entries, { event: true, task: false }),
    ).toEqual(events);
    expect(
      filterCalendarEntries(entries, { event: false, task: true }),
    ).toEqual(tasks);
    expect(
      filterCalendarEntries(entries, { event: false, task: false }),
    ).toEqual([]);
    expect(entries).toHaveLength(5);
    expect(filterCalendarEntries([], { event: true, task: true })).toEqual([]);
  });
});
