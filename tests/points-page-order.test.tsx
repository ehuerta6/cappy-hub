import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const {
  getAuthorizationContext,
  canManagePoints,
  createClient,
  ordersByTable,
  totalOfficerIds,
  activeOfficerFilters,
  rangesByTable,
  totalCount,
  totalRows,
} = vi.hoisted(() => ({
  getAuthorizationContext: vi.fn(),
  canManagePoints: vi.fn(),
  createClient: vi.fn(),
  ordersByTable: new Map<string, { column: string; ascending?: boolean }[]>(),
  totalOfficerIds: [] as number[][],
  activeOfficerFilters: [] as { column: string; value: string }[],
  rangesByTable: new Map<string, [number, number][]>(),
  totalCount: { officers: 0 },
  totalRows: {
    value: null as null | { id: number; name: string; total_points: number }[],
  },
}));

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext,
  canManagePoints,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import PointsPage from "@/app/(protected)/points/page";

beforeEach(() => {
  ordersByTable.clear();
  totalOfficerIds.length = 0;
  activeOfficerFilters.length = 0;
  rangesByTable.clear();
  totalCount.officers = 0;
  totalRows.value = null;
  getAuthorizationContext.mockResolvedValue({ id: 1 });
  canManagePoints.mockReturnValue(false);
  createClient.mockResolvedValue({
    from: (table: string) => {
      const query = {
        select: () => query,
        is: () => query,
        not: () => query,
        filter: () => query,
        eq: (column: string, value: string) => {
          if (table === "officers")
            activeOfficerFilters.push({ column, value });
          return query;
        },
        in: (_column: string, ids: number[]) => {
          if (table === "officer_point_totals") totalOfficerIds.push(ids);
          return query;
        },
        gte: () => query,
        lte: () => query,
        order: (column: string, options?: { ascending?: boolean }) => {
          const orders = ordersByTable.get(table) ?? [];
          orders.push({ column, ascending: options?.ascending });
          ordersByTable.set(table, orders);
          return query;
        },
        range: (from: number, to: number) => {
          const ranges = rangesByTable.get(table) ?? [];
          ranges.push([from, to]);
          rangesByTable.set(table, ranges);
          return query;
        },
        limit: () => query,
        single: async () => ({
          data: { participation_points_per_hour: 1 },
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === "officers"
                ? [{ id: 7, name: "First Officer", status: "active" }]
                : table === "officer_point_totals"
                  ? (totalRows.value ?? [
                      { id: 7, name: "First Officer", total_points: 12 },
                      { id: 2, name: "Second Officer", total_points: 8 },
                    ])
                  : [],
            error: null,
            count: table === "officer_point_totals" ? totalCount.officers : 0,
          }).then(resolve),
      };
      return query;
    },
  });
});

it("orders Officer totals by points descending, then name ascending", async () => {
  await PointsPage({ searchParams: Promise.resolve({}) });

  expect(ordersByTable.get("officer_point_totals")).toEqual([
    { column: "total_points", ascending: false },
    { column: "name", ascending: true },
    { column: "id", ascending: true },
  ]);
});

it("keeps the Officer selector alphabetical", async () => {
  await PointsPage({ searchParams: Promise.resolve({}) });

  expect(ordersByTable.get("officers")).toEqual([
    { column: "name" },
    { column: "name" },
  ]);
  expect(activeOfficerFilters).toContainEqual({
    column: "status",
    value: "active",
  });
});

it("queries Officer totals only for active recipients", async () => {
  await PointsPage({ searchParams: Promise.resolve({}) });

  expect(totalOfficerIds).toEqual([[7]]);
});

it("renders rank numbers from the sorted totals", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain('<th scope="col">Rank</th>');
  expect(html).toMatch(/>1<\/td><td><a[^>]*>First Officer<\/a>/);
  expect(html).toMatch(/>2<\/td><td><a[^>]*>Second Officer<\/a>/);
  expect(html).toContain('class="w-20 tabular-nums text-muted"');
  expect(html).toContain('class="text-right"><span class="tabular-nums');
});

it("defaults to the Overview view and shows read-only rate to non-admins", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toMatch(/<a aria-current="page"[^>]*>Overview<\/a>/);
  expect(html).not.toContain("Point history filters");
  expect(html).toContain("Current participation rate:");
  expect(html).toContain("Officer ranking");
  expect(html).toContain("Participation rate");
  expect(html).not.toContain("Point configuration");
  expect(html).not.toContain("Add transaction");
});

it("shows Admin configuration and Add transaction in Overview", async () => {
  canManagePoints.mockReturnValue(true);
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain('aria-labelledby="add-transaction-title"');
  expect(html).toContain("Point configuration");
});

it("shows History when explicitly selected", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({ view: "history" }) }),
  );

  expect(html).toMatch(/<a aria-current="page"[^>]*>History<\/a>/);
  expect(html).toContain("Point history filters");
  expect(html).toContain("Point history");
  expect(html).not.toContain("Officer totals");
});

it("keeps an explicit Overview selection even when old filters are present", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({
      searchParams: Promise.resolve({ view: "overview", q: "workshop" }),
    }),
  );

  expect(html).toMatch(/<a aria-current="page"[^>]*>Overview<\/a>/);
  expect(html).not.toContain("Point history filters");
});

it.each([
  { officer: "123" },
  { event: "456" },
  { page: "2" },
  { q: "workshop" },
  { type: "task" },
  { status: "removed" },
  { from: "2026-10-01" },
  { to: "2026-10-01" },
])("treats legacy history parameters as History: %o", async (searchParams) => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve(searchParams) }),
  );

  expect(html).toMatch(/<a aria-current="page"[^>]*>History<\/a>/);
});

it("shows a paginated eight-Officer ranking with a separate rankPage parameter", async () => {
  totalCount.officers = 17;
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({ rankPage: "2" }) }),
  );

  expect(rangesByTable.get("officer_point_totals")).toEqual([[8, 15]]);
  expect(html).toContain("Page 2 of 3 · Officer ranking");
  expect(html).toContain('href="/points">Previous</a>');
  expect(html).toContain("rankPage=3");
  expect(html).not.toContain('name="page"');
});

it("clamps an out-of-range ranking page to the last page", async () => {
  const { redirect } = await import("next/navigation");
  totalCount.officers = 17;

  await PointsPage({ searchParams: Promise.resolve({ rankPage: "99" }) });

  expect(redirect).toHaveBeenCalledWith("/points?rankPage=3");
});

it("shows an empty ranking as its first and only page", async () => {
  totalRows.value = [];
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain("Officer ranking");
  expect(html).toContain("Page 1 of 1 · Officer ranking");
  expect(html).toContain("<tbody></tbody>");
});
