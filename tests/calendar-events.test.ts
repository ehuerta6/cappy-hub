import { describe, expect, it } from "vitest";
import {
  mapEventOccurrences,
  mapTaskOccurrences,
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
        classNames: ["calendar-entry-event"],
        backgroundColor: "#2563eb",
        borderColor: "#2563eb",
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
        classNames: ["calendar-entry-task"],
        backgroundColor: "#b45309",
        borderColor: "#b45309",
      },
    ]);
  });
});
