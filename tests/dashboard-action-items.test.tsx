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
  positionId: 1,
  applicationRole: "officer",
  branchIds: [1],
  authUserId: "current-user",
} as const;
let actor: Awaited<ReturnType<typeof requireCurrentOfficer>>;
const task = (id: number, changes = {}) => ({
  id,
  title: `Task ${id}`,
  due_date: "2026-10-05",
  branch_id: 1,
  approval_required: false,
  removed_at: null,
  task_assignments: { officer_id: 8, completed_at: null, approved_at: null },
  ...changes,
});
const completed = {
  officer_id: 8,
  completed_at: "2026-10-03",
  approved_at: null,
};
const awaiting = (id: number, officerId = 9, branchId = 1) =>
  task(id, {
    branch_id: branchId,
    approval_required: true,
    task_assignments: { ...completed, officer_id: officerId },
  });
const warning = (id: number, changes = {}) => ({
  id,
  created_at: "2026-10-03T12:00:00Z",
  status: "pending",
  officers: { name: "Alex" },
  warning_approvals: [{ approver_id: "current-user", decision: "pending" }],
  ...changes,
});
let tasks: ReturnType<typeof task>[];
let warnings: ReturnType<typeof warning>[];
let urls: URL[];
let queryError: boolean;

// Exercise the real Supabase query builder against synthetic responses. Filter
// before limit, as PostgREST does; warning rows available here represent RLS reads.
const mockFetch = async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  urls.push(url);
  if (queryError)
    return new Response(JSON.stringify({ message: "Query failed" }), {
      status: 500,
    });
  const table = url.pathname.split("/").at(-1);
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
            if (filter.startsWith("in.("))
              return filter.slice(4, -1).split(",").includes(String(value));
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
  vi.mocked(requireCurrentOfficer).mockImplementation(async () => actor);
  vi.mocked(createClient).mockImplementation(async () => client());
});

it("includes assigned incomplete workflows, but excludes complete, open, other-assignee and removed Tasks", async () => {
  tasks = [
    task(1),
    awaiting(2, 8),
    task(3, { task_assignments: completed }),
    task(4, {
      task_assignments: { ...completed, approved_at: "2026-10-04" },
      approval_required: true,
    }),
    task(5, { task_assignments: null }),
    task(6, {
      task_assignments: { ...completed, officer_id: 9, completed_at: null },
    }),
    task(7, { removed_at: "2026-10-03" }),
  ];
  const result = await load();
  expect(result.items.map((item) => [item.key, item.status])).toEqual([
    ["task-1", "Assigned"],
    ["task-2", "Awaiting approval"],
  ]);
  expect(urls.filter((url) => url.pathname.endsWith("tasks"))).toHaveLength(2);
});

it.each([
  ["Officer", "officer", [1], []],
  ["Lead", "officer", [1], [1]],
  ["Lead", "officer", [], []],
  ["President", "officer", [], [1, 2]],
  ["Vice President of Operations", "officer", [], [1, 2]],
  ["Vice President of Academics", "officer", [], [1, 2]],
  ["Officer", "admin", [], [1, 2]],
])(
  "scopes approvals for %s / %s with branches %j",
  async (positionName, applicationRole, branchIds, expected) => {
    actor = { ...actor, positionName, applicationRole, branchIds };
    tasks = [awaiting(1), awaiting(2, 9, 2), awaiting(3, 8)];
    const result = await load();
    expect(result.items.map((item) => item.key)).toEqual([
      "task-3",
      ...expected.map((id) => `task-${id}`),
    ]);
    const approvalUrl = urls.find(
      (url) =>
        url.searchParams.has("task_assignments.officer_id") &&
        url.searchParams.get("task_assignments.officer_id") === "neq.8",
    );
    if (positionName === "Lead" && branchIds.length)
      expect(approvalUrl?.searchParams.get("branch_id")).toBe("in.(1)");
  },
);

it("does not offer approval before completion, without required approval, after approval or to the assignee", async () => {
  actor.applicationRole = "admin";
  tasks = [
    awaiting(1),
    task(2, {
      approval_required: true,
      task_assignments: { ...completed, officer_id: 9, completed_at: null },
    }),
    task(3, { task_assignments: { ...completed, officer_id: 9 } }),
    task(4, {
      approval_required: true,
      task_assignments: {
        ...completed,
        officer_id: 9,
        approved_at: "2026-10-04",
      },
    }),
  ];
  expect((await load()).items.map((item) => item.key)).toEqual(["task-1"]);
  expect(dashboardActionItems(actor, [], [awaiting(5, 8)], []).items).toEqual(
    [],
  );
});

