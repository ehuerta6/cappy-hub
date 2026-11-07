import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/current-officer", () => ({ requireCurrentOfficer: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/academic-periods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-periods")>()),
  getAcademicPeriodData: async () => ({
    periods: [],
    currentDate: "2026-11-01",
    currentPeriodId: null,
  }),
}));

import { requireCurrentOfficer } from "@/lib/current-officer";
import { createClient } from "@/lib/supabase/server";
import {
  dashboardActionItems,
  loadDashboardActionItems,
} from "@/app/(protected)/dashboard-action-items";
import DashboardPage from "@/app/(protected)/page";

const officer = {
  id: 8,
  name: "Current officer",
  positionName: "Officer",
  positionCode: "officer",
  positionId: 1,
  applicationRole: "officer",
  branchIds: [1],
  authUserId: "current-user",
} as const;
let actor: Awaited<ReturnType<typeof requireCurrentOfficer>>;
const assignment = (officerId = 8, completedAt: string | null = null) => ({
  officer_id: officerId,
  completed_at: completedAt,
});
const task = (id: number, assignments = [assignment()], changes = {}) => ({
  id,
  title: `Task ${id}`,
  due_date: "2026-10-05",
  due_time: null,
  task_officer_assignments: assignments,
  removed_at: null,
  ...changes,
});
const warning = (id: number, changes = {}) => ({
  id,
  created_at: "2026-10-03T12:00:00Z",
  status: "pending",
  officers: { name: "Alex" },
  warning_approvals: [{ approver_officer_id: 8, decision: "pending" }],
  ...changes,
});
let tasks: ReturnType<typeof task>[];
let warnings: ReturnType<typeof warning>[];
let discoveryEventRows: {
  id: number;
  name: string;
  event_date: string;
  starts_at: string;
  ends_at: string;
  max_volunteers: number;
  event_officers: { officer_id: number; removed_at: string | null }[];
}[];
let urls: URL[];
let queryError: boolean;
let failingTables: Set<string>;

// Exercise the real Supabase query builder against synthetic responses. Filter
// before limit, as PostgREST does; warning rows available here represent RLS reads.
const mockFetch = async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  urls.push(url);
  const table = url.pathname.split("/").at(-1);
  if (queryError || failingTables.has(table ?? ""))
    return new Response(JSON.stringify({ message: "Query failed" }), {
      status: 500,
    });
  if (table === "dashboard_summary")
    return Response.json({ active_officer_count: 12, half_year_points: 42 });
  if (table === "officer_point_totals")
    return Response.json({ total_points: 7 });
  if (table === "events") {
    const rows = discoveryEventRows
      .filter(
        (event) =>
          !event.event_officers.some(
            (signup) =>
              signup.officer_id === actor.id && signup.removed_at === null,
          ),
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, Number(url.searchParams.get("limit")));
    return Response.json(
      rows.map(
        ({ id, name, event_date, starts_at, ends_at, max_volunteers }) => ({
          id,
          name,
          event_date,
          starts_at,
          ends_at,
          max_volunteers,
          active_signup: [],
        }),
      ),
    );
  }
  if (table !== "tasks" && table !== "officer_warnings")
    return Response.json([]);
  const source = table === "tasks" ? tasks : warnings;
  const rows = source
    .filter((row) => {
      for (const [column, filter] of url.searchParams) {
        if (["select", "order", "limit"].includes(column)) continue;
        const [parent, child] = column.split(".");
        const record = row as unknown as Record<string, unknown>;
        const relation = record[parent];
        const values = child
          ? Array.isArray(relation)
            ? relation.map((entry) => entry[child])
            : [(relation as Record<string, unknown> | null)?.[child]]
          : [relation];
        if (
          !values.some((value) => {
            if (filter === "is.null") return value === null;
            if (filter === "not.is.null")
              return value !== null && value !== undefined;
            if (filter.startsWith("eq."))
              return String(value) === filter.slice(3);
            if (filter.startsWith("neq."))
              return value !== undefined && String(value) !== filter.slice(4);
            if (filter.startsWith("in. ("))
              return filter.slice(5, -1).split(",").includes(String(value));
            throw new Error(`Unsupported filter: ${filter}`);
          })
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      for (const order of (url.searchParams.get("order") ?? "").split(",")) {
        const column = order.split(".")[0] as keyof typeof a;
        const first = a[column],
          second = b[column];
        const comparison =
          typeof first === "number"
            ? first - (second as number)
            : String(first).localeCompare(String(second));
        if (comparison) return comparison;
      }
      return 0;
    });
  return Response.json(rows.slice(0, Number(url.searchParams.get("limit"))));
};
const client = () =>
  createSupabaseClient("http://localhost:54321", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: mockFetch },
  });
