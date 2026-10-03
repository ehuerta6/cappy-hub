import type { EventInput } from "@fullcalendar/react";

export type CalendarEventOccurrence = {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
};

export type CalendarTaskOccurrence = {
  id: number;
  title: string;
  due_date: string;
};

/** Maps canonical Events (or future event occurrences) into calendar entries. */
export function mapEventOccurrences(
  events: CalendarEventOccurrence[],
): EventInput[] {
  return events.map((event) => ({
    id: `event-${event.id}-${event.starts_at}`,
    title: event.name,
    start: event.starts_at,
    end: event.ends_at,
    allDay: false,
    url: `/events/${event.id}`,
    classNames: ["calendar-entry-event"],
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  }));
}

/** Maps canonical Tasks (or future task occurrences) without parsing SQL dates. */
export function mapTaskOccurrences(
  tasks: CalendarTaskOccurrence[],
): EventInput[] {
  return tasks.map((task) => ({
    id: `task-${task.id}-${task.due_date}`,
    title: task.title,
    start: task.due_date,
    allDay: true,
    url: `/tasks/${task.id}`,
    classNames: ["calendar-entry-task"],
    backgroundColor: "#b45309",
    borderColor: "#b45309",
  }));
}
