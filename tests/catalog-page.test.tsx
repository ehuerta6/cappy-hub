// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { applicationRole: "admin" },
  counts: {
    positions: 0,
    branches: 0,
    event_locations: 0,
    event_types: 0,
    task_types: 0,
  },
  data: {
    positions: [],
    branches: [],
    event_locations: [],
    event_types: [],
    task_types: [],
  } as Record<string, Array<Record<string, unknown>>>,
  tables: [] as string[],
  filters: [] as Array<[string, string, boolean]>,
  orders: [] as Array<[string, string]>,
}));

vi.mock("@/lib/academic-periods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-periods")>()),
  getAcademicPeriodData: async () => ({
    periods: [],
    currentDate: "2026-11-01",
    currentPeriodId: null,
  }),
}));

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(async () => mocks.actor),
  isAdmin: (actor: { applicationRole: string }) =>
    actor.applicationRole === "admin",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      mocks.tables.push(table);
      let isCountQuery = false;
      const query = {
        select: (_fields: string, options?: { head?: boolean }) => {
          isCountQuery = options?.head === true;
          return query;
        },
        eq: (column: string, value: boolean) => {
          mocks.filters.push([table, column, value]);
          return query;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          mocks.orders.push([
            column,
            options?.ascending === false ? "desc" : "asc",
          ]);
          return query;
        },
        then: (
          resolve: (result: {
            data: Array<Record<string, unknown>> | null;
            count: number | null;
            error: null;
          }) => unknown,
          reject?: (error: unknown) => unknown,
        ) =>
          Promise.resolve(
            isCountQuery
              ? {
                  data: null,
                  count: mocks.counts[table as keyof typeof mocks.counts],
                  error: null,
                }
              : {
                  data: mocks.data[table],
                  count: mocks.data[table].length,
                  error: null,
                },
          ).then(resolve, reject),
      };
      return query;
    },
  })),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/app/(protected)/officers/catalogs/actions", () => ({
  changeCatalog: vi.fn(),
}));

import OfficerCatalogsPage from "@/app/(protected)/officers/catalogs/page";

beforeEach(() => {
  mocks.actor.applicationRole = "admin";
  mocks.counts = {
    positions: 0,
    branches: 0,
    event_locations: 0,
    event_types: 0,
    task_types: 0,
  };
  mocks.data = {
    positions: [],
    branches: [],
    event_locations: [],
    event_types: [],
    task_types: [],
  };
  mocks.tables.length = 0;
  mocks.filters.length = 0;
  mocks.orders.length = 0;
});

async function renderPage(
  params: Record<string, string | string[] | undefined>,
) {
  const page = await OfficerCatalogsPage({
    searchParams: Promise.resolve(params),
  });
  return renderToStaticMarkup(createElement(() => page));
}

it.each([
  ["positions", "positions"],
  ["branches", "branches"],
  ["locations", "event_locations"],
  ["types", "event_types"],
  ["task-types", "task_types"],
] as const)(
  "renders the selected %s category with tab counts",
  async (category, table) => {
    mocks.counts[table] = 1;
    mocks.data[table] = [{ id: 1, name: "Selected record" }];
    const html = await renderPage({ category });

    expect(mocks.tables).toContain(table);
    expect(html).toContain("Catalog categories");
    expect(html).toContain('aria-current="page"');
    for (const tab of [
      "positions",
      "branches",
      "locations",
      "types",
      "task-types",
    ])
      expect(html).toContain(`href="/officers/catalogs?category=${tab}"`);
    expect(html).toContain("Selected record");
  },
);

it("loads all ordered records for a category without pagination", async () => {
  mocks.counts.branches = 18;
  mocks.data.branches = Array.from({ length: 18 }, (_, index) => ({
    id: index + 1,
    name: `Branch ${index + 1}`,
    is_active: true,
  }));
  const html = await renderPage({ category: "branches" });

  expect(mocks.orders).toEqual([
    ["name", "asc"],
    ["id", "asc"],
  ]);
  expect(html).toContain('value="Branch 1"');
  expect(html).toContain('value="Branch 18"');
  expect(html).not.toContain("Branches pages");
});

it("redirects legacy page query params to the canonical unpaginated category URL", async () => {
  await expect(renderPage({ category: "branches", page: "2" })).rejects.toThrow(
    "REDIRECT:/officers/catalogs?category=branches",
  );
});

it("redirects the default or invalid category to Positions", async () => {
  await expect(renderPage({})).rejects.toThrow(
    "REDIRECT:/officers/catalogs?category=positions",
  );
  await expect(
    renderPage({ category: "unexpected", page: "4" }),
  ).rejects.toThrow("REDIRECT:/officers/catalogs?category=positions");
});

it("keeps empty categories clean without a pager", async () => {
  const empty = await renderPage({ category: "positions" });
  expect(empty).toContain("No positions yet");
  expect(empty).not.toContain("Positions pages");
});

it("shows Task Type rows in deleted catalog views with restore actions", async () => {
  mocks.counts.task_types = 1;
  mocks.data.task_types = [
    { id: 12, name: "Flyer", available_for_new_tasks: false },
  ];
  const html = await renderPage({ category: "task-types", status: "deleted" });

  expect(mocks.filters).toContainEqual([
    "task_types",
    "available_for_new_tasks",
    false,
  ]);
  expect(html).toContain("Task Types");
  expect(html).toContain("Flyer");
  expect(html).toContain('name="operation" value="restore"');
});

it.each(["lead", "officer"])(
  "denies %s access before reading query-selected catalog data",
  async (role) => {
    mocks.actor.applicationRole = role;
    await expect(
      renderPage({ category: "locations", page: "500" }),
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.tables).toEqual([]);
  },
);

it("filters deleted event types and hides create/delete actions", async () => {
  mocks.counts.event_types = 10;
  mocks.data.event_types = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    name: `Historical type ${i}`,
    available_for_new_events: false,
  }));
  const html = await renderPage({ category: "types", status: "deleted" });
  expect(mocks.filters).toContainEqual([
    "event_types",
    "available_for_new_events",
    false,
  ]);
  expect(html).toContain('name="operation" value="restore"');
  expect(html).not.toContain('name="operation" value="create"');
  expect(html).not.toContain('name="operation" value="delete"');
});
