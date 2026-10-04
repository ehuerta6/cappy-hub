import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecurrenceFields } from "@/components/recurrence-fields";
import {
  expandRecurrenceDates,
  recurrenceEditStart,
  type RecurrenceEditScope,
  type RecurrenceInput,
} from "@/lib/recurrence";

const renderFields = (
  recurrence: RecurrenceInput,
  firstDate = "2026-10-06",
  recordType: "Event" | "Task" = "Event",
  editPreview?: {
    scope: RecurrenceEditScope;
    seriesStart: string;
    selectedKey: string;
    selectedDate: string;
  },
  editing = false,
) =>
  renderToStaticMarkup(
    <RecurrenceFields
      recordType={recordType}
      firstDate={firstDate}
      initial={editing ? recurrence : undefined}
      editPreview={editPreview}
      values={{
        recurrence_frequency: recurrence.frequency,
        recurrence_interval: String(recurrence.interval),
        recurrence_weekdays: recurrence.weekdays,
        recurrence_end_mode: recurrence.count === null ? "until" : "count",
        recurrence_count: String(recurrence.count ?? ""),
        recurrence_until: recurrence.until ?? "",
      }}
    />,
  );

const labelDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

it("previews daily occurrences from the canonical recurrence expansion", () => {
  const recurrence: RecurrenceInput = {
    frequency: "daily",
    interval: 2,
    weekdays: [],
    count: 3,
    until: null,
  };
  const html = renderFields(recurrence);
  const dates = expandRecurrenceDates("2026-10-06", recurrence);

  expect(html).toContain("every");
  expect(html).toContain("days");
  expect(html).toContain("Occurrences (records generated; 2–500)");
  expect(html).toContain("3 occurrences · Last occurrence:");
  for (const date of dates) expect(html).toContain(labelDate(date));
});

it("labels weekly recurrence in weeks and previews a normal weekly schedule", () => {
  const recurrence: RecurrenceInput = {
    frequency: "weekly",
    interval: 1,
    weekdays: ["TU"],
    count: 4,
    until: null,
  };
  const html = renderFields(recurrence);
  const dates = expandRecurrenceDates("2026-10-06", recurrence);

  expect(html).toContain("week</span>");
  for (const date of dates) expect(html).toContain(labelDate(date));
});

it("previews the inclusive end date and suppresses an end date before the start", () => {
  const recurrence: RecurrenceInput = {
    frequency: "weekly",
    interval: 1,
    weekdays: ["TU"],
    count: null,
    until: "2026-10-27",
  };
  const dates = expandRecurrenceDates("2026-10-06", recurrence);
  const html = renderFields(recurrence);

  expect(dates).toEqual([
    "2026-10-06",
    "2026-10-13",
    "2026-10-20",
    "2026-10-27",
  ]);
  for (const date of dates) expect(html).toContain(labelDate(date));

  const invalid = renderFields({ ...recurrence, until: "2026-10-05" });
  expect(invalid).toContain("Complete valid recurrence details");
  expect(invalid).not.toContain("<li>");
});

it("makes the 15-week regression schedule and its long span visible", () => {
  const recurrence: RecurrenceInput = {
    frequency: "weekly",
    interval: 15,
    weekdays: ["TU"],
    count: 10,
    until: null,
  };
  const html = renderFields(recurrence);
  const dates = expandRecurrenceDates("2026-10-06", recurrence);

  expect(html).toContain("weeks</span>");
  expect(html).toContain("Showing the first 5 dates of 10.");
  expect(html).toContain("10 occurrences · Last occurrence:");
  expect(html).toContain(labelDate(dates[1]));
  expect(html).toContain(labelDate(dates.at(-1)!));
  expect(dates.at(-1)).toBe("2029-05-08");
});

it("does not throw or show an authoritative schedule for incomplete fields", () => {
  const recurrence: RecurrenceInput = {
    frequency: "weekly",
    interval: 1,
    weekdays: [],
    count: 4,
    until: null,
  };

  expect(() => renderFields(recurrence, "")).not.toThrow();
  const html = renderFields(recurrence, "");
  expect(html).toContain("Complete valid recurrence details");
  expect(html).not.toContain("<li>");
});

it("does not guess a schedule when an edit scope lacks canonical context", () => {
  const recurrence: RecurrenceInput = {
    frequency: "weekly",
    interval: 1,
    weekdays: ["TU"],
    count: 4,
    until: null,
  };
  const html = renderFields(recurrence, "2027-01-22", "Event", undefined, true);

  expect(html).toContain(
    "A schedule preview is unavailable for this edit scope.",
  );
  expect(html).not.toContain("<li>");
});

it("previews supported recurring edits from the canonical scope start", () => {
  const recurrence: RecurrenceInput = {
    frequency: "weekly",
    interval: 1,
    weekdays: ["TH"],
    count: 4,
    until: null,
  };
  const editPreview = {
    scope: "following" as const,
    seriesStart: "2026-10-06",
    selectedKey: "2027-01-19",
    selectedDate: "2027-01-20",
  };
  const html = renderFields(
    recurrence,
    "2027-01-22",
    "Event",
    editPreview,
    true,
  );
  const start = recurrenceEditStart({
    ...editPreview,
    editedDate: "2027-01-22",
  });
  const dates = expandRecurrenceDates(start, recurrence, true);

  for (const date of dates) expect(html).toContain(labelDate(date));
});

it("uses the same recurrence preview behavior for Tasks as for Events", () => {
  const recurrence: RecurrenceInput = {
    frequency: "daily",
    interval: 2,
    weekdays: [],
    count: 3,
    until: null,
  };

  const eventHtml = renderFields(recurrence, "2026-10-06", "Event");
  const taskHtml = renderFields(recurrence, "2026-10-06", "Task");
  for (const date of expandRecurrenceDates("2026-10-06", recurrence)) {
    expect(eventHtml).toContain(labelDate(date));
    expect(taskHtml).toContain(labelDate(date));
  }
  expect(taskHtml).toContain("Each Task keeps");
});
