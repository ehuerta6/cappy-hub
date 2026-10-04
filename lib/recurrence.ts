import { RRule } from "rrule";
import { Temporal } from "temporal-polyfill";

export type RecurrenceFrequency = "daily" | "weekly";
export type RecurrenceWeekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export type RecurrenceInput = {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: RecurrenceWeekday[];
  count: number | null;
  until: string | null;
};

export type RecurrenceEditScope = "following" | "series";

/** Resolves the first date for an edit preview and its matching server mutation. */
export function recurrenceEditStart({
  scope,
  seriesStart,
  selectedKey,
  selectedDate,
  editedDate,
}: {
  scope: RecurrenceEditScope;
  seriesStart: string;
  selectedKey: string;
  selectedDate: string;
  editedDate: string;
}) {
  const start = scope === "following" ? selectedKey : seriesStart;
  const offset = Temporal.PlainDate.from(selectedDate).until(
    Temporal.PlainDate.from(editedDate),
  ).days;
  return Temporal.PlainDate.from(start).add({ days: offset }).toString();
}

const rruleDate = (date: Temporal.PlainDate) =>
  new Date(Date.UTC(date.year, date.month - 1, date.day, 12));

/** Expands bounded calendar dates. RRule dates are UTC carriers for PlainDate only. */
export function expandRecurrenceDates(
  startDate: string,
  input: RecurrenceInput,
  allowSingle = false,
): string[] {
  const start = Temporal.PlainDate.from(startDate);
  if (
    !Number.isInteger(input.interval) ||
    input.interval < 1 ||
    input.interval > 52
  )
    throw new Error("Choose a repeat interval from 1 through 52");
  if ((input.count === null) === (input.until === null))
    throw new Error("Choose either an occurrence count or an end date");
  if (
    input.count !== null &&
    (!Number.isInteger(input.count) ||
      input.count < (allowSingle ? 1 : 2) ||
      input.count > 500)
  )
    throw new Error("Choose between 2 and 500 occurrences");

  const selected = [...new Set(input.weekdays)];
  if (input.frequency === "daily" && selected.length)
    throw new Error("Choose weekdays only for weekly recurrence");
  if (input.frequency === "weekly" && !selected.length)
    throw new Error("Select at least one weekday");
  if (
    input.frequency === "weekly" &&
    !selected.includes(
      start.dayOfWeek === 7
        ? "SU"
        : (["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const)[
            start.dayOfWeek - 1
          ],
    )
  )
    throw new Error("The first date must be one of the selected weekdays");

  const untilDate = input.until ? Temporal.PlainDate.from(input.until) : null;
  if (untilDate && Temporal.PlainDate.compare(untilDate, start) < 0)
    throw new Error("The end date must be on or after the first date");

  const parsedOptions = RRule.parseString(canonicalRecurrenceRule(input));
  const rule = new RRule({
    ...parsedOptions,
    dtstart: rruleDate(start),
    ...(untilDate
      ? {
          until: new Date(
            Date.UTC(
              untilDate.year,
              untilDate.month - 1,
              untilDate.day,
              23,
              59,
              59,
            ),
          ),
        }
      : {}),
  });
  const dates = rule.all().map((date) => date.toISOString().slice(0, 10));
  if (!dates.length || dates[0] !== startDate || dates.length > 500)
    throw new Error(
      "This recurrence must include its first date and no more than 500 occurrences",
    );
  return dates;
}

/** Returns the RFC-compatible recurrence line; DTSTART and timezone are stored separately. */
export function canonicalRecurrenceRule(input: RecurrenceInput) {
  const parts = [
    `FREQ=${input.frequency === "daily" ? "DAILY" : "WEEKLY"}`,
    `INTERVAL=${input.interval}`,
  ];
  if (input.weekdays.length)
    parts.push(`BYDAY=${[...new Set(input.weekdays)].join(",")}`);
  if (input.count !== null) parts.push(`COUNT=${input.count}`);
  else if (input.until) parts.push(`UNTIL=${input.until.replaceAll("-", "")}`);
  return RRule.fromString(`RRULE:${parts.join(";")}`).toString();
}

/** Reads only the canonical MVP rule format emitted by this module. */
export function recurrenceFromRule(rule: string): RecurrenceInput {
  const options = RRule.parseString(rule);
  const days = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
  const weekdays =
    options.byweekday === undefined
      ? []
      : Array.isArray(options.byweekday)
        ? options.byweekday
        : [options.byweekday];
  return {
    frequency: options.freq === RRule.DAILY ? "daily" : "weekly",
    interval: options.interval ?? 1,
    weekdays: weekdays.flatMap((day) =>
      day === null
        ? []
        : [
            typeof day === "string"
              ? day
              : days[typeof day === "number" ? day : day.weekday],
          ],
    ),
    count: options.count ?? null,
    until: options.until?.toISOString().slice(0, 10) ?? null,
  };
}
