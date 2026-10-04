import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: async () => ({ id: 1, applicationRole: "officer" }),
  canManageOfficers: () => false,
  isAdmin: () => false,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        limit: () => query,
        single: async () => ({ data: { total_points: 0 }, error: null }),
        maybeSingle: async () => ({
          data: {
            id: 7,
            name: "Synthetic Officer",
            positions: { name: "Officer" },
            officer_branches: [],
            application_role: "officer",
            status: "active",
          },
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === "event_officers"
                ? [
                    {
                      events: {
                        id: 10,
                        name: "Active event",
                        event_date: "2099-10-08",
                        starts_at: "2099-10-08T23:00:00Z",
                        ends_at: "2099-10-09T01:00:00Z",
                        status: "active",
                        deleted_at: null,
                      },
                    },
                    {
                      events: {
                        id: 11,
                        name: "Cancelled event",
                        event_date: "2099-10-08",
                        starts_at: "2099-10-08T23:00:00Z",
                        ends_at: "2099-10-09T01:00:00Z",
                        status: "cancelled",
                        deleted_at: null,
                      },
                    },
                    {
                      events: {
                        id: 12,
                        name: "Removed event",
                        event_date: "2099-10-08",
                        starts_at: "2099-10-08T23:00:00Z",
                        ends_at: "2099-10-09T01:00:00Z",
                        status: "active",
                        deleted_at: "2099-10-01T00:00:00Z",
                      },
                    },
                  ]
                : [],
            error: null,
          }).then(resolve),
      };
      return query;
    },
  }),
}));

import OfficerDetail from "@/app/(protected)/officers/[id]/page";

it("shows only active Events in Officer detail associations", async () => {
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );

  expect(html).toContain("Active event");
  expect(html).not.toContain("Cancelled event");
  expect(html).not.toContain("Removed event");
});
