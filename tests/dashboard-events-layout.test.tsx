import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Tables } from "@/lib/database.types";
import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: vi.fn(),
}));

vi.mock("@/lib/current-officer", () => ({ requireCurrentOfficer: vi.fn() }));
vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  isAdmin: (actor: { applicationRole: string }) =>
    actor.applicationRole === "admin",
  isLead: () => false,
  canSeeAllBranches: () => false,
  canManageEvent: () => false,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/events",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
      {
        id: 2,
        name: "Spring 2027",
        starts_on: "2027-01-05",
        ends_on: "2027-05-15",
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
      },
      {
        id: 3,
        name: "Spring 2026",
        starts_on: "2026-01-11",
        ends_on: "2026-05-15",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    currentDate: "2026-11-01",
    currentPeriodId: 1,
  }),
}));

import { requireCurrentOfficer } from "@/lib/current-officer";
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import EventsPage from "@/app/(protected)/events/page";
import DashboardPage from "@/app/(protected)/page";
import ProtectedLayout from "@/app/(protected)/layout";
import {
  SelfSignupForm,
  SignupForm,
} from "@/app/(protected)/events/event-controls";

const actor = {
  id: 8,
  branchIds: [],
  authUserId: "current-user",
  name: "Local Officer",
  positionName: "Secretary",
  applicationRole: "officer",
};
const upcoming: Pick<
  Tables<"events">,
  | "id"
  | "name"
  | "event_date"
  | "starts_at"
  | "ends_at"
  | "status"
  | "deleted_at"
  | "participation_points_per_hour_at_end"
  | "max_volunteers"
