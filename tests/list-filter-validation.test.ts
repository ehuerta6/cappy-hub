import { expect, it } from "vitest";
import { officerListFiltersSchema } from "@/app/(protected)/officers/filter-validation";
import { eventListFiltersSchema } from "@/app/(protected)/events/filter-validation";
import { taskListFiltersSchema } from "@/app/(protected)/tasks/filter-validation";
import { systemLogFiltersSchema } from "@/app/(protected)/system-log/filter-validation";
import { searchOrFilter, literalSearchPattern } from "@/lib/list-search";

it.each([
  officerListFiltersSchema,
  eventListFiltersSchema,
  taskListFiltersSchema,
])(
  "defaults invalid IDs, statuses and repeated params independently",
  (schema) => {
    const filters = schema.parse({
      q: "  officer  ",
      status: "garbage",
      branch: "x",
      position: "Infinity",
      type: "0",
      assignee: "9007199254740992",
    });
    expect(filters.q).toBe("officer");
    expect(filters.status).toBe(
      schema === officerListFiltersSchema ? "active" : undefined,
    );
    expect(filters.branch).toBeUndefined();
    expect(schema.parse({ q: ["a", "b"], branch: ["1", "2"] })).toMatchObject({
      q: "",
      branch: undefined,
    });
    expect(schema.parse({ branch: "-1013" }).branch).toBe(-1013);
    expect(schema.parse({ q: "x".repeat(200) }).q).toHaveLength(100);
  },
);

it("parses each page's domain filters", () => {
  expect(
    officerListFiltersSchema.parse({
      status: "inactive",
      position: "2",
      branch: "3",
    }),
  ).toMatchObject({ status: "inactive", position: 2, branch: 3 });
  expect(officerListFiltersSchema.parse({}).status).toBe("active");
  expect(officerListFiltersSchema.parse({ status: "all" }).status).toBe("all");
  expect(
    eventListFiltersSchema.parse({ status: "removed", type: "2", branch: "3" }),
  ).toMatchObject({ status: undefined, type: 2, branch: 3 });
  expect(
    taskListFiltersSchema.parse({
      view: "past",
      status: "in_progress",
      assignee: "2",
      branch: "3",
    }),
  ).toMatchObject({
    view: "past",
    status: "in_progress",
    assignee: 2,
    branch: 3,
  });
  expect(taskListFiltersSchema.parse({ view: "current" }).view).toBeUndefined();
  expect(taskListFiltersSchema.parse({ view: "next" }).view).toBeUndefined();
  expect(
    taskListFiltersSchema.parse({ status: "awaiting" }).status,
  ).toBeUndefined();
});

it("validates log actors, entity types, dates and bounded pages safely", () => {
  expect(
    systemLogFiltersSchema.parse({
      actor: "invalid",
      entity: "unknown",
      from: "2026-02-30",
      to: ["2026-01-01"],
      page: "Infinity",
    }),
  ).toMatchObject({
    actor: undefined,
    entity: undefined,
    from: undefined,
    to: undefined,
    page: 1,
  });
  expect(
    systemLogFiltersSchema.parse({
      actor: "system",
      entity: "task",
      from: "2026-10-03",
      to: "2026-10-01",
      page: "999999",
    }),
  ).toMatchObject({
    actor: "system",
    entity: "task",
    dateRangeIsReversed: true,
    page: 100000,
  });
  expect(systemLogFiltersSchema.parse({ actor: "42" }).actor).toBe(42);
  expect(
    systemLogFiltersSchema.parse({
      actor: "00000000-0000-0000-0000-000000000001",
    }).actor,
  ).toBe("00000000-0000-0000-0000-000000000001");
});

it("escapes regex and PostgREST OR grammar as literal search text", () => {
  expect(literalSearchPattern("50%_*")).toBe("50%_\\*");
  expect(literalSearchPattern("a.b[0](x)|+?^$")).toBe(
    "a\\.b\\[0\\]\\(x\\)\\|\\+\\?\\^\\$",
  );
  expect(searchOrFilter('a,b).name.eq."x', ["name", "description"])).toContain(
    'name.imatch."',
  );
  expect(searchOrFilter('a,b).name.eq."x', ["name"])).toContain("\\\\)");
  expect(literalSearchPattern("a\0b")).toBe("ab");
});
