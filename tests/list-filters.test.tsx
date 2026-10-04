import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/authorization", async (original) => ({
  ...(await original<typeof import("@/lib/authorization")>()),
  getAuthorizationContext: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/app/(protected)/points/transaction-form", () => ({
  default: () => null,
}));
vi.mock("@/app/(protected)/points/rate-form", () => ({ default: () => null }));
vi.mock("@/app/(protected)/points/history-table", () => ({
  default: ({
    emptyMessage,
    returnTo,
  }: {
    emptyMessage: string;
    returnTo?: string;
  }) => <p data-return-to={returnTo}>{emptyMessage}</p>,
}));
vi.mock("@/app/(protected)/events/event-controls", () => ({
  SelfSignupForm: () => null,
}));
vi.mock("@/app/(protected)/tasks/task-action-form", () => ({
  default: ({ label }: { label: string }) => (
    <form>
      <button>{label}</button>
    </form>
  ),
}));
vi.mock("@/app/(protected)/officers/warning-forms", () => ({
  WarningDecisionForm: () => null,
}));
import { getAuthorizationContext } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import OfficersPage from "@/app/(protected)/officers/page";
import EventsPage from "@/app/(protected)/events/page";
import TasksPage from "@/app/(protected)/tasks/page";
import PointsPage from "@/app/(protected)/points/page";
import SystemLogPage from "@/app/(protected)/system-log/page";

type Call = [string, ...unknown[]];
type Query = { table: string; calls: Call[] };
let rows: Record<string, unknown[]>;
let queries: Query[];
let visibleCount: number;
let filteredCount: number;
let admin: boolean;
let completeIds: boolean;
const actor = {
  id: 1,
  authUserId: "00000000-0000-0000-0000-000000000001",
  applicationRole: "admin",
  positionName: "Officer",
  branchIds: [],
};
beforeEach(() => {
  rows = {};
  queries = [];
  visibleCount = 4;
  filteredCount = 0;
  admin = true;
  completeIds = false;
  vi.mocked(getAuthorizationContext).mockImplementation(
    async () =>
      ({ ...actor, applicationRole: admin ? "admin" : "officer" }) as never,
  );
  vi.mocked(createClient).mockResolvedValue({
    from: (table: string) => {
      const record: Query = { table, calls: [] };
      queries.push(record);
      const query: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "neq",
        "is",
        "not",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "or",
        "filter",
        "order",
        "range",
        "limit",
      ])
        query[method] = (...args: unknown[]) => {
          record.calls.push([method, ...args]);
          return query;
        };
      query.single = async () => ({
        data: { participation_points_per_hour: 1 },
        error: null,
      });
      query.then = (resolve: (value: unknown) => unknown) => {
        const head = record.calls.some(
          ([method, , opts]) =>
            method === "select" && (opts as { head?: boolean })?.head,
        );
        const isBaseline = !record.calls.some(([method]) =>
          ["or", "filter", "eq", "gte", "lte", "gt", "lt"].includes(method),
        );
        // Points baseline includes its authorization-sensitive removed predicate.
        const pointsBaseline =
          table === "point_history" && record.calls.length === 2;
        return Promise.resolve({
          data:
            completeIds &&
            table === "tasks" &&
            String(record.calls[0][1]).startsWith("id,task_assignments!inner")
              ? [
                  {
                    id: record.calls.some(
                      ([method, column, value]) =>
                        method === "eq" &&
                        column === "approval_required" &&
                        value === true,
                    )
                      ? 12
                      : 11,
                  },
                ]
              : (rows[table] ?? []),
          error: null,
          count: head
            ? isBaseline || pointsBaseline
              ? visibleCount
              : filteredCount
            : undefined,
        }).then(resolve);
      };
      return query;
    },
  } as never);
});
const render = async (
  Page: typeof OfficersPage,
  params: Record<string, string> = {},
) =>
  renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
const forTable = (table: string) =>
  queries.filter((query) => query.table === table);
const has = (query: Query, method: string, ...args: unknown[]) =>
  expect(query.calls).toContainEqual([method, ...args]);