> & {
  event_types: { name: string };
  event_branches: { branches: { name: string } }[];
  event_officers: {
    officer_id: number;
    removed_at?: string | null;
    participation_type?: string;
  }[];
} = {
  id: 1,
  name: "Participating event",
  event_date: "2099-01-01",
  starts_at: "2099-01-01T12:00:00Z",
  ends_at: "2099-01-01T13:00:00Z",
  status: "upcoming",
  deleted_at: null,
  participation_points_per_hour_at_end: null,
  max_volunteers: null,
  event_types: { name: "Meeting" },
  event_branches: [],
  event_officers: [{ officer_id: 8, participation_type: "volunteer" }],
};
let events: (typeof upcoming)[];
let transactions: {
  id: number;
  points: number;
  reason: string;
  created_at: string;
  officers: { id: number; name: string };
  events: { id: number; name: string } | null;
  tasks: { id: number; title: string } | null;
}[];
let dashboardQueries: { table: string; operations: [string, unknown[]][] }[];
let countedEventIds: number[];
let periodSummaryCalls: number[];
const from = vi.fn((table: string) => {
  const operations: [string, unknown[]][] = [];
  const result = {
    data:
      table === "events"
        ? events
        : table === "point_transactions"
          ? transactions
          : table === "officer_point_totals"
            ? { total_points: 12.5 }
            : table === "dashboard_summary"
              ? {
                  active_officer_count: 24,
                  upcoming_event_count: 5,
                  half_year_points: 99,
                }
              : [],
    error: null,
  };
  const query = {
    select: (...args: unknown[]) => {
      operations.push(["select", args]);
      return query;
    },
    eq: (...args: unknown[]) => {
      operations.push(["eq", args]);
      return query;
    },
    neq: (...args: unknown[]) => {
      operations.push(["neq", args]);
      return query;
    },
    gte: (...args: unknown[]) => {
      operations.push(["gte", args]);
      return query;
    },
    is: (...args: unknown[]) => {
      operations.push(["is", args]);
      return query;
    },
    lte: (...args: unknown[]) => {
      operations.push(["lte", args]);
      return query;
    },
    not: (...args: unknown[]) => {
      operations.push(["not", args]);
      return query;
    },
    gt: (...args: unknown[]) => {
      operations.push(["gt", args]);
      return query;
    },
    order: (...args: unknown[]) => {
      operations.push(["order", args]);
      return query;
    },
    limit: (...args: unknown[]) => {
      operations.push(["limit", args]);
      return query;
    },
    range: (...args: unknown[]) => {
      operations.push(["range", args]);
      return query;
    },
    single: () => {
      operations.push(["single", []]);
      return Promise.resolve(result);
    },
    then: (resolve: (value: typeof result & { count?: number }) => unknown) => {
      const range = operations.find(([method]) => method === "range")?.[1];
      const head = operations.some(
        ([method, args]) =>
          method === "select" &&
          (args[1] as { head?: boolean } | undefined)?.head,
      );
      const visibleEvents = events.filter((event) =>
        operations.every(([method, args]) => {
          if (method === "gte" && args[0] === "event_date")
            return event.event_date >= String(args[1]);
          if (method === "lte" && args[0] === "event_date")
            return event.event_date <= String(args[1]);
          if (method === "gt" && args[0] === "ends_at")
            return event.ends_at > String(args[1]);
          if (method === "lte" && args[0] === "ends_at")
            return event.ends_at <= String(args[1]);
          if (method === "eq" && args[0] === "status")
            return event.status === args[1];
          if (method === "eq" && args[0] === "active_signup.officer_id")
            return !event.event_officers.some(
              (signup) =>
                signup.officer_id === args[1] && signup.removed_at == null,
            );
          if (method === "neq" && args[0] === "status")
            return event.status !== args[1];
          if (method === "is" && args[0] === "deleted_at")
            return event.deleted_at === args[1];
          if (method === "is" && args[0] === "active_signup.removed_at")
            return true;
          if (method === "is" && args[0] === "active_signup")
            return !event.event_officers.some(
              (signup) =>
                signup.officer_id === actor.id && signup.removed_at == null,
            );
          return true;
        }),
      );
      return Promise.resolve({
        ...result,
        data:
          table === "events" && range
            ? visibleEvents.slice(Number(range[0]), Number(range[1]) + 1)
            : table === "events" &&
                operations.some(([method]) => method === "limit")
              ? visibleEvents.slice(
                  0,
                  Number(
                    operations.find(([method]) => method === "limit")?.[1][0],
                  ),
                )
              : table === "point_transactions"
                ? transactions.slice(
                    0,
                    Number(
                      operations.find(([method]) => method === "limit")?.[1][0],
                    ),
                  )
                : result.data,
        count: table === "events" && head ? visibleEvents.length : undefined,
      }).then(resolve);
    },
  };
  dashboardQueries.push({ table, operations });
  return query;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    false,
  ] as never);
  transactions = [];
  dashboardQueries = [];
  countedEventIds = [];
  periodSummaryCalls = [];
  events = [
    upcoming,
    { ...upcoming, id: 2, name: "Available event", event_officers: [] },
  ];
  vi.mocked(requireCurrentOfficer).mockResolvedValue(actor as never);
  vi.mocked(getAuthorizationContext).mockResolvedValue(actor as never);
  vi.mocked(createClient).mockResolvedValue({
    from,
    rpc: (name: string, args?: { p_period_id?: number }) => {
      if (name === "academic_period_point_summary") {
        if (args?.p_period_id !== undefined)
          periodSummaryCalls.push(args.p_period_id);
        return {
          single: async () => ({
            data: {
              net_points: 99,
              ranking: [
                {
                  officer_id: 7,
                  officer_name: "Historical Officer",
                  points: 99,
                },
              ],
            },
            error: null,
          }),
        };
      }
      const counts = events.map((event) => ({
        event_id: event.id,
        confirmed_count: event.event_officers.length,
      }));
      return Object.assign(Promise.resolve({ data: counts, error: null }), {
        in: async (_column: string, ids: number[]) => {
          countedEventIds = ids;
          return {
            data: counts.filter(({ event_id }) => ids.includes(event_id)),
            error: null,
          };
        },
      });
    },
  } as never);
});
afterEach(() => vi.useRealTimers());
const renderEvents = async () =>
  renderToStaticMarkup(
    await EventsPage({ searchParams: Promise.resolve({ period: "none" }) }),
  );

