import { beforeEach, expect, it, vi } from "vitest";

const { getAuthorizationContext, createClient, ordersByTable } = vi.hoisted(
  () => ({
    getAuthorizationContext: vi.fn(),
    createClient: vi.fn(),
    ordersByTable: new Map<string, { column: string; ascending?: boolean }[]>(),
  }),
);

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext,
  canManagePoints: () => false,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import PointsPage from "@/app/(protected)/points/page";

beforeEach(() => {
  ordersByTable.clear();
  getAuthorizationContext.mockResolvedValue({ id: 1 });
  createClient.mockResolvedValue({
    from: (table: string) => {
      const query = {
        select: () => query,
        is: () => query,
        not: () => query,
        ilike: () => query,
        eq: () => query,
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
            data: table === "point_history" ? [] : [],
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

  expect(ordersByTable.get("officers")).toEqual([{ column: "name" }]);
});
