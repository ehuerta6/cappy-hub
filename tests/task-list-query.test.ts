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
    not: (...args: unknown[]) => {
      operations.push(["not", args]);
      return query;
    },
    eq: (...args: unknown[]) => {
      operations.push(["eq", args]);
      return query;
    },
    or: (...args: unknown[]) => {
      operations.push(["or", args]);
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
  sort: "urgency" as const,
  dateRange: { from: "2026-08-16", through: "2026-12-20" },
};

it("intersects a current-period Task range with the Current view", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    view: "current",
  });

  expect(operations).toContainEqual(["gte", ["due_date", "2026-08-16"]]);
  expect(operations).toContainEqual(["lte", ["due_date", "2026-12-20"]]);
  expect(operations).toContainEqual([
    "or",
    [
      "due_date.gte.2026-11-02,and(due_date.lt.2026-11-02,or(active_assignments.is.null,incomplete_assignments.not.is.null))",
    ],
  ]);
  expect(operations).toContainEqual([
    "is",
    ["active_assignments.removed_at", null],
  ]);
  expect(operations).toContainEqual([
    "is",
    ["incomplete_assignments.removed_at", null],
  ]);
});

it("keeps the selected Academic Period range when Current includes overdue work", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    dateRange: { from: "2026-01-11", through: "2026-05-15" },
    view: "current",
  });

  expect(operations).toContainEqual(["gte", ["due_date", "2026-01-11"]]);
  expect(operations).toContainEqual(["lte", ["due_date", "2026-05-15"]]);
  expect(operations).toContainEqual([
    "or",
    [
      "due_date.gte.2026-11-02,and(due_date.lt.2026-11-02,or(active_assignments.is.null,incomplete_assignments.not.is.null))",
    ],
  ]);
});

it("shows only completed past Tasks within the selected Academic Period", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    view: "past",
  });

  expect(operations).toContainEqual(["gte", ["due_date", "2026-08-16"]]);
  expect(operations).toContainEqual(["lt", ["due_date", "2026-11-02"]]);
  expect(operations).toContainEqual(["lte", ["due_date", "2026-12-20"]]);
  expect(operations).toContainEqual([
    "not",
    ["active_assignments", "is", null],
  ]);
  expect(operations).toContainEqual(["is", ["incomplete_assignments", null]]);
});

it("lets All remove only the timeframe boundary and keeps Academic Period", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    view: "all",
  });

  expect(operations).toContainEqual(["gte", ["due_date", "2026-08-16"]]);
  expect(operations).toContainEqual(["lte", ["due_date", "2026-12-20"]]);
  expect(
    operations.some(([method]) => method === "lt" || method === "or"),
  ).toBe(false);
});

it("filters Assigned to me using active assignment rows and keeps urgency ordered", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    view: "all",
    assignedToOfficerId: 7,
  });

  expect(String(operations[0][1][0])).toContain(
    "my_assignment:task_officer_assignments!inner",
  );
  expect(operations).toContainEqual(["eq", ["my_assignment.officer_id", 7]]);
  expect(operations).toContainEqual(["is", ["my_assignment.removed_at", null]]);
  expect(operations).toContainEqual([
    "order",
    ["due_date", { ascending: true }],
  ]);
});

it("sorts Newest by creation time and uses IDs to keep pagination stable", () => {
  const { operations, supabase } = queryRecorder();
  buildTaskListQuery(supabase as never, {
    ...baseOptions,
    view: "all",
    sort: "newest",
  });

  expect(operations).toContainEqual([
    "order",
    ["created_at", { ascending: false }],
  ]);
  expect(operations).toContainEqual(["order", ["id", { ascending: false }]]);
});

it.each([
  ["all", "in_progress"],
  ["all", "complete"],
  ["deleted", "in_progress"],
  ["deleted", "complete"],
] as const)(
  "limits %s %s status checks to active assignment rows",
  (view, status) => {
    const { operations, supabase } = queryRecorder();
    buildTaskListQuery(supabase as never, {
      ...baseOptions,
      view,
      status,
    });

    expect(String(operations[0][1][0])).toContain(
      "incomplete_assignments:task_officer_assignments(",
    );
    expect(operations).toContainEqual([
      "or",
      [
        "completed_at.is.null,completion_approval_pending.eq.true",
        {
          referencedTable: "incomplete_assignments",
        },
      ],
    ]);
    expect(operations).toContainEqual([
      "is",
      ["incomplete_assignments.removed_at", null],
    ]);
  },
);