it("filters officer identity and memberships on the server without narrowing displayed branch badges", async () => {
  const html = await render(OfficersPage, {
    q: "email",
    status: "inactive",
    position: "2",
    branch: "3",
  });
  const query = forTable("officers")[0];
  expect(query.calls[0][1]).toContain("filter_branch:officer_branches(");
  expect(query.calls.find(([method]) => method === "or")?.[1]).toContain(
    "personal_email.imatch",
  );
  has(query, "eq", "status", "inactive");
  has(query, "eq", "position_id", 2);
  has(query, "eq", "filter_branch.branch_id", 3);
  expect(html).toContain("No officers match these filters.");
});

it.each(["upcoming", "happening", "past", "cancelled"])(
  "uses domain Event status %s and excludes removed rows",
  async (status) => {
    await render(EventsPage, { status, q: "workshop", type: "2", branch: "3" });
    const query = forTable("events")[0];
    has(query, "is", "deleted_at", null);
    has(query, "eq", "event_type_id", 2);
    has(query, "eq", "filter_branch.branch_id", 3);
    if (status === "cancelled") has(query, "eq", "status", "cancelled");
    else {
      has(query, "neq", "status", "cancelled");
      expect(
        query.calls.some(
          ([method]) => method === (status === "upcoming" ? "gt" : "lte"),
        ),
      ).toBe(true);
    }
    expect(
      forTable("events")[1].calls.some(
        ([method]) => method === "neq" || method === "lte",
      ),
    ).toBe(false);
  },
);

it("keeps cancelled Events out of the default browsing groups", async () => {
  await render(EventsPage);
  const eventsQuery = forTable("events").find(({ calls }) =>
    calls.some(([method]) => method === "order"),
  )!;
  has(eventsQuery, "is", "deleted_at", null);
  has(eventsQuery, "neq", "status", "cancelled");
});

it("limits removed Event history to admins even for forged URLs", async () => {
  let html = await render(EventsPage, { status: "removed" });
  has(forTable("events")[0], "not", "deleted_at", "is", null);
  expect(html).toContain('value="removed"');
  queries = [];
  admin = false;
  html = await render(EventsPage, { status: "removed" });
  for (const query of forTable("events")) has(query, "is", "deleted_at", null);
  expect(html).not.toContain('value="removed"');
});

it.each(["open", "assigned", "awaiting", "complete"])(
  "filters Tasks using the existing %s workflow",
  async (status) => {
    await render(TasksPage, {
      status,
      q: "slides",
      branch: "3",
      ...(status === "open" ? {} : { assignee: "2" }),
    });
    const query = forTable("tasks").find(({ calls }) =>
      calls.some(([method]) => method === "order"),
    )!;
    has(query, "is", "removed_at", null);
    has(query, "eq", "branch_id", 3);
    if (status !== "open") has(query, "eq", "task_assignments.officer_id", 2);
    if (status === "open") has(query, "is", "task_assignments", null);
    if (status === "assigned")
      has(query, "is", "task_assignments.completed_at", null);
    if (status === "awaiting") {
      has(query, "eq", "approval_required", true);
      has(query, "not", "task_assignments.completed_at", "is", null);
      has(query, "is", "task_assignments.approved_at", null);
    }
    if (status === "complete") {
      has(forTable("tasks")[0], "eq", "approval_required", false);
      has(forTable("tasks")[1], "eq", "approval_required", true);
      has(query, "eq", "id", 0);
    }
  },
);

it("keeps all Points capabilities with one GET form and preserves pagination filters", async () => {
  filteredCount = 60;
  const params = {
    q: "Avery",
    type: "manual",
    officer: "-1013",
    event: "-2001",
    status: "removed",
    from: "2026-09-01",
    to: "2026-10-01",
    page: "2",
  };
  const html = await render(PointsPage, params);
  const history = forTable("point_history")[0];
  has(history, "eq", "award_type", "manual");
  has(history, "eq", "officer_id", -1013);
  has(history, "eq", "event_id", -2001);
  has(history, "gte", "activity_date", params.from);
  has(history, "lte", "activity_date", params.to);
  has(history, "not", "removed_at", "is", null);
  expect(html).toContain('method="get"');
  expect(html).not.toContain('name="page"');
  expect(html).toContain(
    'data-return-to="/points?q=Avery&amp;type=manual&amp;officer=-1013&amp;event=-2001&amp;status=removed&amp;from=2026-09-01&amp;to=2026-10-01&amp;page=2"',
  );
  expect(html).toContain("page=3");
  expect(html).toContain("officer=-1013");
  expect(html).toContain("status=removed");
});

