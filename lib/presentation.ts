import { denverParts } from "./event-time";

export function formatLabel(value: string) {
  const known: Record<string, string> = {
    icpc: "ICPC",
  };
  return (
    known[value.toLowerCase()] ??
    value
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

const dateOptions: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Denver",
};

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", dateOptions);
}

/** Format a SQL date without shifting it across a timezone boundary. */
export function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
  );
}

/** Format a Task SQL due date without shifting its Denver calendar date. */
export function formatTaskDueDate(value: string, now = new Date()) {
  const taskYear = Number(value.slice(0, 4));
  const currentDenverYear = Number(
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      timeZone: "America/Denver",
    }).format(now),
  );
  const formatted = formatCalendarDate(value);
  return taskYear === currentDenverYear
    ? formatted.replace(/, \d{4}$/, "")
    : formatted;
}

/** Format a SQL time without applying a timezone conversion to the clock time. */
export function formatTaskDueTime(value: string) {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (!match) return value;
  const [, hour, minute] = match;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, Number(hour), Number(minute))));
}

/** Format the Task's Denver calendar date and optional Denver wall-clock deadline. */
export function formatTaskDeadline(
  date: string,
  time?: string | null,
  now = new Date(),
) {
  return `${formatTaskDueDate(date, now)}${time ? ` · ${formatTaskDueTime(time)}` : ""}`;
}

export function formatEventFilterOption(name: string, eventDate: string) {
  return `${name} — ${formatCalendarDate(eventDate)}`;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    ...dateOptions,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Describe the record a notification opens without changing its behavior. */
export function formatNotificationDestination(entityType: string) {
  const destinations: Record<string, string> = {
    event: "Event",
    task: "Task",
    point: "Points",
    warning: "Officer profile",
  };
  return destinations[entityType] ?? "Notification";
}

/** Trim numeric scale noise from database-generated Point notifications. */
export function formatNotificationMessage(kind: string, message: string) {
  if (kind !== "point.changed") return message;
  const match = /^([+-]?\d+(?:\.\d+)?) Points$/.exec(message);
  if (!match) return message;
  const points = Number(match[1]);
  if (!Number.isFinite(points)) return message;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(points)} Points`;
}

const scheduleDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Denver",
});
const scheduleTime = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Denver",
});

/** Compact schedules always use El Paso time, including the calendar date. */
export function formatEventSchedule(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (denverParts(start).date !== denverParts(end).date)
    return `${scheduleDate.format(start)} · ${scheduleTime.format(start)}–${scheduleDate.format(end)} · ${scheduleTime.format(end)}`;
  const startParts = scheduleTime.formatToParts(start);
  const endParts = scheduleTime.formatToParts(end);
  const samePeriod =
    startParts.find((part) => part.type === "dayPeriod")?.value ===
    endParts.find((part) => part.type === "dayPeriod")?.value;
  const startTime = samePeriod
    ? startParts
        .filter((part) => part.type !== "dayPeriod")
        .map((part) => part.value)
        .join("")
        .trim()
    : scheduleTime.format(start);
  return `${scheduleDate.format(start)} · ${startTime}–${scheduleTime.format(end)}`;
}
