import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  actor: { id: 7, applicationRole: "officer" } as {
    id: number;
    applicationRole: string;
    positionCode?: string;
  },
  targetOfficerId: 7,
  pointCount: 11,
  ranges: [] as Array<{ table: string; from: number; to: number }>,
  orders: [] as Array<{ table: string; column: string; options?: unknown }>,
  operations: [] as string[],
  eventRows: [] as Array<{ events: Record<string, unknown> }>,
  redirects: [] as string[],
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
      let start = 0;
      let end = 24;
      const query = {
        select: (_columns?: string, options?: { head?: boolean }) => {
          countOnly = options?.head === true;
          return query;
        },
        eq: () => query,
        is: () => query,
        neq: () => query,
        not: () => query,
        order: (column: string, options?: unknown) => {
          state.orders.push({ table, column, options });
          state.operations.push(`${table}:order:${column}`);
          return query;
        },
        range: (from: number, to: number) => {
          start = from;
          end = to;
          state.ranges.push({ table, from, to });
          state.operations.push(`${table}:range`);
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
                      status: "pending",
                      voided_at: null,
                      created_at: `2099-10-0${id}T00:00:00Z`,
                      reason: `Warning reason ${id}`,
                      warning_approvals: [
                        {
                          approver_id: "approver-1",
                          approver_role: "president",
                          approver_officer_id: 2,
                          decision: "approved",
                        },
                      ],
                    }))
                  : [],
            count:
              table === "officer_warnings"
                ? 6
                : table === "event_officers"
                  ? 7
                  : table === "point_transactions"
                    ? state.pointCount
                    : 0,
            error: null,
          }).then((result) =>
            resolve({
              ...result,
              data: countOnly
                ? null
                : (result.data as unknown[]).slice(start, end + 1),
            }),
          ),
      };
      return query;
    },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("Not found");
  },
  redirect: (url: string) => {
    state.redirects.push(url);
  },
}));

import OfficerDetail from "@/app/(protected)/officers/[id]/page";

it("shows only active Events in Officer detail associations", async () => {
  state.actor = { id: 7, applicationRole: "officer" };
  state.targetOfficerId = 7;
  state.ranges = [];
  state.orders = [];
  state.operations = [];
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );

  expect(html).toContain("Active event");
  expect(html).not.toContain("Cancelled event");
  expect(html).not.toContain("Removed event");
  expect(html).toContain("Warning reason 1");
  expect(html).not.toContain('aria-label="Warning status"');
  expect(html).toContain("Warning reason 2");
  expect(html).not.toContain("Warning reason 3");
  expect(state.ranges).toContainEqual({
    table: "officer_warnings",
    from: 0,
    to: 1,
  });
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
  const eventOrderIndex = state.orders.findIndex(
    ({ table, column }) =>
      table === "event_officers" && column === "events(event_date)",
  );
  expect(eventOrderIndex).toBeGreaterThanOrEqual(0);
  expect(
    state.operations.indexOf("event_officers:order:events(event_date)"),
  ).toBeLessThan(state.operations.indexOf("event_officers:range"));
  expect(state.ranges).toContainEqual({
    table: "event_officers",
    from: 0,
    to: 3,
  });
  expect(state.ranges).toContainEqual({
    table: "point_transactions",
    from: 0,
    to: 2,
  });
});

it("keeps Warning status navigation hidden when an Officer views another profile", async () => {
  state.actor = { id: 9, applicationRole: "officer" };
  state.targetOfficerId = 7;
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );

  expect(html).toContain('aria-label="Officer profile sections"');
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

  state.actor = { id: 9, applicationRole: "officer", positionCode: "lead" };
  const anotherProfile = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(anotherProfile).not.toContain('aria-label="Warnings"');
});

it("shows the requested Warning status as active and preserves the legacy URL", async () => {
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
  expect(html).toContain(
    'aria-current="page" class="border-b-2 px-3 py-2 border-foreground font-semibold" href="/officers/7?warningStatus=pending&amp;returnTo=%2Fofficers%3Fq%3Dclub"',
  );
  expect(html).toContain("Warning reason 1");
  expect(html).toContain("Warning reason 3");
});

it("uses server-side five-row paging for the full Point section", async () => {
  state.actor = { id: 7, applicationRole: "officer" };
  state.targetOfficerId = 7;
  state.ranges = [];
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ section: "points", page: "2" }),
    }),
  );

  expect(html).toContain('aria-current="page"');
  expect(state.ranges).toContainEqual({
    table: "point_transactions",
    from: 5,
    to: 9,
  });
});

it.each(["0", "abc", "9007199254740992"])(
  "canonicalizes invalid page %s to page one in the active section",
  async (page) => {
    state.actor = { id: 7, applicationRole: "officer" };
    state.targetOfficerId = 7;
    state.redirects = [];

    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({
        section: "events",
        page,
        returnTo: "/officers?q=club",
      }),
    });

    expect(state.redirects).toContain(
      "/officers/7?returnTo=%2Fofficers%3Fq%3Dclub&section=events",
    );
  },
);

it("preserves the Warning filter when canonicalizing an invalid Warning page", async () => {
  state.actor = { id: 99, applicationRole: "admin" };
  state.targetOfficerId = 7;
  state.redirects = [];

  await OfficerDetail({
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve({
      section: "warnings",
      page: "0",
      warningStatus: "approved",
      returnTo: "/officers?q=club",
    }),
  });

  expect(state.redirects).toContain(
    "/officers/7?returnTo=%2Fofficers%3Fq%3Dclub&warningStatus=approved&section=warnings",
  );
});

it("orders paginated associated Events by date before range despite reversed IDs", async () => {
  state.actor = { id: 7, applicationRole: "officer" };
  state.targetOfficerId = 7;
  state.eventRows = Array.from({ length: 7 }, (_, index) => ({
    events: {
      id: index + 1,
      name: `Event ${7 - index}`,
      event_date: `2099-10-${String(8 - index).padStart(2, "0")}`,
      starts_at: `2099-10-${String(8 - index).padStart(2, "0")}T23:00:00Z`,
      ends_at: `2099-10-${String(9 - index).padStart(2, "0")}T01:00:00Z`,
      status: "upcoming",
      deleted_at: null,
    },
  }));
  state.orders = [];
  state.operations = [];
  state.ranges = [];

  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ section: "events", page: "2" }),
    }),
  );

  expect(state.ranges).toContainEqual({
    table: "event_officers",
    from: 5,
    to: 9,
  });
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
  expect(
    state.operations.indexOf("event_officers:order:events(event_date)"),
  ).toBeLessThan(state.operations.indexOf("event_officers:range"));
  expect(html.indexOf("Event 2")).toBeLessThan(html.indexOf("Event 1"));
});
