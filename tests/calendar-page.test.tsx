import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const queryCalls: Array<[string, ...unknown[]]> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const filters: Array<[string, "is" | "neq", unknown]> = [];
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
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === "events"
                ? [
                    {
                      id: 12,
                      name: "Club meeting",
                      status: "upcoming",
                      deleted_at: null,
                      starts_at: "2026-10-08T23:00:00Z",
                      ends_at: "2026-10-09T01:00:00Z",
                    },
                    {
                      id: 13,
                      name: "Cancelled meeting",
                      status: "cancelled",
                      deleted_at: null,
                      starts_at: "2026-10-09T23:00:00Z",
                      ends_at: "2026-10-10T01:00:00Z",
                    },
                  ].filter((record) =>
                    filters.every(([column, operator, value]) =>
                      operator === "is"
                        ? record[column as keyof typeof record] === value
                        : record[column as keyof typeof record] !== value,
                    ),
                  )
                : [
                    {
                      id: 9,
                      title: "Prepare slides",
                      due_date: "2026-10-08",
                    },
                  ],
            error: null,
          }).then(resolve),
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
      ...entries.map((entry) =>
        createElement("li", { key: entry.title }, entry.title),
      ),
    ),
}));

import CalendarPage from "@/app/(protected)/calendar/page";

it("reads active Events and Tasks through the standard server client", async () => {
  queryCalls.length = 0;
  const html = renderToStaticMarkup(await CalendarPage());

  expect(html).toContain("Club meeting");
  expect(html).not.toContain("Cancelled meeting");
  expect(html).toContain("Prepare slides");
  expect(queryCalls).toContainEqual(["events", "is", "deleted_at", null]);
  expect(queryCalls).toContainEqual(["events", "neq", "status", "cancelled"]);
  expect(queryCalls).toContainEqual([
    "events",
    "select",
    "id,name,starts_at,ends_at",
  ]);
  expect(queryCalls).toContainEqual(["tasks", "select", "id,title,due_date"]);
  expect(queryCalls.some(([table]) => table === "officers")).toBe(false);
});