it("forces active Points for non-admins with forged removed/all status", async () => {
  admin = false;
  const html = await render(PointsPage, { status: "all", q: "Avery" });
  for (const query of forTable("point_history"))
    has(query, "is", "removed_at", null);
  expect(html).not.toContain('name="status"');
});

it("filters System Log actor, action, entity and inclusive Denver calendar dates", async () => {
  const html = await render(SystemLogPage, {
    q: "task",
    actor: "system",
    action: "update",
    entity: "task",
    from: "2026-03-08",
    to: "2026-03-08",
  });
  const query = forTable("audit_logs")[0];
  has(query, "is", "actor_id", null);
  has(query, "filter", "action", "imatch", "update");
  has(query, "eq", "entity_type", "task");
  has(query, "gte", "created_at", "2026-03-08T07:00:00.000Z");
  has(query, "lt", "created_at", "2026-03-09T06:00:00.000Z");
  expect(html).toContain("No System Log entries match these filters.");
});

it("rejects System Log before querying for non-admins", async () => {
  admin = false;
  await expect(
    render(SystemLogPage, { actor: actor.authUserId }),
  ).rejects.toThrow("redirect:/access-denied");
  expect(queries).toHaveLength(0);
});

it.each([PointsPage, SystemLogPage])(
  "reports reversed dates and omits date predicates",
  async (Page) => {
    const html = await render(Page, { from: "2026-10-03", to: "2026-10-01" });
    expect(html).toMatch(/after|before/);
    for (const query of queries)
      expect(
        query.calls.some(([method]) => ["gte", "lte", "lt"].includes(method)),
      ).toBe(false);
  },
);

it.each([OfficersPage, EventsPage, TasksPage, PointsPage, SystemLogPage])(
  "distinguishes empty datasets and filtered misses with URL-backed forms",
  async (Page) => {
    const matching = await render(Page, { q: "missing" });
    expect(matching).toMatch(/match these filters/);
    expect(matching).toContain("Clear filters");
    expect(matching).toContain('method="get"');
    expect(matching).not.toContain('name="page"');
    queries = [];
    visibleCount = 0;
    const empty = await render(Page);
    expect(empty).toMatch(/No .*yet/);
    expect(empty).not.toContain("Clear filters");
  },
);

it.each([
  [OfficersPage, "Officer filters"],
  [EventsPage, "Event filters"],
  [TasksPage, "Task filters"],
  [PointsPage, "Point history filters"],
  [SystemLogPage, "System Log filters"],
] as const)(
  "keeps %s filters grouped for narrow layouts",
  async (Page, label) => {
    const html = await render(Page, { q: "filter" });
    const form = html.split(`aria-label="${label}"`)[1].split("</form>")[0];
    expect(form).toContain('method="get"');
    expect(form).toContain("Apply filters");
    expect(form).toContain("Clear filters");
    expect(form).toContain("flex-wrap");
    expect(form).toContain("min-h-11");
    if (Page === PointsPage || Page === SystemLogPage)
      expect(form).toContain('type="date"');
  },
);

it("keeps officer identity, status and contact information in a semantic table", async () => {
  rows.officers = [
    {
      id: 7,
      name: "Emi Huerta",
      utep_email: "emi@miners.utep.edu",
      personal_email: "emi@example.test",
      positions: { name: "Technical Officer" },
      classification: "intro",
      officer_branches: [{ branches: { name: "intro" } }],
      status: "active",
    },
  ];
  const html = await render(OfficersPage);
  expect(html).toContain("<table");
  expect(html).toContain('<th scope="col">Name</th>');
  for (const heading of [
    "UTEP email",
    "Personal email",
    "Position",
    "Classification",
    "Branches",
    "Status",
  ])
    expect(html).toContain(`>${heading}</th>`);
  expect(html).toContain("Emi Huerta");
  expect(html).toContain("Technical Officer");
  expect(html).toContain("Intro");
  expect(html).toContain("Active");
  expect(html).toContain("Contact details");
  expect(html).toContain('href="mailto:emi@miners.utep.edu"');
  expect(html).toContain('href="mailto:emi@example.test"');
});