it("keeps ended Events out of the default current-period view", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T20:00:00.000Z"));
  events = [
    {
      ...upcoming,
      name: "Past period Event",
      event_date: "2026-09-01",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T13:00:00Z",
    },
    {
      ...upcoming,
      id: 2,
      name: "Upcoming period Event",
      event_date: "2026-11-15",
      starts_at: "2026-11-15T12:00:00Z",
      ends_at: "2026-11-15T13:00:00Z",
      event_officers: [],
    },
    {
      ...upcoming,
      id: 3,
      name: "Cancelled period Event",
      event_date: "2026-11-20",
      starts_at: "2026-11-20T12:00:00Z",
      ends_at: "2026-11-20T13:00:00Z",
      status: "cancelled",
      event_officers: [],
    },
  ];
  const html = renderToStaticMarkup(
    await EventsPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).not.toContain("Past period Event");
  expect(html).not.toContain("Cancelled period Event");
  expect(html).toContain("Upcoming period Event");
  const pageQuery = dashboardQueries.find(
    ({ table, operations }) =>
      table === "events" && operations.some(([method]) => method === "range"),
  );
  expect(pageQuery?.operations).toContainEqual([
    "gte",
    ["event_date", "2026-11-02"],
  ]);
  expect(pageQuery?.operations).toContainEqual([
    "gt",
    ["ends_at", expect.any(String)],
  ]);
});

it("shows past Events only after selecting the Past filter", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T20:00:00.000Z"));
  events = [
    {
      ...upcoming,
      name: "Past period Event",
      event_date: "2026-09-01",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T13:00:00Z",
    },
    {
      ...upcoming,
      id: 2,
      name: "Upcoming period Event",
      event_date: "2026-11-15",
      starts_at: "2026-11-15T12:00:00Z",
      ends_at: "2026-11-15T13:00:00Z",
      event_officers: [],
    },
  ];
  const html = renderToStaticMarkup(
    await EventsPage({
      searchParams: Promise.resolve({ status: "past" }),
    }),
  );

  expect(html).toContain("Past period Event");
  expect(html).not.toContain("Upcoming period Event");
  expect(html).toContain('aria-label="Events table: Past events: Your events"');
});

it("shows the selected historical period as an intentional history view", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T20:00:00.000Z"));
  events = [
    {
      ...upcoming,
      name: "Spring history Event",
      event_date: "2026-04-15",
      starts_at: "2026-04-15T12:00:00Z",
      ends_at: "2026-04-15T13:00:00Z",
    },
    {
      ...upcoming,
      id: 2,
      name: "Outside selected period",
      event_date: "2026-09-01",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T13:00:00Z",
    },
  ];
  const html = renderToStaticMarkup(
    await EventsPage({ searchParams: Promise.resolve({ period: "3" }) }),
  );

  expect(html).toContain("Spring history Event");
  expect(html).not.toContain("Outside selected period");
  expect(html).toContain("All events in period");
  const pageQuery = dashboardQueries.find(
    ({ table, operations }) =>
      table === "events" && operations.some(([method]) => method === "range"),
  );
  expect(pageQuery?.operations).toContainEqual([
    "gte",
    ["event_date", "2026-01-11"],
  ]);
  expect(pageQuery?.operations).not.toContainEqual([
    "gt",
    ["ends_at", expect.any(String)],
  ]);
});

it("renders bounded Events in period tables grouped by participation", async () => {
  const html = await renderEvents();
  expect(html).toContain(">Your events</h3>");
  expect(html).toContain(">Other events</h3>");
  expect(html).toContain(
    'aria-label="Events table: Upcoming events: Your events"',
  );
  const your = html.split("Participating event</a>")[1].split("</tr>")[0];
  const other = html.split("Available event</a>")[1].split("</tr>")[0];
  expect(html).not.toContain('scope="rowgroup"');
  expect(your).toContain('aria-pressed="true"');
  expect(your).toContain('value="attendee"');
  expect(other).toContain(
    'aria-label="Sign Up as Volunteer for Available event (2 Points per hour)"',
  );
  expect(other).toContain("Upcoming");
  expect(html).toContain('<th scope="col">Action</th>');
  expect(html).not.toMatch(/Your participation|Your signup/i);
  expect(from.mock.calls.filter(([table]) => table === "events")).toHaveLength(
    3,
  );
  expect(
    dashboardQueries.find(
      ({ table, operations }) =>
        table === "events" && operations.some(([method]) => method === "range"),
    )?.operations,
  ).toContainEqual(["range", [0, 7]]);
});