const load = () => loadDashboardActionItems(client(), actor);
const render = async () => renderToStaticMarkup(await DashboardPage({}));
beforeEach(() => {
  actor = { ...officer, branchIds: [...officer.branchIds] };
  tasks = [];
  warnings = [];
  discoveryEventRows = [];
  urls = [];
  queryError = false;
  failingTables = new Set();
  vi.mocked(requireCurrentOfficer).mockImplementation(async () => actor);
  vi.mocked(createClient).mockImplementation(async () => client());
});

it("includes only this Officer's incomplete assignments", async () => {
  tasks = [
    task(1),
    task(2, [assignment(8, "2026-10-03")]),
    task(3, [assignment(9)]),
    task(4, [assignment(8), assignment(9, "2026-10-03")]),
    task(5, [], { removed_at: "2026-10-03" }),
  ];
  const result = await load();
  expect(result!.items.map((item) => [item.key, item.status])).toEqual([
    ["task-1", "Not completed"],
    ["task-4", "Not completed"],
  ]);
  const taskUrl = urls.find((url) => url.pathname.endsWith("tasks"))!;
  expect(taskUrl.searchParams.get("task_officer_assignments.officer_id")).toBe(
    "eq.8",
  );
  expect(
    taskUrl.searchParams.get("task_officer_assignments.completed_at"),
  ).toBe("is.null");
  expect(taskUrl.searchParams.get("select")).toContain(
    "task_officer_assignments!inner",
  );
});

it("does not add manager approval tasks to the dashboard", async () => {
  actor.positionCode = "president";
  const managerTask = task(9, [assignment(7, "2026-10-03")]);
  expect(dashboardActionItems(actor, [managerTask]).items).toEqual([]);
});

it("shows an optional Task due time on its dashboard action item", () => {
  const result = dashboardActionItems(actor, [
    task(12, [assignment()], { due_time: "15:00:00" }),
  ]);
  expect(result.items[0]).toMatchObject({
    dueDate: "2026-10-05",
    dueTime: "15:00:00",
  });
});

it("merges signed-up Events and their reminders into the personal action list", () => {
  const result = dashboardActionItems(
    actor,
    [],
    [
      {
        id: 42,
        name: "Workshop",
        event_date: "2026-11-08",
        starts_at: "2026-11-08T18:00:00Z",
      },
    ],
    [
      {
        id: 7,
        title: "Event reminder: Workshop",
        kind: "event.reminder",
        entity_type: "event",
        entity_id: 42,
        href: "/events/42",
        created_at: "2026-11-07T12:00:00Z",
      },
    ],
  );

  expect(result.items).toEqual([
    expect.objectContaining({
      key: "event:42",
      title: "Workshop",
      href: "/events/42",
      status: "Reminder due",
      reminder: "Reminder due",
    }),
  ]);
});

it("keeps important Event updates actionable without a signup row", () => {
  const result = dashboardActionItems(
    actor,
    [],
    [],
    [
      {
        id: 70,
        title: "New Event: Officer Meeting",
        kind: "event.created",
        entity_type: "event",
        entity_id: 42,
        href: "/events/42",
        created_at: "2026-11-07T12:00:00Z",
      },
    ],
  );

  expect(result.items).toEqual([
    expect.objectContaining({
      key: "notification-event:42",
      title: "New Event: Officer Meeting",
      href: "/events/42",
      status: "Needs review",
    }),
  ]);
});

it("keeps important Task updates actionable without an assignment row", () => {
  const result = dashboardActionItems(
    actor,
    [],
    [],
    [
      {
        id: 71,
        title: "Task completed: Update website",
        kind: "task.completed",
        entity_type: "task",
        entity_id: 43,
        href: "/tasks/43",
        created_at: "2026-11-07T12:00:00Z",
      },
    ],
  );

  expect(result.items).toEqual([
    expect.objectContaining({
      key: "notification-task:43",
      title: "Task completed: Update website",
      href: "/tasks/43",
      status: "Needs review",
    }),
  ]);
});

it("keeps Points and Warning updates actionable until reviewed", () => {
  const result = dashboardActionItems(
    actor,
    [],
    [],
    [
      {
        id: 8,
        title: "Points updated",
        kind: "point.changed",
        entity_type: "point",
        entity_id: 4001,
        href: "/points",
        created_at: "2026-11-07T12:00:00Z",
      },
      {
        id: 9,
        title: "Warning updated",
        kind: "warning.changed",
        entity_type: "warning",
        entity_id: 3001,
        href: "/officers/8",
        created_at: "2026-11-07T11:00:00Z",
      },
    ],
  );

  expect(result.items.map((item) => [item.title, item.href])).toEqual([
    ["Warning updated", "/officers/8"],
    ["Points updated", "/points"],
  ]);
});

it("does not query or prompt for leadership Warning decisions, including legacy pending records", async () => {
  actor.applicationRole = "admin";
  warnings = [
    warning(1),
    warning(2, { status: "approved" }),
    warning(3, { status: "rejected" }),
  ];
  const html = await render();
  expect(urls.some((url) => url.pathname.endsWith("officer_warnings"))).toBe(
    false,
  );
  expect(html).not.toContain("Warning for Alex");
  expect(html).not.toContain("Needs decision");
  expect(html).not.toContain("View warning decisions");
  expect(html).toContain("You’re all caught up.");
});