it("keeps task schedule, ownership and workflow actions together in the list row", async () => {
  rows.tasks = [
    {
      id: 7,
      title: "Prepare the workshop slides",
      description: "Add the schedule, speaker names, and room details.",
      task_type: "one_time",
      branches: { name: "intro" },
      branch_id: 2,
      points: 3,
      approval_required: true,
      due_date: "2099-10-08",
      task_assignments: null,
    },
  ];
  const html = await render(TasksPage);
  expect(html).toContain("<table");
  expect(html).toContain('<th scope="col">Task</th>');
  expect(html).toContain("Due: 2099-10-08");
  expect(html).toContain("Assignee: Unassigned");
  expect(html).toContain("Status: Open");
  expect(html).toContain("Branch: intro");
  expect(html).toContain("Points: 3");
  expect(html).toContain("Description</summary>");
  expect(html).toContain("Self-assign");
  expect(html).toContain("Assign");
});

it("preserves the full System Log row and provides a keyboard-scroll region", async () => {
  rows.audit_logs = [
    {
      id: 21,
      actor_id: null,
      actor_officer_id: null,
      action: "event.updated",
      entity_type: "event",
      entity_id: 8,
      details: { name: "Synthetic workshop room" },
      created_at: "2026-10-03T12:00:00.000Z",
    },
  ];
  const html = await render(SystemLogPage);
  expect(html).toContain('role="region"');
  expect(html).toContain('aria-label="System Log entries"');
  expect(html).toContain('tabindex="0"');
  expect(html).toContain("<table");
  for (const heading of ["Time", "Actor", "Activity", "Record", "Details"])
    expect(html).toContain(`<th scope="col">${heading}</th>`);
  expect(html).toContain("System");
  expect(html).toContain("Synthetic workshop room");
  expect(html).toContain("Technical details");
  expect(html).toContain('type="date"');
});

it.each([PointsPage, SystemLogPage])(
  "clamps out-of-range pagination while preserving URL filters",
  async (Page) => {
    await expect(render(Page, { q: "search", page: "999" })).rejects.toThrow(
      /redirect:.*q=search/,
    );
  },
);

it("combines both valid completion paths before filtering Tasks", async () => {
  completeIds = true;
  await render(TasksPage, { status: "complete" });
  const query = forTable("tasks").find(({ calls }) =>
    calls.some(([method]) => method === "order"),
  )!;
  has(query, "in", "id", [11, 12]);
});

it("keeps legacy removed Event URLs admin-only", async () => {
  await render(EventsPage, { removed: "1" });
  has(forTable("events")[0], "not", "deleted_at", "is", null);
  queries = [];
  admin = false;
  await render(EventsPage, { removed: "1" });
  for (const query of forTable("events")) has(query, "is", "deleted_at", null);
});

it("filters a specific System Log actor without losing other URL filters", async () => {
  filteredCount = 125;
  const html = await render(SystemLogPage, {
    actor: String(actor.id),
    entity: "officer",
    q: "change",
    page: "2",
  });
  has(forTable("audit_logs")[0], "eq", "actor_officer_id", actor.id);
  expect(html).toContain("actor=" + actor.id);
  expect(html).toContain("entity=officer");
  expect(html).toContain("q=change");
  expect(html).toContain("page=3");
});

it.each([
  [
    OfficersPage,
    "officers",
    {
      id: 7,
      name: "Officer",
      positions: { name: "Officer" },
      officer_branches: [],
      status: "active",
    },
  ],
  [
    EventsPage,
    "events",
    {
      id: 7,
      name: "Event",
      event_types: { name: "Workshop" },
      event_branches: [],
      event_officers: [],
      starts_at: "2099-10-08T23:00:00Z",
      ends_at: "2099-10-09T01:00:00Z",
    },
  ],
  [
    TasksPage,
    "tasks",
    {
      id: 7,
      title: "Task",
      branches: { name: "Intro" },
      branch_id: 2,
      task_assignments: null,
    },
  ],
] as const)(
  "carries URL list filters into %s record links",
  async (Page, route, row) => {
    rows[route] = [row];
    const html = await render(Page, { q: "workshop", branch: "2" });
    expect(html).toContain(
      `href="/${route}/7?returnTo=%2F${route}%3Fq%3Dworkshop%26branch%3D2"`,
    );
  },
);