it("offers signup while happening, but never for past, cancelled, removed or processed events", async () => {
  events = [
    {
      ...upcoming,
      name: "Happening",
      starts_at: "2000-01-01T12:00:00Z",
      event_officers: [],
    },
    {
      ...upcoming,
      name: "Past",
      ends_at: "2000-01-01T13:00:00Z",
      event_officers: [],
    },
    { ...upcoming, name: "Cancelled", status: "cancelled", event_officers: [] },
    {
      ...upcoming,
      name: "Removed",
      deleted_at: "2000-01-01",
      event_officers: [],
    },
    {
      ...upcoming,
      name: "Processed",
      participation_points_per_hour_at_end: 0,
      event_officers: [],
    },
  ];
  const html = await renderEvents();
  expect(html).toContain(
    'aria-label="Sign Up as Volunteer for Happening (2 Points per hour)"',
  );
  for (const name of ["Past", "Cancelled", "Removed", "Processed"])
    expect(html).not.toContain(`aria-label="Sign Up as Volunteer for ${name}`);
});

it("shows useful empty messages without empty tables", async () => {
  events = [];
  const html = await renderEvents();
  expect(html).toContain("No current events.");
  expect(html).not.toContain("<table");
});

it("keeps Dashboard as the page heading and identifies the current officer", async () => {
  const html = renderToStaticMarkup(await DashboardPage({}));
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toMatch(/<h1[^>]*>Dashboard<\/h1>/);
  expect(html).toContain("Local Officer");
  expect(html).toContain("Secretary");
  const profileStart = html.indexOf('href="/officers/8"');
  const profile = html.slice(profileStart, html.indexOf("</a>", profileStart));
  expect(profile).toContain("+12.5");
  expect(profile).toContain("pts");
  expect(profile).toContain("View your profile");
});

it("preserves all three summary metric values and the existing summary/activity queries", async () => {
  const html = renderToStaticMarkup(await DashboardPage({}));
  const summary = html
    .split('aria-label="Club summary"')[1]
    .split("</section>")[0];
  expect(summary).toContain("Active officers");
  expect(summary).toContain(">24</dd>");
  expect(summary).toContain("Upcoming events");
  expect(summary).toContain(">5</dd>");
  expect(html).toContain("Points this period");
  expect(html).toContain("+99");
  expect(periodSummaryCalls).toEqual([1]);

  const operations = (table: string) =>
    dashboardQueries.find((query) => query.table === table)?.operations ?? [];
  expect(operations("dashboard_summary")).toEqual([
    ["select", ["*"]],
    ["single", []],
  ]);
  expect(operations("officer_point_totals")).toEqual([
    ["select", ["total_points"]],
    ["eq", ["id", actor.id]],
    ["single", []],
  ]);
  expect(operations("events")).toEqual([
    [
      "select",
      [
        "*,event_types(name),active_signup:event_officers!left(officer_id,removed_at)",
      ],
    ],
    ["eq", ["active_signup.officer_id", actor.id]],
    ["is", ["active_signup.removed_at", null]],
    ["is", ["active_signup", null]],
    ["neq", ["status", "cancelled"]],
    ["is", ["deleted_at", null]],
    ["gt", ["starts_at", expect.any(String)]],
    ["order", ["starts_at"]],
    ["order", ["id"]],
    ["limit", [5]],
  ]);
  expect(operations("point_transactions")).toEqual([
    [
      "select",
      [
        "*,officers!point_transactions_officer_id_fkey(id,name),events(id,name),tasks(id,title)",
      ],
    ],
    ["is", ["removed_at", null]],
    ["order", ["created_at", { ascending: false }]],
    ["order", ["id", { ascending: false }]],
    ["limit", [5]],
  ]);
});

it("uses the database Point aggregate in a selected period overview", async () => {
  const html = renderToStaticMarkup(
    await DashboardPage({
      searchParams: Promise.resolve({ period: "2" }),
    }),
  );
  expect(html).toContain("Spring 2027");
  expect(html).toContain("Future period");
  expect(html).toContain("Period ranking");
  expect(html).toContain("Historical Officer");
  expect(html).toContain("+99");
  expect(periodSummaryCalls).toEqual([2]);
  expect(dashboardQueries.map(({ table }) => table)).not.toContain(
    "point_history",
  );
});

