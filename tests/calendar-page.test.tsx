import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const queryCalls: Array<[string, ...unknown[]]> = [];
const records: Record<string, Array<Record<string, unknown>>> = {
  events: [],
  tasks: [],
};
let queryError: unknown = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const filters: Array<[string, "is" | "neq", unknown]> = [];
      let range: [number, number] = [0, 499];
      const query = {
        select: (...args: unknown[]) => {
          queryCalls.push([table, "select", ...args]);
          return query;
        },
        is: (...args: unknown[]) => {
          queryCalls.push([table, "is", ...args]);
          filters.push([String(args[0]), "is", args[1]]);
          return query;
        },
        neq: (...args: unknown[]) => {
          queryCalls.push([table, "neq", ...args]);
          filters.push([String(args[0]), "neq", args[1]]);
          return query;
        },
        order: (...args: unknown[]) => {
          queryCalls.push([table, "order", ...args]);
          return query;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          queryCalls.push([table, "range", from, to]);
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const data = records[table].filter((record) =>
            filters.every(([column, operator, value]) =>
              operator === "is"
                ? record[column] === value
                : record[column] !== value,
            ),
          );
          return Promise.resolve({
            data: data.slice(range[0], range[1] + 1),
            error: queryError,
          }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

vi.mock("@/app/(protected)/calendar/calendar-view", () => ({
  default: ({ entries }: { entries: Array<{ title: string }> }) =>
    createElement(
      "ul",
      null,
      ...entries.map((entry, index) =>
        createElement("li", { key: index }, entry.title),
      ),
    ),
}));

import CalendarPage from "@/app/(protected)/calendar/page";

it("independently paginates eligible Events and Tasks with stable ordering", async () => {
  queryCalls.length = 0;
  queryError = null;
  records.events = Array.from({ length: 1_003 }, (_, index) => ({
    id: index + 1,
    name: `Event ${index + 1}`,
    status: index === 7 ? "cancelled" : "upcoming",
    deleted_at: index === 8 ? "deleted" : null,
    starts_at: "2026-10-08T23:00:00Z",
    ends_at: "2026-10-09T01:00:00Z",
  }));
  records.tasks = Array.from({ length: 1_003 }, (_, index) => ({
    id: index + 1,
    title: `Task ${index + 1}`,
    removed_at: index === 8 || index === 9 ? "removed" : null,
    due_date: "2026-10-08",
  }));

  const html = renderToStaticMarkup(await CalendarPage());

  expect(html.match(/<li/g) ?? []).toHaveLength(2_002);
  expect(html).toContain("Event 1003");
  expect(html).toContain("Task 1003");
  expect(html).not.toContain("Event 8</li>");
  expect(html).not.toContain("Event 9</li>");
  expect(html).not.toContain("Task 10</li>");
  expect(
    queryCalls.filter(
      ([table, method]) => table === "events" && method === "range",
    ),
  ).toEqual([
    ["events", "range", 0, 499],
    ["events", "range", 500, 999],
    ["events", "range", 1_000, 1_499],
  ]);
  expect(
    queryCalls.filter(
      ([table, method]) => table === "tasks" && method === "range",
    ),
  ).toEqual([
    ["tasks", "range", 0, 499],
    ["tasks", "range", 500, 999],
    ["tasks", "range", 1_000, 1_499],
  ]);
  expect(queryCalls).toContainEqual(["events", "order", "starts_at"]);
  expect(queryCalls).toContainEqual(["events", "order", "id"]);
  expect(queryCalls).toContainEqual(["tasks", "order", "due_date"]);
  expect(queryCalls).toContainEqual(["tasks", "order", "id"]);
  expect(queryCalls).toContainEqual(["events", "is", "deleted_at", null]);
  expect(queryCalls).toContainEqual(["events", "neq", "status", "cancelled"]);
  expect(queryCalls).toContainEqual(["tasks", "is", "removed_at", null]);
});

it("does not render Calendar entries when a page query fails", async () => {
  queryCalls.length = 0;
  queryError = new Error("PostgREST request failed");

  await expect(CalendarPage()).rejects.toThrow(
    "Failed to load calendar entries",
  );

  queryError = null;
});
