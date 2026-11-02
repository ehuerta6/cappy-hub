import { expect, it } from "vitest";
import { buildTaskListQuery } from "@/lib/task-list-query";

function queryRecorder() {
  const operations: [string, unknown[]][] = [];
  const query = {
    select: (...args: unknown[]) => {
      operations.push(["select", args]);
      return query;
    },
    is: (...args: unknown[]) => {
      operations.push(["is", args]);
      return query;
    },
    gte: (...args: unknown[]) => {
      operations.push(["gte", args]);
      return query;
    },
    lte: (...args: unknown[]) => {
      operations.push(["lte", args]);
      return query;
    },
    lt: (...args: unknown[]) => {
      operations.push(["lt", args]);
      return query;
    },
    order: (...args: unknown[]) => {
      operations.push(["order", args]);
      return query;
    },
    range: (...args: unknown[]) => {
      operations.push(["range", args]);
      return query;
    },
  };
  const supabase = { from: () => query };
  return { operations, supabase };
}

const baseOptions = {
  today: "2026-11-02",
  page: 1,
  dateRange: { from: "2026-08-16", through: "2026-12-20" },
};

it("intersects a current-period Task range with the Current view", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    view: "current",
    periodIsHistorical: false,
  });

  expect(operations).toContainEqual(["gte", ["due_date", "2026-11-02"]]);
  expect(operations).toContainEqual(["lte", ["due_date", "2026-12-20"]]);
});

it("keeps a selected historical period intact as a history view", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    dateRange: { from: "2026-01-11", through: "2026-05-15" },
    view: "current",
    periodIsHistorical: true,
  });

  expect(operations).toContainEqual(["gte", ["due_date", "2026-01-11"]]);
  expect(operations).toContainEqual(["lte", ["due_date", "2026-05-15"]]);
  expect(operations).not.toContainEqual(["gte", ["due_date", "2026-11-02"]]);
});

it("intersects the Past view with the selected current period", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    view: "past",
    periodIsHistorical: false,
  });

  expect(operations).toContainEqual(["gte", ["due_date", "2026-08-16"]]);
  expect(operations).toContainEqual(["lt", ["due_date", "2026-11-02"]]);
  expect(operations).toContainEqual(["lte", ["due_date", "2026-12-20"]]);
});