it("places the single sign out form and officer context inside the protected header", async () => {
  const html = renderToStaticMarkup(
    await ProtectedLayout({
      children: "Page content",
      params: Promise.resolve({}),
    }),
  );
  const header = html.split("</header>")[0];
  expect(header).not.toContain("Back to");
  expect(header).toContain("Local Officer");
  expect(header).toContain("Sign out");
  expect(header).toContain('aria-label="Switch to light theme"');
  expect(header).toContain("theme-toggle");
  expect(header).toContain("Local Officer");
  expect(html.match(/Sign out/g)).toHaveLength(1);
  expect(html.split("</header>")[1].split("<script>")[0]).toBe(
    '<main id="main-content" tabindex="-1" class="protected-page-width">Page content</main>',
  );
  expect(header).toContain('aria-current="page"');
  expect(header).not.toContain(">Admin</a>");
  vi.mocked(requireCurrentOfficer).mockResolvedValue({
    ...actor,
    applicationRole: "admin",
  } as never);
  expect(
    renderToStaticMarkup(
      await ProtectedLayout({ children: "", params: Promise.resolve({}) }),
    ),
  ).toContain('href="/admin"');
});

it("renders two accessible self-signup choices that share one form", () => {
  const html = renderToStaticMarkup(
    createElement(SelfSignupForm, { eventId: 2, eventName: "Available event" }),
  );
  expect(html).toContain('name="event_id" value="2"');
  expect(html).toContain('value="volunteer"');
  expect(html).toContain('value="attendee"');
  expect(html.match(/name="participation_type"/g)).toHaveLength(2);
  expect(html).toContain(">Sign Up</button>");
  expect(html).toContain(">Attend</button>");
  expect(html).not.toContain('name="officer_id"');
});

it("shows the selected participation type in the compact Event actions", () => {
  const volunteerHtml = renderToStaticMarkup(
    createElement(SelfSignupForm, {
      eventId: 2,
      eventName: "Available event",
      compact: true,
      currentType: "volunteer",
    }),
  );
  expect(volunteerHtml).toContain(">Signed up</button>");
  expect(volunteerHtml).toContain("compact-action-button--primary");
  expect(volunteerHtml).toContain('class="compact-signup-form"');
  expect(volunteerHtml).toContain('disabled="" aria-pressed="true"');
  expect(volunteerHtml).toContain(">Attend</button>");

  const attendeeHtml = renderToStaticMarkup(
    createElement(SelfSignupForm, {
      eventId: 2,
      eventName: "Available event",
      compact: true,
      currentType: "attendee",
    }),
  );
  expect(attendeeHtml).toContain(">Attending</button>");
  expect(attendeeHtml).toContain("compact-action-button--primary");
  expect(attendeeHtml).toContain('class="compact-signup-form"');
  expect(attendeeHtml).toContain('disabled="" aria-pressed="true"');
  expect(attendeeHtml).toContain(">Sign Up</button>");
});

it("keeps the compact remove action sized to its button", () => {
  const html = renderToStaticMarkup(
    createElement(SignupForm, {
      eventId: 2,
      officerId: 8,
      remove: true,
      compact: true,
    }),
  );
  expect(html).toContain('class="compact-signup-form"');
  expect(html).toContain("compact-action-button--remove");
  expect(html).toContain(">Remove signup</button>");
});

it("disables the row button while signup is pending and exposes accessible result text", () => {
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    true,
  ] as never);
  const pending = renderToStaticMarkup(
    createElement(SelfSignupForm, { eventId: 2, eventName: "Available event" }),
  );
  expect(pending).toContain("disabled");
  expect(pending).toContain("Saving…");
  vi.mocked(useActionState).mockReturnValue([
    { error: "Signups are closed for this event", success: "" },
    vi.fn(),
    false,
  ] as never);
  expect(
    renderToStaticMarkup(
      createElement(SelfSignupForm, {
        eventId: 2,
        eventName: "Available event",
      }),
    ),
  ).toContain('role="alert"');
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "Officer added" },
    vi.fn(),
    false,
  ] as never);
  expect(
    renderToStaticMarkup(
      createElement(SelfSignupForm, {
        eventId: 2,
        eventName: "Available event",
      }),
    ),
  ).toContain('role="status"');
});

