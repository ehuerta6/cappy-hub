import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { recurrenceMutation } from "@/lib/recurrence-mutation";
import { recurrenceFromRule, expandRecurrenceDates } from "@/lib/recurrence";
import { denverTimestamp, denverParts } from "@/lib/event-time";
import { RecurrenceScope } from "@/components/recurrence-scope";

const form = () => {
  const data = new FormData();
  data.set("scope", "following");
  data.set("recurrence_series_id", "12");
  data.set("recurrence_revision", "0");
  data.set("mutation_request_key", "00000000-0000-4000-8000-000000000068");
  return data;
};
const query = (value: unknown) => {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: value, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
};
const from = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ from } as never);
});

it("sends only dirty fields and never copies independent workflow fields", async () => {
  const data = form();
  data.append("edited_fields", "description");
  const args = await recurrenceMutation("task", 42, data, "edit", {
    title: "Untouched override",
    description: "Changed",
    points: 3,
    approval_required: true,
  });
  expect(args.p_patch).toEqual({ description: "Changed" });
  expect(args.p_scope).toBe("following");
  expect(from).not.toHaveBeenCalled();
});

it("retains one-occurrence date exceptions without changing canonical recurrence", async () => {
  const data = form();
  data.set("scope", "occurrence");
  data.append("edited_fields", "due_date");
  expect(
    await recurrenceMutation("task", 42, data, "edit", {
      due_date: "2026-11-01",
    }),
  ).toMatchObject({
    p_scope: "occurrence",
    p_patch: { due_date: "2026-11-01" },
  });
  expect(from).not.toHaveBeenCalled();
});

it("shifts following Task dates using PlainDate and the remaining canonical count", async () => {
  from.mockImplementation((table) =>
    query(
      table === "task_series"
        ? {
            starts_on: "2026-10-30",
            recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=4",
          }
        : { recurrence_key: "2026-10-31", due_date: "2026-10-31" },
    ),
  );
  const data = form();
  data.append("edited_fields", "due_date");
  expect(
    await recurrenceMutation("task", 42, data, "edit", {
      due_date: "2026-11-01",
    }),
  ).toMatchObject({
    p_rule: "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3",
    p_dates: ["2026-11-01", "2026-11-02", "2026-11-03"],
    p_patch: {},
  });
});

it("all-occurrence date edits shift the canonical first date by the selected row difference", async () => {
  from.mockImplementation((table) =>
    query(
      table === "event_series"
        ? {
            starts_on: "2026-10-30",
            recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=4",
          }
        : { recurrence_key: "2026-11-01", event_date: "2026-11-01" },
    ),
  );
  const data = form();
  data.set("scope", "series");
  data.append("edited_fields", "event_date");
  const args = await recurrenceMutation("event", 42, data, "edit", {
    event_date: "2026-11-02",
  });
  expect(args.p_dates).toEqual([
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
    "2026-11-03",
  ]);
  const timestamps = args.p_dates!.map((date) =>
    denverTimestamp(date, "12:00")!,
  );
  expect(timestamps.map((date) => denverParts(date).time)).toEqual([
    "12:00",
    "12:00",
    "12:00",
    "12:00",
  ]);
  expect(timestamps[0]).toContain("T18:00");
  expect(timestamps[1]).toContain("T19:00");
});

it("validates changed weekly recurrence and honors the following boundary", async () => {
  from.mockImplementation((table) =>
    query(
      table === "task_series"
        ? {
            starts_on: "2026-10-05",
            recurrence_rule: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;COUNT=5",
          }
        : { recurrence_key: "2026-10-12", due_date: "2026-10-12" },
    ),
  );
  const data = form();
  data.set("change_recurrence", "on");
  data.set("recurrence_frequency", "weekly");
  data.set("recurrence_interval", "2");
  data.append("recurrence_weekdays", "MO");
  data.append("recurrence_weekdays", "WE");
  data.set("recurrence_count", "3");
  const args = await recurrenceMutation("task", 42, data, "edit");
  expect(args.p_dates).toEqual(["2026-10-12", "2026-10-14", "2026-10-26"]);
  expect(args.p_rule).toBe("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=3");
});

it("rejects malformed scope and edited-field names before RPC preparation", async () => {
  const data = form();
  data.set("scope", "everything");
  await expect(
    recurrenceMutation("event", 42, data, "remove"),
  ).rejects.toThrow();
  data.set("scope", "series");
  data.append("edited_fields", "assignee");
  await expect(
    recurrenceMutation("task", 42, data, "edit", { title: "Title" }),
  ).rejects.toThrow("Invalid recurrence edit fields");
});

it("reads count and UNTIL rules without changing Task calendar dates", () => {
  const input = recurrenceFromRule(
    "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261021",
  );
  expect(input).toEqual({
    frequency: "weekly",
    interval: 2,
    weekdays: ["MO", "WE"],
    count: null,
    until: "2026-10-21",
  });
  expect(expandRecurrenceDates("2026-10-05", input)).toEqual([
    "2026-10-05",
    "2026-10-07",
    "2026-10-19",
    "2026-10-21",
  ]);
});

it("supports a one-occurrence historical segment while preserving creation's minimum", () => {
  const input = recurrenceFromRule(
    "RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=20261005",
  );
  expect(expandRecurrenceDates("2026-10-05", input, true)).toEqual([
    "2026-10-05",
  ]);
  expect(() =>
    expandRecurrenceDates("2026-10-05", { ...input, count: 1, until: null }),
  ).toThrow();
});

it("renders the three scopes with occurrence selected by default", () => {
  const markup = renderToStaticMarkup(
    createElement(RecurrenceScope, {
      recordType: "Task",
      requestKey: "00000000-0000-4000-8000-000000000068",
      series: {
        id: 12,
        revision: 3,
        recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3",
      },
    }),
  );
  expect(markup).toContain("This occurrence");
  expect(markup).toContain("This and following occurrences");
  expect(markup).toContain("All occurrences");
  expect(markup).toContain('name="recurrence_revision" value="3"');
});

it("keeps the same scoped action schedule on retries after the selected row moved", async () => {
  const data = form();
  data.append("edited_fields", "due_date");
  data.set("recurrence_original_rule", "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=4");
  data.set("recurrence_original_start", "2026-10-30");
  data.set("recurrence_original_key", "2026-10-31");
  data.set("recurrence_original_date", "2026-10-31");
  const first = await recurrenceMutation("task", 42, data, "edit", {
    due_date: "2026-11-01",
  });
  const retry = await recurrenceMutation("task", 42, data, "edit", {
    due_date: "2026-11-01",
  });
  expect(retry).toEqual(first);
  expect(first.p_dates).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  expect(from).not.toHaveBeenCalled();
});

it("shortens COUNT to one through the shared edit validation", async () => {
  const data = form();
  data.set("recurrence_original_rule", "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=4");
  data.set("recurrence_original_start", "2026-10-30");
  data.set("recurrence_original_key", "2026-10-31");
  data.set("recurrence_original_date", "2026-10-31");
  data.set("change_recurrence", "on");
  data.set("recurrence_frequency", "daily");
  data.set("recurrence_count", "1");
  const args = await recurrenceMutation("task", 42, data, "edit");
  expect(args.p_rule).toBe("RRULE:FREQ=DAILY;INTERVAL=1;COUNT=1");
  expect(args.p_dates).toEqual(["2026-10-31"]);
});
