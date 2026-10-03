import type { EventInput } from "@fullcalendar/react";
import { formatCalendarDate, formatEventSchedule } from "@/lib/presentation";

export type CalendarEntryKind = "event" | "task";
export type CalendarEntry = EventInput & {
  extendedProps: { kind: CalendarEntryKind; description: string };
};

export function filterCalendarEntries(
  entries: CalendarEntry[],
  visible: Record<CalendarEntryKind, boolean>,
) {
  return entries.filter((entry) => visible[entry.extendedProps.kind]);
}

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
): CalendarEntry[] {
  return events.map((event) => ({
    id: `event-${event.id}-${event.starts_at}`,
    title: event.name,
    start: event.starts_at,
    end: event.ends_at,
    allDay: false,
    url: `/events/${event.id}`,
    className: "calendar-entry-event",
    color: "var(--info-bg)",
    contrastColor: "var(--info)",
    extendedProps: {
      kind: "event",
      description: `Event: ${event.name}, ${formatEventSchedule(event.starts_at, event.ends_at)} (America/Denver)`,
    },
  }));
}

/** Maps canonical Tasks (or future task occurrences) without parsing SQL dates. */
export function mapTaskOccurrences(
  tasks: CalendarTaskOccurrence[],
): CalendarEntry[] {
  return tasks.map((task) => ({
    id: `task-${task.id}-${task.due_date}`,
    title: task.title,
    start: task.due_date,
    allDay: true,
    url: `/tasks/${task.id}`,
    className: "calendar-entry-task",
    color: "var(--surface-muted)",
    contrastColor: "var(--foreground)",
    extendedProps: {
      kind: "task",
      description: `Task: ${task.title}, due ${formatCalendarDate(task.due_date)}`,
    },
  }));
}