it("keeps main pages free of contextual navigation and shows the compact upcoming schedule", async () => {
  expect(await renderEvents()).not.toContain("Back to");
  const html = renderToStaticMarkup(await DashboardPage({}));
  expect(html).not.toContain("Back to");
  expect(html).toContain("Jan 1 · 5:00–6:00 AM");
});

it("shows a bounded upcoming-event preview of Events without an active signup", async () => {
  events = Array.from({ length: 12 }, (_, index) => ({
    ...upcoming,
    id: index + 1,
    name: `Upcoming event ${index + 1}`,
    event_officers: index === 0 ? [{ officer_id: actor.id }] : [],
  }));
  const html = renderToStaticMarkup(await DashboardPage({}));
  const list = html
    .split('aria-label="Upcoming events"')[1]
    .split("</section>")[0];
  expect(list).toContain("<ul");
  expect(list.match(/<li\b/g)).toHaveLength(5);
  expect(list).toContain('href="/events/6"');
  expect(list).not.toContain('href="/events/7"');
  expect(list).not.toContain("Signed up");
  expect(list).toContain("Not signed up");
  expect(list).toContain("0 officers");
  expect(list).toContain('href="/events"');
  expect(countedEventIds).toEqual([2, 3, 4, 5, 6]);
  expect(html).toContain('href="/points?view=history"');
  expect(html).not.toContain("<table");
  expect(html).toContain('data-page-width="wide"');
});

it("summarizes signed point values with officer and event/task links or a manual reason", async () => {
  const transaction = {
    id: 1,
    points: 2.5,
    reason: "Participation",
    created_at: "2026-10-03T12:00:00Z",
    officers: { id: 8, name: "Local Officer" },
    events: { id: 3, name: "Workshop" },
    tasks: null,
  };
  transactions = [
    transaction,
    {
      ...transaction,
      id: 2,
      points: -1,
      events: null,
      tasks: { id: 4, title: "Flyer" },
    },
    {
      ...transaction,
      id: 3,
      points: 0,
      events: null,
      reason: "Manual adjustment",
    },
  ];
  const html = renderToStaticMarkup(await DashboardPage({}));
  const list = html
    .split('aria-label="Recent point activity"')[1]
    .split("</section>")[0];
  expect(list).toContain("<ul");
  expect(list.match(/<li\b/g)).toHaveLength(3);
  for (const href of ["/officers/8", "/events/3", "/tasks/4"])
    expect(list).toContain(`href="${href}"`);
  for (const text of ["+2.5", "-1", "Manual adjustment", "Oct 3, 2026"])
    expect(list).toContain(text);
  expect(list).toContain('dateTime="2026-10-03T12:00:00Z"');
  expect(list).not.toContain("<table");
});

it("shows only the five newest Point transactions and keeps full Points navigation", async () => {
  const transaction = {
    id: 1,
    points: 2.5,
    reason: "Participation",
    created_at: "2026-10-03T12:00:00Z",
    officers: { id: 8, name: "Local Officer" },
    events: null,
    tasks: null,
  };
  transactions = Array.from({ length: 8 }, (_, index) => ({
    ...transaction,
    id: index + 1,
    reason: `Transaction ${index + 1}`,
    created_at: `2026-10-${String(13 - index).padStart(2, "0")}T12:00:00Z`,
  }));

  const html = renderToStaticMarkup(await DashboardPage({}));
  const list = html
    .split('aria-label="Recent point activity"')[1]
    .split("</section>")[0];
  expect(list.match(/<li\b/g)).toHaveLength(5);
  expect(list).toContain("Transaction 1");
  expect(list).toContain("Transaction 5");
  expect(list).not.toContain("Transaction 6");
  expect(list).toContain('href="/points?view=history"');
});

it("keeps dashboard empty states and destination links without empty lists or tables", async () => {
  events = [];
  const html = renderToStaticMarkup(await DashboardPage({}));
  expect(html).toContain("No upcoming events.");
  expect(html).toContain("No point transactions yet.");
  expect(html).toContain("View events");
  expect(html).toContain("View history");
  expect(html).toContain('href="/points?view=history"');
  expect(html).not.toContain("<ul");
  expect(html).not.toContain("<table");
});
