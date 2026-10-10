import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const {
  getAuthorizationContext,
  canManagePoints,
  createClient,
  ordersByTable,
  totalOfficerIds,
} = vi.hoisted(() => ({
  getAuthorizationContext: vi.fn(),
  canManagePoints: vi.fn(),
  createClient: vi.fn(),
  ordersByTable: new Map<string, { column: string; ascending?: boolean }[]>(),
  totalOfficerIds: [] as number[][],
}));

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext,
  canManagePoints,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import PointsPage from "@/app/(protected)/points/page";

beforeEach(() => {
  ordersByTable.clear();
  totalOfficerIds.length = 0;
  getAuthorizationContext.mockResolvedValue({ id: 1 });
  canManagePoints.mockReturnValue(false);
  createClient.mockResolvedValue({
    from: (table: string) => {
      const query = {
        select: () => query,
        is: () => query,
        not: () => query,
        filter: () => query,
        eq: () => query,
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
        range: () => query,
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
                  ? [
                      { id: 7, name: "First Officer", total_points: 12 },
                      { id: 2, name: "Second Officer", total_points: 8 },
                    ]
                  : [],
            error: null,
            count: 0,
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
  ]);
});

it("keeps the Officer selector alphabetical", async () => {
  await PointsPage({ searchParams: Promise.resolve({}) });

  expect(ordersByTable.get("officers")).toEqual([
    { column: "name" },
    { column: "name" },
  ]);
});

it("queries Officer totals only for active recipients", async () => {
  await PointsPage({ searchParams: Promise.resolve({}) });

  expect(totalOfficerIds).toEqual([[7]]);
});

it("renders Rank from the existing sorted totals without changing their order", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain('<th scope="col">Rank</th>');
  expect(html).toMatch(/>1<\/td><td><a[^>]*>First Officer<\/a>/);
  expect(html).toMatch(/>2<\/td><td><a[^>]*>Second Officer<\/a>/);
  expect(html).toContain('class="w-20 tabular-nums text-muted"');
  expect(html).toContain('class="text-right"><span class="tabular-nums');
});

it("gives non-admins a centered totals table and keeps history full width", async () => {
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain('class="mx-auto w-full max-w-4xl"');
  expect(html).toContain("Participation rate:");
  expect(html.indexOf("Officer totals")).toBeLessThan(
    html.indexOf("Point history"),
  );
  expect(html).not.toContain("Point configuration");
  expect(html).not.toContain("Add manual transaction or correction");
});

it("keeps the Admin totals and controls beside one another before full-width history", async () => {
  canManagePoints.mockReturnValue(true);
  const html = renderToStaticMarkup(
    await PointsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain(
    'class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(17rem,0.38fr)_minmax(0,0.62fr)]"',
  );
  expect(html.indexOf("Officer totals")).toBeLessThan(
    html.indexOf("Point configuration"),
  );
  expect(html.indexOf("Point configuration")).toBeLessThan(
    html.indexOf("Add manual transaction or correction"),
  );
  expect(html.indexOf("Add manual transaction or correction")).toBeLessThan(
    html.indexOf("Point history"),
  );
});
