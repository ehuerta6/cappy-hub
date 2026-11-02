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
  queriedTables,
  periodSummaryCalls,
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
  queriedTables: [] as string[],
  periodSummaryCalls: [] as number[],
}));

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext,
  canManagePoints,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/academic-periods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-periods")>()),
  getAcademicPeriodData: async () => ({
    periods: [
      {
        id: 1,
        name: "Fall 2026",
        starts_on: "2026-08-16",
        ends_on: "2026-12-20",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ],
    currentDate: "2026-11-01",
    currentPeriodId: 1,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import PointsPage from "@/app/(protected)/points/page";

beforeEach(() => {
  ordersByTable.clear();
  totalOfficerIds.length = 0;
  activeOfficerFilters.length = 0;
  rangesByTable.clear();
  totalCount.officers = 0;
  totalRows.value = null;
  queriedTables.length = 0;
  periodSummaryCalls.length = 0;
  getAuthorizationContext.mockResolvedValue({ id: 1 });
  canManagePoints.mockReturnValue(false);
  createClient.mockResolvedValue({
    rpc: (name: string, args: { p_period_id: number }) => {
      if (name !== "academic_period_point_summary")
        throw new Error(`Unexpected RPC ${name}`);
      periodSummaryCalls.push(args.p_period_id);
      const rows = totalRows.value ?? [
        { id: 7, name: "First Officer", total_points: 12 },
        { id: 2, name: "Second Officer", total_points: 8 },
      ];
      return {
        single: async () => ({
          data: {
            net_points: rows.reduce((sum, row) => sum + row.total_points, 0),
            ranking: rows.map((row) => ({
              officer_id: row.id,
              officer_name: row.name,
              points: row.total_points,
            })),
          },
          error: null,
        }),
      };
    },
    from: (table: string) => {
      queriedTables.push(table);
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
        maybeSingle: async () => ({
          data: { id: 456, name: "Historic Event", event_date: "2025-01-01" },
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === "officers"
                ? [{ id: 7, name: "First Officer", status: "active" }]
                : table === "point_history"
                  ? (
                      totalRows.value ?? [
                        { id: 7, name: "First Officer", total_points: 12 },
                        { id: 2, name: "Second Officer", total_points: 8 },
                      ]
                    ).map(({ id, name, total_points }) => ({
                      officer_id: id,
                      officer_name: name,
                      points: total_points,
                    }))
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

  expect(periodSummaryCalls).toEqual([1]);
  expect(queriedTables).not.toContain("point_history");
});

it("keeps History loading independent from Officer picker data", async () => {
  await PointsPage({ searchParams: Promise.resolve({ view: "history" }) });

  expect(ordersByTable.get("officers")).toBeUndefined();
  expect(activeOfficerFilters).toEqual([]);
});

it("loads the period ranking from the database aggregate", async () => {
  await PointsPage({ searchParams: Promise.resolve({}) });

  expect(periodSummaryCalls).toEqual([1]);
  expect(queriedTables).not.toContain("point_history");
  expect(totalOfficerIds).toEqual([]);
});

it("renders rank numbers from the sorted totals", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain('<th scope="col">Rank</th>');
  expect(html).toMatch(
    /aria-label="Rank 1">1<\/span><\/td><td><a[^>]*>First Officer<\/a>/,
  );
  expect(html).toMatch(
    /aria-label="Rank 2">2<\/span><\/td><td><a[^>]*>Second Officer<\/a>/,
  );
  expect(html).toContain('class="points-total text-right"');
  expect(html).toContain("+12");
});

it("defaults to the Overview view and shows read-only rate to non-admins", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toMatch(/<a aria-current="page"[^>]*>Overview<\/a>/);
  expect(html).not.toContain("Point history filters");
  expect(html).toContain(
    "Event participation is calculated automatically after an event ends.",
  );
  expect(html).toContain("Point per eligible hour");
  expect(html).toContain("Officer ranking");
  expect(html).toContain("Participation Points");
  expect(html).not.toContain("Point configuration");
  expect(html).not.toContain("Add adjustment");
  expect(periodSummaryCalls).toEqual([1]);
  expect(queriedTables).not.toContain("point_history");
  expect(queriedTables).not.toContain("events");
});

it("shows Admin configuration and Add adjustment in Overview", async () => {
  canManagePoints.mockReturnValue(true);
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain('aria-labelledby="add-transaction-title"');
  expect(html).toContain("Add adjustment");
  expect(html).toContain("Participation Points");
  expect(periodSummaryCalls).toEqual([1]);
  expect(queriedTables).not.toContain("point_history");
  expect(queriedTables).toContain("events");
  expect(queriedTables.filter((table) => table === "events")).toHaveLength(1);
  expect(queriedTables.filter((table) => table === "officers")).toHaveLength(1);
});

it("shows History when explicitly selected", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({ view: "history" }) }),
  );

  expect(html).toMatch(/<a aria-current="page"[^>]*>History<\/a>/);
  expect(queriedTables).not.toContain("events");
  expect(html).toContain("Point history filters");
  expect(html).toContain("Point history");
  expect(html).not.toContain("Officer totals");
  expect(queriedTables).toContain("point_history");
  expect(queriedTables).not.toContain("officers");
  expect(
    queriedTables.filter((table) => table === "point_history"),
  ).toHaveLength(3);
  expect(queriedTables).not.toContain("officer_point_totals");
  expect(queriedTables).not.toContain("application_config");
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
  if ("event" in searchParams) {
    expect(queriedTables).not.toContain("events");
    expect(html).not.toContain('placeholder="Search Events"');
  }
});

it("keeps the selected period in period-ranking Officer links", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({
      searchParams: Promise.resolve({ period: "1" }),
    }),
  );

  expect(html).toContain('href="/officers/7?period=1"');
});

it("shows an empty ranking as its first and only page", async () => {
  totalRows.value = [];
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain("Officer ranking");
  expect(html).toContain("0 active officers · Fall 2026");
  expect(html).toContain(
    "No active Officers have earned Points in this period yet.",
  );
});
