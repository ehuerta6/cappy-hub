// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { applicationRole: "admin" },
  counts: { positions: 0, branches: 0, event_locations: 0 },
  data: { positions: [], branches: [], event_locations: [] } as Record<
    string,
    Array<Record<string, unknown>>
  >,
  tables: [] as string[],
  orders: [] as Array<[string, string]>,
  ranges: [] as Array<[string, number, number]>,
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
      let start = 0;
      let end = 0;
      const query = {
        select: (_fields: string, options?: { head?: boolean }) => {
          isCountQuery = options?.head === true;
          return query;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          mocks.orders.push([
            column,
            options?.ascending === false ? "desc" : "asc",
          ]);
          return query;
        },
        range: (from: number, to: number) => {
          start = from;
          end = to;
          mocks.ranges.push([table, from, to]);
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
                  data: mocks.data[table].slice(start, end + 1),
                  count: null,
                  error: null,
                },
          ).then(resolve, reject),
      };
      return query;
    },
  })),
}));

vi.mock("next/navigation", () => ({
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
  mocks.counts = { positions: 0, branches: 0, event_locations: 0 };
  mocks.data = { positions: [], branches: [], event_locations: [] };
  mocks.tables.length = 0;
  mocks.orders.length = 0;
  mocks.ranges.length = 0;
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
] as const)("loads only the selected %s category", async (category, table) => {
  mocks.counts[table] = 1;
  mocks.data[table] = [{ id: 1, name: "Selected record" }];
  const html = await renderPage({ category });

  expect(mocks.tables).toEqual([table, table]);
  expect(html).toContain("Catalog categories");
  expect(html).toContain('aria-current="page"');
  for (const category of ["positions", "branches", "locations"])
    expect(html).toContain(`href="/officers/catalogs?category=${category}"`);
  expect(html).toContain("Selected record");
});

it("fetches only eight ordered records and preserves the category in pager links", async () => {
  mocks.counts.branches = 18;
  mocks.data.branches = Array.from({ length: 18 }, (_, index) => ({
    id: index + 1,
    name: `Branch ${index + 1}`,
    is_active: true,
  }));
  const html = await renderPage({ category: "branches", page: "2" });

  expect(mocks.ranges).toEqual([["branches", 8, 15]]);
  expect(mocks.orders).toEqual([
    ["name", "asc"],
    ["id", "asc"],
  ]);
  expect(html).toContain("18 records");
  expect(html).toContain('href="/officers/catalogs?category=branches"');
  expect(html).toContain(
    'href="/officers/catalogs?category=branches&amp;page=3"',
  );
  expect(html).toContain('name="category" value="branches"');
  expect(html).toContain('value="Branch 9"');
  expect(html).not.toContain('value="Branch 17"');
});

it("returns non-overlapping records on adjacent pages", async () => {
  mocks.counts.branches = 16;
  mocks.data.branches = Array.from({ length: 16 }, (_, index) => ({
    id: index + 1,
    name: `Branch ${index + 1}`,
    is_active: true,
  }));
  const firstPage = await renderPage({ category: "branches" });
  const secondPage = await renderPage({ category: "branches", page: "2" });

  expect(mocks.ranges).toEqual([
    ["branches", 0, 7],
    ["branches", 8, 15],
  ]);
  for (let number = 1; number <= 16; number++)
    expect(`${firstPage}${secondPage}`).toContain(`Branch ${number}`);
});

it("redirects the default or invalid category to Positions", async () => {
  await expect(renderPage({})).rejects.toThrow(
    "REDIRECT:/officers/catalogs?category=positions",
  );
  await expect(
    renderPage({ category: "unexpected", page: "4" }),
  ).rejects.toThrow("REDIRECT:/officers/catalogs?category=positions");
});

it("canonicalizes an out-of-range page to the current last page", async () => {
  mocks.counts.event_locations = 17;
  await expect(
    renderPage({ category: "locations", page: "9" }),
  ).rejects.toThrow("REDIRECT:/officers/catalogs?category=locations&page=3");
});

it("keeps empty and single-page categories valid without a pager", async () => {
  const empty = await renderPage({ category: "positions" });
  expect(empty).toContain("No positions yet");
  expect(empty).not.toContain("Positions pages");

  mocks.counts.positions = 1;
  mocks.data.positions = [
    { id: 1, name: "Officer", code: "officer", is_active: true },
  ];
  const single = await renderPage({ category: "positions" });
  expect(single).toContain("1 record");
  expect(single).not.toContain("Positions pages");
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
