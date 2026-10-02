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