it("includes only current pending snapshotted warning decisions, even for admins", async () => {
  actor.applicationRole = "admin";
  warnings = [
    warning(1),
    warning(2, {
      warning_approvals: [{ approver_id: "other-user", decision: "pending" }],
    }),
    warning(3, {
      warning_approvals: [
        { approver_id: "current-user", decision: "approved" },
      ],
    }),
    warning(4, { status: "rejected" }),
    warning(5, { status: "approved" }),
  ];
  const html = await render();
  expect(html).toContain('href="/officers#warning-1"');
  expect(html).toContain("Warning for Alex");
  for (const id of [2, 3, 4, 5]) expect(html).not.toContain(`warning-${id}`);
  const url = urls.find((url) => url.pathname.endsWith("officer_warnings"))!;
  expect(url.searchParams.get("warning_approvals.approver_id")).toBe(
    "eq.current-user",
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
  expect(html).toContain("You&#x27;re all caught up.");
});

it("orders personal Tasks by date and ID, then approvals, then oldest warning and ID", async () => {
  actor.positionName = "Lead";
  tasks = [
    task(4, { due_date: "2026-10-06" }),
    task(2),
    task(1, { due_date: "2026-10-02" }),
    awaiting(9, 8),
    awaiting(7, 9),
    awaiting(6, 9, 2),
  ];
  warnings = [
    warning(3),
    warning(2),
    warning(1, { created_at: "2026-10-01T00:00:00Z" }),
  ];
  expect((await load()).items.map((item) => item.key)).toEqual([
    "task-1",
    "task-2",
    "task-9",
    "task-4",
    "task-7",
  ]);
  tasks = [awaiting(7, 9, 1)];
  expect((await load()).items.map((item) => item.key)).toEqual([
    "task-7",
    "warning-1",
    "warning-2",
    "warning-3",
  ]);
});

it("caps the summary at five and bounds all source queries, with both destinations available", async () => {
  actor.applicationRole = "admin";
  tasks = Array.from({ length: 20 }, (_, i) => task(i + 1));
  warnings = Array.from({ length: 20 }, (_, i) => warning(i + 1));
  const html = await render();
  const section = html
    .split('aria-label="Your action items"')[1]
    .split("</section>")[0];
  expect(section.match(/<li>/g)).toHaveLength(5);
  expect(section).toContain('href="/tasks/5"');
  expect(section).not.toContain('href="/tasks/6"');
  expect(section).toContain("Showing the first 5 items");
  expect(section).toContain('href="/tasks"');
  expect(section).toContain('href="/officers"');
  expect(
    [...section.matchAll(/href="\/tasks\/(\d+)"/g)].map((match) => match[1]),
  ).toEqual(["1", "2", "3", "4", "5"]);
  for (const url of urls.filter((url) =>
    ["tasks", "officer_warnings"].includes(url.pathname.split("/").at(-1)!),
  )) {
    expect(url.searchParams.get("limit")).toBe("6");
    expect(url.searchParams.get("order")).toMatch(/,id.asc$/);
  }
});

it("renders the current Task and warning statuses with their canonical record links", async () => {
  actor.positionName = "Lead";
  tasks = [
    task(8, {
      title:
        "Review the recurring CIC workshop volunteer schedule and venue checklist",
    }),
    awaiting(9),
  ];
  warnings = [warning(2)];

  const html = await render();
  const section = html
    .split('aria-label="Your action items"')[1]
    .split("</section>")[0];

  expect(section).toContain(
    "Review the recurring CIC workshop volunteer schedule and venue checklist",
  );
  expect(section).toContain('href="/tasks/8"');
  expect(section).toContain("Due Oct 5, 2026");
  expect(section).toContain("Assigned");
  expect(section).toContain('href="/tasks/9"');
  expect(section).toContain("Awaiting approval");
  expect(section).toContain('href="/officers#warning-2"');
  expect(section).toContain("Warning for Alex");
  expect(section).toContain("Needs decision");
  expect(section.indexOf('href="/tasks/8"')).toBeLessThan(
    section.indexOf('href="/tasks/9"'),
  );
  expect(section.indexOf('href="/tasks/9"')).toBeLessThan(
    section.indexOf('href="/officers#warning-2"'),
  );
  expect(section).not.toContain("<form");
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
  expect(html.indexOf('aria-label="Your action items"')).toBeLessThan(
    html.indexOf('aria-label="Upcoming events"'),
  );
});

it("formats date-only deadlines without a timezone shift and links to Task detail", async () => {
  tasks = [task(1, { due_date: "2026-10-05" })];
  const html = await render();
  expect(html).toContain('href="/tasks/1"');
  expect(html).toContain('dateTime="2026-10-05"');
  expect(html).toContain("Due Oct 5, 2026");
  expect(html).toContain("Assigned");
  expect(html).not.toContain("<form");
});

it("reports query failures instead of a misleading caught-up state", async () => {
  queryError = true;
  await expect(load()).rejects.toThrow("Failed to load dashboard action items");
});

it("sorts Task approvals by due date and stable ID before warning decisions", async () => {
  actor.applicationRole = "admin";
  tasks = [
    awaiting(7),
    awaiting(5),
    { ...awaiting(9), due_date: "2026-10-01" },
  ];
  warnings = [warning(3), warning(2)];
  expect((await load()).items.map((item) => item.key)).toEqual([
    "task-9",
    "task-5",
    "task-7",
    "warning-2",
    "warning-3",
  ]);
  expect((await load()).hasMore).toBe(false);
});