it("orders personal Tasks by due date and ID", async () => {
  tasks = [
    task(4, [assignment()], { due_date: "2026-10-06" }),
    task(2),
    task(1, [assignment()], { due_date: "2026-10-02" }),
  ];
  expect((await load()).items.map((item) => item.key)).toEqual([
    "task-1",
    "task-2",
    "task-4",
  ]);
});

it("caps the Task preview at five with a bounded source query", async () => {
  tasks = Array.from({ length: 20 }, (_, i) => task(i + 1));
  const html = await render();
  const section = html
    .split('aria-labelledby="action-items-title"')[1]
    .split("</section>")[0];
  expect(section.match(/<li>/g)).toHaveLength(5);
  expect(section).toContain('href="/tasks/5"');
  expect(section).not.toContain('href="/tasks/6"');
  expect(section).toContain(
    "Showing the first 5 items. Open the related Event, Task, Points, or Officer record for details.",
  );
  for (const url of urls.filter((url) => url.pathname.endsWith("tasks"))) {
    expect(url.searchParams.get("limit")).toBe("6");
    expect(url.searchParams.get("order")).toMatch(/,id.asc$/);
  }
});

it("renders personal completion status with canonical links", async () => {
  tasks = [task(8)];
  const html = await render();
  const section = html
    .split('aria-labelledby="action-items-title"')[1]
    .split("</section>")[0];
  expect(section).toContain("Task 8");
  expect(section).toContain('href="/tasks/8"');
  expect(section).toContain("Oct 5, 2026");
  expect(section).toContain("Not completed");
  expect(section).not.toContain("<form");
});

it("keeps the empty state lightweight and preserves profile and summary content", async () => {
  const html = await render();
  expect(html).toContain("You’re all caught up.");
  expect(html).not.toContain("<ul");
  expect(html).not.toContain("<table");
  for (const label of [
    "Club summary",
    "Upcoming events",
    "Recent point activity",
  ])
    expect(html).toContain(`aria-label="${label}"`);
  expect(html).toContain("View your profile");
  expect(html).toContain('href="/officers/8"');
  const summary = html
    .split('aria-label="Club summary"')[1]
    .split("</section>")[0];
  expect(summary.match(/<dt\b/g)).toHaveLength(3);
  expect(summary).toContain("Active officers");
  expect(summary).toContain("Upcoming events");
  expect(summary).toContain("Points this period");
  expect(html.indexOf('aria-label="Club summary"')).toBeLessThan(
    html.indexOf('aria-labelledby="action-items-title"'),
  );
});

it("filters signed-up Events before the five-item discovery limit", async () => {
  discoveryEventRows = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    name: `Discovery Event ${index + 1}`,
    event_date: "2026-11-10",
    starts_at: `2026-11-${String(index + 10).padStart(2, "0")}T18:00:00Z`,
    ends_at: `2026-11-${String(index + 10).padStart(2, "0")}T19:00:00Z`,
    max_volunteers: 10,
    event_officers:
      index < 5 ? [{ officer_id: actor.id, removed_at: null }] : [],
  }));

  const html = await render();
  const eventQuery = urls.find((url) => url.pathname.endsWith("/events"));

  expect(eventQuery?.searchParams.get("limit")).toBe("5");
  expect(eventQuery?.searchParams.get("active_signup.officer_id")).toBe(
    `eq.${actor.id}`,
  );
  expect(eventQuery?.searchParams.get("active_signup.removed_at")).toBe(
    "is.null",
  );
  expect(eventQuery?.searchParams.get("active_signup")).toBe("is.null");
  expect(html).toContain("Discovery Event 6");
  expect(html).not.toContain("Discovery Event 1");
});

it("preserves other Dashboard content when recent point activity is unavailable", async () => {
  failingTables.add("point_transactions");
  const html = await render();
  expect(html).toContain('aria-label="Club summary"');
  expect(html).toContain('aria-label="Upcoming events"');
  expect(html).toContain("Recent point activity unavailable");
  expect(html).not.toContain("No point transactions yet.");
});

it("reports Task source failures without a false empty-state success", async () => {
  tasks = [task(12)];
  failingTables.add("tasks");
  const result = await load();
  const html = await render();
  const section = html
    .split('aria-labelledby="action-items-title"')[1]
    .split("</section>")[0];
  expect(result.items).toEqual([]);
  expect(result.unavailableSources).toEqual({
    tasks: true,
    events: false,
    notifications: false,
  });
  expect(section).not.toContain("You’re all caught up.");
  expect(section).toContain(
    "Some action items are unavailable. Reload to retry.",
  );
  expect(section).toContain("Showing available items only.");
  expect(section).not.toContain("Warning decisions");
});
