import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/current-officer", () => ({ requireCurrentOfficer: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

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
const render = async () => renderToStaticMarkup(await DashboardPage());
beforeEach(() => {
  actor = { ...officer, branchIds: [...officer.branchIds] };
  tasks = [];
  warnings = [];
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
  expect(dashboardActionItems(actor, [managerTask], []).items).toEqual([]);
});

it("includes only current pending snapshotted warning decisions, even for admins", async () => {
  actor.applicationRole = "admin";
  warnings = [
    warning(1),
    warning(2, {
      warning_approvals: [{ approver_officer_id: 9, decision: "pending" }],
    }),
    warning(3, {
      warning_approvals: [{ approver_officer_id: 8, decision: "approved" }],
    }),
    warning(4, { status: "rejected" }),
    warning(5, { status: "approved" }),
  ];
  const html = await render();
  expect(html).toContain('href="/officers#warning-1"');
  expect(html).toContain("Warning for Alex");
  for (const id of [2, 3, 4, 5]) expect(html).not.toContain(`warning-${id}`);
  const url = urls.find((url) => url.pathname.endsWith("officer_warnings"))!;
  expect(url.searchParams.get("warning_approvals.approver_officer_id")).toBe(
    "eq.8",
  );
  expect(url.searchParams.get("warning_approvals.decision")).toBe("eq.pending");
  expect(url.searchParams.get("status")).toBe("eq.pending");
  expect(url.searchParams.get("select")).toContain("warning_approvals!inner");
  expect(url.searchParams.get("select")).not.toContain("reason");
});

it("renders no unauthorized warning data when RLS returns no visible warnings", async () => {
  const html = await render();
  expect(html).not.toContain("Warning for");
  expect(html).not.toContain("Needs decision");
  expect(html).not.toContain("View warning decisions");
  expect(html).toContain("You&#x27;re all caught up.");
});

it("prioritizes pending warnings and keeps Tasks ordered by due date and ID", async () => {
  tasks = [
    task(4, [assignment()], { due_date: "2026-10-06" }),
    task(2),
    task(1, [assignment()], { due_date: "2026-10-02" }),
  ];
  warnings = [
    warning(3),
    warning(2),
    warning(1, { created_at: "2026-10-01T00:00:00Z" }),
  ];
  expect((await load())!.items.map((item) => item.key)).toEqual([
    "warning-1",
    "warning-2",
    "warning-3",
    "task-1",
    "task-2",
  ]);
  tasks = [];
  expect((await load())!.items.map((item) => item.key)).toEqual([
    "warning-1",
    "warning-2",
    "warning-3",
  ]);
});

it("keeps a warning decision visible alongside five future Tasks", async () => {
  tasks = Array.from({ length: 5 }, (_, index) =>
    task(index + 1, [assignment()], {
      due_date: `2026-10-${String(index + 5).padStart(2, "0")}`,
    }),
  );
  warnings = [warning(1)];

  const result = await load();
  expect(result!.items.map((item) => item.key)).toEqual([
    "warning-1",
    "task-1",
    "task-2",
    "task-3",
    "task-4",
  ]);
  expect(result!.items).toHaveLength(5);
  expect(result!.hasMore).toBe(true);
  expect(result!.hasPendingWarnings).toBe(true);
});

it("caps the summary at five and bounds all source queries", async () => {
  actor.applicationRole = "admin";
  tasks = Array.from({ length: 20 }, (_, i) => task(i + 1));
  warnings = Array.from({ length: 20 }, (_, i) => warning(i + 1));
  const html = await render();
  const section = html
    .split('aria-label="Your action items"')[1]
    .split("</section>")[0];
  expect(section.match(/<li>/g)).toHaveLength(5);
  expect(section).toContain('href="/officers#warning-5"');
  expect(section).not.toContain('href="/officers#warning-6"');
  expect(section).toContain("Showing the first 5 items");
  expect(section).toContain('href="/tasks"');
  expect(section).toContain('href="/officers"');
  expect(
    [...section.matchAll(/href="\/officers#warning-(\d+)"/g)].map(
      (match) => match[1],
    ),
  ).toEqual(["1", "2", "3", "4", "5"]);
  for (const url of urls.filter((url) =>
    ["tasks", "officer_warnings"].includes(url.pathname.split("/").at(-1)!),
  )) {
    expect(url.searchParams.get("limit")).toBe("6");
    expect(url.searchParams.get("order")).toMatch(/,id.asc$/);
  }
});

it("renders personal completion status and warning decisions with canonical links", async () => {
  tasks = [task(8, [assignment()])];
  warnings = [warning(2)];

  const html = await render();
  const section = html
    .split('aria-label="Your action items"')[1]
    .split("</section>")[0];

  expect(section).toContain("Task 8");
  expect(section).toContain('href="/tasks/8"');
  expect(section).toContain("Due Oct 5, 2026");
  expect(section).toContain("Not completed");
  expect(section).not.toContain("Awaiting approval");
  expect(section).toContain('href="/officers#warning-2"');
  expect(section).toContain("Warning for Alex");
  expect(section).toContain("Needs decision");
  expect(section).not.toContain("<form");
});

it("keeps View all Tasks available without a pending warning decision", async () => {
  tasks = Array.from({ length: 6 }, (_, index) => task(index + 1));
  const html = await render();
  const section = html
    .split('aria-label="Your action items"')[1]
    .split("</section>")[0];

  expect(section).toContain('href="/tasks"');
  expect(section).not.toContain("View warning decisions");
  expect(section).toContain("Showing the first 5 items. View Tasks for more.");
  expect(section).not.toContain("warning decisions for more");
});

it("keeps the empty state lightweight and preserves profile, metrics and summary layout", async () => {
  const html = await render();
  expect(html).toContain("You&#x27;re all caught up.");
  expect(html).not.toContain("<ul");
  expect(html).not.toContain("<table");
  for (const label of [
    "Your profile",
    "Summary",
    "Upcoming events",
    "Recent point activity",
  ])
    expect(html).toContain(`aria-label="${label}"`);
  const summary = html.split('aria-label="Summary"')[1].split("</section>")[0];
  expect(summary.match(/<dt\b/g)).toHaveLength(3);
  expect(summary).toContain("sm:grid-cols-3");
  expect(summary).toContain("sm:divide-x");
  expect(html).toContain("lg:grid-cols-2");
  expect(html.indexOf('aria-label="Summary"')).toBeLessThan(
    html.indexOf('aria-label="Your action items"'),
  );
});

it("preserves other Dashboard content when recent point activity is unavailable", async () => {
  failingTables.add("point_transactions");

  const html = await render();

  expect(html).toContain('aria-label="Summary"');
  expect(html).toContain('aria-label="Upcoming events"');
  expect(html).toContain("Recent point activity unavailable");
  expect(html).not.toContain("No point transactions yet.");
});
