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
  default: () => (
    <form>
      <button>Self-assign</button>
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
        const isBaseline =
          (table === "events" &&
            !record.calls.some(
              ([method, column]) =>
                method === "or" ||
                method === "filter" ||
                (method === "eq" &&
                  ["event_type_id", "filter_branch.branch_id"].includes(
                    String(column),
                  )),
            )) ||
          !record.calls.some(([method]) =>
            ["or", "filter", "eq", "gte", "lte", "gt", "lt"].includes(method),
          );
        // Points baseline includes its authorization-sensitive removed predicate.
        const pointsBaseline =
          table === "point_history" && record.calls.length === 2;
        const tasksBaseline = table === "tasks" && head;
        const data = rows[table] ?? [];
        return Promise.resolve({
          data:
            table === "tasks"
              ? data.map((row) => ({
                  removed_at: null,
                  ...(row as Record<string, unknown>),
                }))
              : data,
          error: null,
          count: head
            ? isBaseline || pointsBaseline || tasksBaseline
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
      forTable("events")[1].calls.some(([method]) => method === "order"),
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
  expect(eventsQuery.calls).toContainEqual([
    "gte",
    "event_date",
    expect.any(String),
  ]);
  expect(eventsQuery.calls).toContainEqual([
    "gt",
    "ends_at",
    expect.any(String),
  ]);
  expect(eventsQuery.calls).toContainEqual([
    "order",
    "starts_at",
    { ascending: true },
  ]);
});

it("combines search, type, and Branch filters with current temporal sections", async () => {
  rows.events = [
    {
      id: 7,
      name: "Workshop",
      event_date: "2099-10-08",
      status: "scheduled",
      deleted_at: null,
      participation_points_per_hour_at_end: null,
      event_types: { name: "Workshop" },
      event_branches: [],
      event_officers: [],
      starts_at: "2099-10-08T23:00:00Z",
      ends_at: "2099-10-09T01:00:00Z",
    },
  ];
  const html = await render(EventsPage, {
    q: "workshop",
    type: "2",
    branch: "3",
  });
  const query = forTable("events").find(({ calls }) =>
    calls.some(([method]) => method === "order"),
  )!;
  expect(query.calls.find(([method]) => method === "or")?.[1]).toContain(
    "name.imatch",
  );
  has(query, "eq", "event_type_id", 2);
  has(query, "eq", "filter_branch.branch_id", 3);
  expect(html).toContain("This week&#x27;s events");
  expect(html).toContain("Upcoming events");
});

it("preserves an explicit Past filter in Event return context", async () => {
  rows.events = [
    {
      id: 7,
      name: "Past event",
      event_date: "2020-10-08",
      status: "scheduled",
      deleted_at: null,
      participation_points_per_hour_at_end: 0,
      event_types: { name: "Workshop" },
      event_branches: [],
      event_officers: [],
      starts_at: "2020-10-08T23:00:00Z",
      ends_at: "2020-10-09T01:00:00Z",
    },
  ];
  const html = await render(EventsPage, { status: "past", branch: "2" });
  expect(html).toContain(
    'href="/events/7?returnTo=%2Fevents%3Fstatus%3Dpast%26branch%3D2"',
  );
  expect(html).not.toContain("This week&#x27;s events");
  expect(html).not.toContain("Upcoming events");
});

it("does not offer Removed Event browsing and keeps forged removed URLs active-only", async () => {
  rows.events = [
    {
      id: 7,
      name: "Active event",
      event_date: "2099-10-08",
      status: "scheduled",
      deleted_at: null,
      participation_points_per_hour_at_end: null,
      event_types: { name: "Workshop" },
      event_branches: [],
      event_officers: [],
      starts_at: "2099-10-08T23:00:00Z",
      ends_at: "2099-10-09T01:00:00Z",
    },
  ];
  const html = await render(EventsPage, {
    status: "removed",
    removed: "1",
    branch: "2",
  });
  has(forTable("events")[0], "is", "deleted_at", null);
  expect(html).not.toContain('value="removed"');
  expect(html).toContain("This week&#x27;s events");
  expect(html).toContain("Upcoming events");
  expect(html).toContain("returnTo=%2Fevents%3Fbranch%3D2");
});

it.each(["open", "in_progress", "complete"])(
  "filters Tasks using the %s assignment summary",
  async (status) => {
    rows.tasks = [
      {
        id: 8,
        title: "No assignment",
        description: "Open task",
        task_type: "Flyer",
        branch_id: 3,
        due_date: "2099-10-08",
        points: 3,
        branches: { name: "intro" },
        task_officer_assignments: [],
      },
      {
        id: 9,
        title: "Other Officer's task",
        description: "Mixed state",
        task_type: "Post",
        branch_id: 3,
        due_date: "2099-10-09",
        points: 4,
        branches: { name: "intro" },
        task_officer_assignments: [
          {
            officer_id: 2,
            completed_at: null,
            officers: { id: 2, name: "Other" },
          },
        ],
      },
      {
        id: 10,
        title: "Completed team task",
        description: "Complete",
        task_type: "Airtable",
        branch_id: 3,
        due_date: "2099-10-10",
        points: 5,
        branches: { name: "intro" },
        task_officer_assignments: [
          {
            officer_id: 2,
            completed_at: "2099-10-01",
            officers: { id: 2, name: "Other" },
          },
          {
            officer_id: 3,
            completed_at: "2099-10-02",
            officers: { id: 3, name: "Third" },
          },
        ],
      },
    ];
    const html = await render(TasksPage, {
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
    expect(query.calls).toContainEqual(["gte", "due_date", expect.any(String)]);
    expect(query.calls[0][1]).toContain("task_officer_assignments(");
    expect(html).not.toContain("Awaiting approval");
    expect(html).not.toContain("Mark complete");
    expect(html).not.toContain(">Approve<");
    if (status === "open") expect(html).toContain("No assignment");
    if (status === "in_progress")
      expect(html).toContain("Other Officer&#x27;s task");
    if (status === "complete") expect(html).toContain("Completed team task");
  },
);

it("groups current Tasks by Denver week before splitting multi-Officer assignments", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T06:00:00.000Z"));
  try {
    rows.tasks = [
      {
        id: 1,
        title: "Today's work",
        description: "Assigned to this Officer",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2026-10-05",
        points: 2,
        branches: { name: "intro" },
        task_officer_assignments: [{ officer_id: 1, completed_at: null }],
      },
      {
        id: 2,
        title: "Sunday deadline",
        description: "Assigned to other Officers",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2026-10-11",
        points: 3,
        branches: { name: "intro" },
        task_officer_assignments: [
          { officer_id: 2, completed_at: null },
          { officer_id: 3, completed_at: null },
        ],
      },
      {
        id: 3,
        title: "Next Monday task",
        description: "Upcoming work",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2026-10-12",
        points: 4,
        branches: { name: "intro" },
        task_officer_assignments: [
          { officer_id: 2, completed_at: "2026-10-01T12:00:00Z" },
        ],
      },
      {
        id: 4,
        title: "Yesterday task",
        description: "Past work",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2026-10-04",
        points: 1,
        branches: { name: "intro" },
        task_officer_assignments: [],
      },
      {
        id: 5,
        title: "Removed future task",
        description: "Hidden work",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2026-10-12",
        removed_at: "2026-10-01T00:00:00Z",
        points: 1,
        branches: { name: "intro" },
        task_officer_assignments: [],
      },
    ];

    const html = await render(TasksPage);
    const query = forTable("tasks").find(({ calls }) =>
      calls.some(([method]) => method === "order"),
    )!;
    has(query, "is", "removed_at", null);
    has(query, "gte", "due_date", "2026-10-05");
    has(query, "order", "due_date", { ascending: true });
    has(query, "order", "id", { ascending: true });
    expect(query.calls[0][1]).toContain("task_officer_assignments(");
    expect(html).toContain("This week&#x27;s tasks");
    expect(html).toContain("Upcoming tasks");
    expect(html).toContain('aria-label="Your tasks"');
    expect(html).toContain('aria-label="Other tasks"');
    expect(html.indexOf("Today&#x27;s work")).toBeLessThan(
      html.indexOf("Sunday deadline"),
    );
    expect(html.indexOf("Sunday deadline")).toBeLessThan(
      html.indexOf("Next Monday task"),
    );
    expect(html).not.toContain("Yesterday task");
    expect(html).not.toContain("Removed future task");
    expect(html).not.toContain('aria-label="Past tasks"');
    expect(html).toContain("Self-assign");
  } finally {
    vi.useRealTimers();
  }
});

it("keeps Past separate from workflow status and preserves all assignment rows", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T06:00:00.000Z"));
  try {
    rows.tasks = [
      {
        id: 21,
        title: "Past completed flyer",
        description: "Past complete task",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2026-10-04",
        points: 3,
        branches: { name: "intro" },
        task_officer_assignments: [
          { officer_id: 1, completed_at: "2026-10-03T12:00:00Z" },
          { officer_id: 2, completed_at: "2026-10-03T13:00:00Z" },
        ],
      },
      {
        id: 22,
        title: "Past flyer teammate task",
        description: "Other Officer completed flyer task",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2026-10-03",
        points: 2,
        branches: { name: "intro" },
        task_officer_assignments: [
          { officer_id: 2, completed_at: "2026-10-02T12:00:00Z" },
        ],
      },
      {
        id: 23,
        title: "Due today",
        description: "Current task",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2026-10-05",
        points: 2,
        branches: { name: "intro" },
        task_officer_assignments: [
          { officer_id: 1, completed_at: "2026-10-03T12:00:00Z" },
          { officer_id: 2, completed_at: "2026-10-03T13:00:00Z" },
        ],
      },
    ];

    const html = await render(TasksPage, {
      view: "past",
      status: "complete",
      branch: "2",
      assignee: "2",
      q: "flyer",
    });
    const query = forTable("tasks").find(({ calls }) =>
      calls.some(([method]) => method === "order"),
    )!;
    has(query, "lt", "due_date", "2026-10-05");
    has(query, "eq", "branch_id", 2);
    expect(query.calls.find(([method]) => method === "or")?.[1]).toContain(
      "title.imatch",
    );
    expect(query.calls[0][1]).toContain(
      "task_officer_assignments(officer_id,completed_at",
    );
    expect(html).toContain("Past tasks");
    expect(html).not.toContain("This week&#x27;s tasks");
    expect(html).not.toContain("Upcoming tasks");
    expect(html).toContain("Past completed flyer");
    expect(html).toContain("Past flyer teammate task");
    expect(html).not.toContain("Due today");
    expect(html).toContain("2/2 completed");
    expect(html).not.toContain("Self-assign");
    expect(html).toContain(
      "returnTo=%2Ftasks%3Fq%3Dflyer%26view%3Dpast%26status%3Dcomplete%26branch%3D2%26assignee%3D2",
    );
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  ["open", [], "Past open Task"],
  ["in_progress", [{ officer_id: 2, completed_at: null }], "Past active Task"],
  [
    "complete",
    [{ officer_id: 2, completed_at: "2026-10-03T12:00:00Z" }],
    "Past complete Task",
  ],
] as const)(
  "filters Past Tasks independently by %s workflow status",
  async (status, assignments, title) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T06:00:00.000Z"));
    try {
      rows.tasks = [
        {
          id: 30,
          title,
          description: title,
          task_type: "one_time",
          branch_id: 2,
          due_date: "2026-10-04",
          points: 2,
          branches: { name: "intro" },
          task_officer_assignments: assignments,
        },
        {
          id: 31,
          title: "Current decoy",
          description: "Must stay outside Past",
          task_type: "one_time",
          branch_id: 2,
          due_date: "2026-10-05",
          points: 2,
          branches: { name: "intro" },
          task_officer_assignments: assignments,
        },
      ];

      const html = await render(TasksPage, { view: "past", status });
      expect(html).toContain(title);
      expect(html).not.toContain("Current decoy");
      expect(html).not.toContain("Awaiting approval");
    } finally {
      vi.useRealTimers();
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
    if (Page === EventsPage)
      expect(empty).toMatch(/No events this week|No upcoming events/);
    else if (Page === TasksPage)
      expect(empty).toMatch(/No tasks due this week|No upcoming tasks/);
    else expect(empty).toMatch(/No .*yet/);
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

it("shows Task-specific details and self-assignment only in Other tasks", async () => {
  rows.tasks = [
    {
      id: 7,
      title: "Prepare the workshop slides",
      description: "Add the schedule, speaker names, and room details.",
      task_type: "one_time",
      branches: { name: "intro" },
      branch_id: 2,
      points: 3,
      due_date: "2099-10-08",
      task_officer_assignments: [],
    },
  ];
  const html = await render(TasksPage);
  expect(html).toContain("<table");
  expect(html).toContain('<th scope="col">Task</th>');
  expect(html).toContain("Due: 2099-10-08");
  expect(html).toContain("Officers: 0 officers");
  expect(html).toContain("Status: Open");
  expect(html).toContain(">Intro</span>");
  expect(html).toContain("Points: 3");
  expect(html).toContain("Description</summary>");
  expect(html).toContain("Self-assign");
  expect(html).not.toContain("Select officer");
  expect(html).toContain('aria-label="Your tasks"');
  expect(html).toContain('aria-label="Other tasks"');
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

it("keeps removed Task titles in System Log without linking removed Task rows", async () => {
  rows.audit_logs = [
    {
      id: 22,
      actor_id: null,
      actor_officer_id: null,
      action: "task.removed",
      entity_type: "task",
      entity_id: 19,
      details: { title: "Removed recurring task" },
      created_at: "2026-10-03T12:00:00.000Z",
    },
  ];

  const html = await render(SystemLogPage);

  expect(html).toContain("Removed recurring task");
  expect(html).not.toContain('href="/tasks/19"');
  has(forTable("tasks")[0], "is", "removed_at", null);
});

it.each([PointsPage, SystemLogPage])(
  "clamps out-of-range pagination while preserving URL filters",
  async (Page) => {
    await expect(render(Page, { q: "search", page: "999" })).rejects.toThrow(
      /redirect:.*q=search/,
    );
  },
);

it("keeps removed Event records out of legacy removed URLs", async () => {
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
      event_date: "2099-10-08",
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
      description: "Description",
      task_type: "Post",
      due_date: "2099-10-08",
      points: 3,
      branches: { name: "Intro" },
      branch_id: 2,
      task_officer_assignments: [],
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
