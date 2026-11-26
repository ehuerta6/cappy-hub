import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  actor: { id: 7, applicationRole: "officer" } as {
    id: number;
    applicationRole: string;
    positionCode?: string;
  },
  targetOfficerId: 7,
  orders: [] as Array<{ table: string; column: string; options?: unknown }>,
  operations: [] as string[],
  eventRows: [] as Array<{ events: Record<string, unknown> }>,
  deletedWarnings: false,
}));

vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: async () => state.actor,
  canManageOfficers: () => state.actor.applicationRole === "admin",
  isAdmin: () => state.actor.applicationRole === "admin",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      let countOnly = false;
      const query = {
        select: (_columns?: string, options?: { head?: boolean }) => {
          countOnly = options?.head === true;
          return query;
        },
        eq: () => query,
        is: (column: string, value: unknown) => {
          state.operations.push(`${table}:is:${column}:${String(value)}`);
          return query;
        },
        neq: () => query,
        not: (column: string, operator: string, value: unknown) => {
          state.operations.push(
            `${table}:not:${column}:${operator}:${String(value)}`,
          );
          return query;
        },
        order: (column: string, options?: unknown) => {
          state.orders.push({ table, column, options });
          state.operations.push(`${table}:order:${column}`);
          return query;
        },
        limit: () => query,
        single: async () => ({ data: { total_points: 0 }, error: null }),
        maybeSingle: async () => ({
          data: {
            id: state.targetOfficerId,
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
                ? state.eventRows.length
                  ? state.eventRows
                  : [
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
                : table === "officer_warnings"
                  ? [1, 2, 3].map((id) => ({
                      id,
                      status: "approved",
                      voided_at: null,
                      deleted_at: state.deletedWarnings
                        ? "2026-10-12T00:00:00Z"
                        : null,
                      created_at: `2099-10-0${id}T00:00:00Z`,
                      reason: `Warning reason ${id}`,
                    }))
                  : [],
            count:
              table === "officer_warnings"
                ? 3
                : table === "event_officers"
                  ? 3
                  : 0,
            error: null,
          }).then((result) =>
            resolve({
              ...result,
              data: countOnly ? null : result.data,
            }),
          ),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/academic-periods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-periods")>()),
  getAcademicPeriodData: async () => ({
    periods: [],
    currentDate: "2026-11-01",
    currentPeriodId: null,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("Not found");
  },
  redirect: vi.fn(),
}));

import OfficerDetail from "@/app/(protected)/officers/[id]/page";

it("shows all active Events and warnings on the flattened Officer profile without sub-tabs", async () => {
  state.actor = { id: 7, applicationRole: "officer" };
  state.targetOfficerId = 7;
  state.orders = [];
  state.operations = [];
  state.eventRows = [];
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );

  expect(html).not.toContain('aria-label="Officer profile sections"');
  expect(html).toContain("Active event");
  expect(html).not.toContain("Cancelled event");
  expect(html).not.toContain("Removed event");
  expect(html).toContain("Warning reason 1");
  expect(html).toContain("Warning reason 2");
  expect(html).toContain("Warning reason 3");
  expect(html).not.toContain('aria-label="Warning status"');
  expect(state.orders).toContainEqual({
    table: "event_officers",
    column: "events(event_date)",
    options: { ascending: false },
  });
  expect(state.orders).toContainEqual({
    table: "event_officers",
    column: "events(id)",
    options: { ascending: false },
  });
});

it("keeps Warnings hidden when an Officer views another profile", async () => {
  state.actor = { id: 9, applicationRole: "officer" };
  state.targetOfficerId = 7;
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );

  expect(html).not.toContain("Warning status");
  expect(html).not.toContain("Warning reason 1");
});

it("allows a Lead to see their own permitted warnings but not another Officer's", async () => {
  state.actor = { id: 7, applicationRole: "officer", positionCode: "lead" };
  state.targetOfficerId = 7;
  const ownProfile = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(ownProfile).toContain('aria-label="Warnings"');
  expect(ownProfile).not.toContain('aria-label="Warning status"');
  expect(ownProfile).not.toContain("Edit warning");

  state.actor = { id: 9, applicationRole: "officer", positionCode: "lead" };
  const anotherProfile = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(anotherProfile).not.toContain('aria-label="Warnings"');
});

it("keeps everyday Admin Warning views simple and removes legacy approval details", async () => {
  state.actor = { id: 99, applicationRole: "admin" };
  state.targetOfficerId = 7;
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({
        warningStatus: "pending",
        returnTo: "/officers?q=club",
      }),
    }),
  );

  expect(html).toContain('aria-label="Warning status"');
  expect(html).toContain("Deleted");
  expect(html).toContain("All history");
  expect(html).not.toContain(">Pending</a>");
  expect(html).not.toContain("Historical approvals:");
  expect(html).not.toContain("Historical approval:");
  expect(html).toContain("Warning reason 1");
  expect(html).toContain("Warning reason 3");
  expect(html).toContain("Edit warning");
  expect(html).not.toContain("Approve warning?");
});

it("shows the Admin Deleted view with a Restore action", async () => {
  state.actor = { id: 99, applicationRole: "admin" };
  state.targetOfficerId = 7;
  state.deletedWarnings = true;
  state.operations = [];
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ warningStatus: "deleted" }),
    }),
  );

  expect(html).toContain("Restore");
  expect(state.operations).toContain("officer_warnings:not:deleted_at:is:null");
  state.deletedWarnings = false;
});
