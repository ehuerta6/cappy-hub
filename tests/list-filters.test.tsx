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
  SelfSignupForm: ({ full }: { full: boolean }) => (
    <button>{full ? "Join waitlist" : "Sign up"}</button>
  ),
  SignupForm: () => <button>Remove signup</button>,
  LeaveWaitlistForm: () => <button>Leave waitlist</button>,
}));
vi.mock("@/app/(protected)/tasks/task-action-form", () => ({
  default: () => (
    <form>
      <button className="whitespace-nowrap px-3 py-1.5">Assign to me</button>
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

function taskRowsForQuery(record: Query, source: unknown[]) {
  const selection = String(
    record.calls.find(([method]) => method === "select")?.[1] ?? "",
  );
  const calls = record.calls;
  let result: Record<string, unknown>[] = source.map((row) => ({
    removed_at: null,
    ...(row as Record<string, unknown>),
  }));
  const removedFilter = calls.find(
    ([method, column]) =>
      (method === "is" || method === "not") && column === "removed_at",
  );
  if (removedFilter)
    result = result.filter((task) =>
      removedFilter[0] === "is"
        ? task.removed_at === null
        : task.removed_at !== null,
    );
  for (const [method, column, value] of calls) {
    if (method === "eq" && column === "branch_id")
      result = result.filter((task) => task.branch_id === value);
    if (method === "in" && column === "branch_id")
      result = result.filter((task) =>
        (value as number[]).includes(Number(task.branch_id)),
      );
    if (method === "gte" && column === "due_date")
      result = result.filter((task) => String(task.due_date) >= String(value));
    if (method === "lt" && column === "due_date")
      result = result.filter((task) => String(task.due_date) < String(value));
    if (method === "or" && typeof value === "string") {
      const search = value.match(/\.imatch\."(.*?)"/)?.[1]?.toLowerCase();
      if (search)
        result = result.filter((task) =>
          [task.title, task.description].some((text) =>
            String(text ?? "")
              .toLowerCase()
              .includes(search),
          ),
        );
    }
    if (method === "eq" && column === "assignee_filter.officer_id")
      result = result.filter((task) =>
        (task.task_officer_assignments as { officer_id: number }[]).some(
          (assignment) => assignment.officer_id === value,
        ),
      );
  }
  if (
    calls.some(
      ([method, column, value]) =>
        method === "is" && column === "no_assignments" && value === null,
    )
  )
    result = result.filter(
      (task) => (task.task_officer_assignments as unknown[]).length === 0,
    );
  if (
    selection.includes(
      "incomplete_assignment:task_officer_assignments!inner",
    ) &&
    calls.some(
      ([method, column, value]) =>
        method === "is" &&
        column === "incomplete_assignment.completed_at" &&
        value === null,
    )
  )
    result = result.filter((task) =>
      (task.task_officer_assignments as { completed_at: string | null }[]).some(
        (assignment) => assignment.completed_at === null,
      ),
    );
  if (
    selection.includes("any_assignment:task_officer_assignments!inner(") &&
    calls.some(
      ([method, column, value]) =>
        method === "is" && column === "incomplete_assignment" && value === null,
    ) &&
    calls.some(
      ([method, column, value]) =>
        method === "is" &&
        column === "incomplete_assignment.completed_at" &&
        value === null,
    )
  )
    result = result.filter((task) => {
      const assignments = task.task_officer_assignments as {
        completed_at: string | null;
      }[];
      return (
        assignments.length > 0 &&
        assignments.every((assignment) => assignment.completed_at !== null)
      );
    });
  const orders = calls.filter(([method]) => method === "order");
  for (const [, column, options] of [...orders].reverse()) {
    if (column === "due_date" || column === "id") {
      const ascending = (options as { ascending: boolean }).ascending;
      result.sort((left, right) => {
        const key = column as "id" | "due_date";
        const a = left[key] as number | string;
        const b = right[key] as number | string;
        const comparison =
          typeof a === "number"
            ? a - Number(b)
            : String(a).localeCompare(String(b));
        return ascending ? comparison : -comparison;
      });
    }
  }
  return result;
}

let rows: Record<string, unknown[]>;
let queries: Query[];
let visibleCount: number;
let filteredCount: number;
let admin: boolean;
let lead: boolean;
let actorBranches: number[];
let failingTables: Set<string>;
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
  lead = false;
  actorBranches = [];
  failingTables = new Set();
  vi.mocked(getAuthorizationContext).mockImplementation(
    async () =>
      ({
        ...actor,
        applicationRole: admin ? "admin" : "officer",
        positionCode: lead ? "lead" : "officer",
        branchIds: actorBranches,
      }) as never,
  );
  vi.mocked(createClient).mockResolvedValue({
    rpc: () =>
      Object.assign(Promise.resolve({ data: [], error: null }), {
        in: async () => ({ data: [], error: null }),
      }),
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
        const range = record.calls.find(([method]) => method === "range");
        const taskRows =
          table === "tasks" ? taskRowsForQuery(record, data) : [];
        const countExact = record.calls.some(
          ([method, , opts]) =>
            method === "select" &&
            (opts as { count?: string })?.count === "exact",
        );
        return Promise.resolve({
          data:
            table === "tasks"
              ? range
                ? taskRows.slice(Number(range[1]), Number(range[2]) + 1)
                : taskRows
              : table === "events" && range
                ? data.slice(Number(range[1]), Number(range[2]) + 1)
                : data,
          error: failingTables.has(table) ? { message: "Query failed" } : null,
          count: head
            ? isBaseline || pointsBaseline || tasksBaseline
              ? visibleCount
              : filteredCount
            : table === "tasks" && countExact
              ? taskRows.length
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

it("defaults the Officers directory to active and supports an explicit all view", async () => {
  await render(OfficersPage);
  has(forTable("officers")[0], "eq", "status", "active");

  queries = [];
  const html = await render(OfficersPage, { status: "all" });
  expect(
    forTable("officers")[0].calls.some(
      ([method, column]) => method === "eq" && column === "status",
    ),
  ).toBe(false);
  expect(html).toContain('<option value="all" selected="">All</option>');
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
  expect(html).toContain("Upcoming events");
});

it("omits empty Event and Task groups on bounded pages", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T06:00:00.000Z"));
  try {
    rows.events = [
      {
        id: 7,
        name: "Upcoming workshop",
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
    const eventsHtml = await render(EventsPage);
    expect(eventsHtml).not.toContain("Your events:");
    expect(eventsHtml).not.toContain("No events in this group.");
    expect(eventsHtml).toContain("Other events");
    expect(eventsHtml).toContain("Upcoming workshop");

    queries = [];
    rows.tasks = [
      {
        id: 8,
        title: "Upcoming task",
        description: "Assigned to another Officer",
        task_type: "one_time",
        branch_id: 2,
        due_date: "2099-10-08",
        points: 3,
        branches: { name: "intro" },
        task_officer_assignments: [{ officer_id: 2, completed_at: null }],
      },
    ];
    const tasksHtml = await render(TasksPage);
    expect(tasksHtml).not.toContain('aria-label="Upcoming tasks: Your tasks"');
    expect(tasksHtml).not.toContain("No tasks in this group.");
    expect(tasksHtml).toContain("Other tasks");
    expect(tasksHtml).toContain("Upcoming task");
  } finally {
    vi.useRealTimers();
  }
});

it("keeps Event group labels within one accessible table", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T06:00:00.000Z"));
  try {
    rows.events = [
      {
        id: 11,
        name: "This week event",
        event_date: "2026-10-08",
        status: "scheduled",
        deleted_at: null,
        participation_points_per_hour_at_end: null,
        event_types: { name: "Workshop" },
        event_branches: [],
        event_officers: [{ officer_id: 1 }],
        starts_at: "2026-10-08T23:00:00Z",
        ends_at: "2026-10-09T01:00:00Z",
      },
      {
        id: 12,
        name: "Upcoming event",
        event_date: "2026-10-12",
        status: "scheduled",
        deleted_at: null,
        participation_points_per_hour_at_end: null,
        event_types: { name: "Workshop" },
        event_branches: [],
        event_officers: [],
        starts_at: "2026-10-12T23:00:00Z",
        ends_at: "2026-10-13T01:00:00Z",
      },
    ];

    const html = await render(EventsPage);
    expect(html).toContain(
      'role="region" aria-label="Events results" tabindex="0"',
    );
    expect(html).toContain("This week&#x27;s events · Your events");
    expect(html).toContain("Upcoming events · Other events");
    expect(
      html.match(/role="region" aria-label="[^"]+" tabindex="0"/g),
    ).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
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

it("does not offer Archived Event browsing and keeps forged archive URLs active-only", async () => {
  admin = false;
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
    status: "archived",
    branch: "2",
  });
  has(forTable("events")[0], "is", "deleted_at", null);
  expect(html).not.toContain('value="archived"');
  expect(html).toContain('value="upcoming"');
  expect(html).toContain('value="happening"');
  expect(html).toContain('value="past"');
  expect(html).toContain('value="cancelled"');
  expect(html).toContain("Upcoming events");
  expect(html).toContain("returnTo=%2Fevents%3Fbranch%3D2");
});

it("offers authorized managers Archived Event and Task views", async () => {
  const eventHtml = await render(EventsPage, { status: "archived" });
  const eventQuery = forTable("events")[0];
  has(eventQuery, "not", "deleted_at", "is", null);
  expect(eventHtml).toContain('value="archived"');

  queries = [];
  const taskHtml = await render(TasksPage, { view: "archived" });
  const taskQuery = forTable("tasks").find(({ calls }) =>
    calls.some(([method]) => method === "order"),
  )!;
  has(taskQuery, "not", "removed_at", "is", null);
  expect(taskHtml).toContain('value="archived"');
});

it("scopes Lead Archived Tasks to assigned branches and keeps Admin access global", async () => {
  rows.tasks = [
    {
      id: 2,
      title: "Assigned branch archive",
      description: "Lead branch",
      task_type: "Post",
      due_date: "2099-10-08",
      removed_at: "2099-10-09T00:00:00Z",
      branch_id: 2,
      branches: { name: "intro" },
      task_officer_assignments: [],
    },
    {
      id: 3,
      title: "Other branch archive",
      description: "Outside Lead scope",
      task_type: "Post",
      due_date: "2099-10-08",
      removed_at: "2099-10-09T00:00:00Z",
      branch_id: 3,
      branches: { name: "other" },
      task_officer_assignments: [],
    },
  ];
  admin = false;
  lead = true;
  actorBranches = [2];
  const leadHtml = await render(TasksPage, { view: "archived" });
  for (const query of forTable("tasks")) has(query, "in", "branch_id", [2]);
  expect(leadHtml).toContain("Assigned branch archive");
  expect(leadHtml).not.toContain("Other branch archive");
  expect(leadHtml).toContain("Page 1 of 1 · 1 task");

  admin = true;
  lead = false;
  queries = [];
  const adminHtml = await render(TasksPage, { view: "archived" });
  expect(
    forTable("tasks").some((query) =>
      query.calls.some(
        ([method, column]) => method === "in" && column === "branch_id",
      ),
    ),
  ).toBe(false);
  expect(adminHtml).toContain("Assigned branch archive");
  expect(adminHtml).toContain("Other branch archive");
  expect(adminHtml).toContain("Page 1 of 1 · 2 tasks");
});

it("limits every Events page to eight scheduled rows and keeps page context", async () => {
  visibleCount = 19;
  rows.events = Array.from({ length: 19 }, (_, index) => ({
    id: index + 1,
    name: `Event ${index + 1}`,
    event_date: "2099-10-08",
    starts_at: `2099-10-08T${String(index + 1).padStart(2, "0")}:00:00Z`,
    ends_at: `2099-10-08T${String(index + 2).padStart(2, "0")}:00:00Z`,
    status: "scheduled",
    deleted_at: null,
    max_volunteers: null,
    participation_points_per_hour_at_end: null,
    event_types: { name: "Workshop" },
    event_branches: [],
    event_officers: [],
    event_waitlist: [],
  }));
  const html = await render(EventsPage, { page: "2" });
  const rowQuery = forTable("events").find(({ calls }) =>
    calls.some(([method]) => method === "range"),
  )!;
  has(rowQuery, "range", 8, 15);
  has(rowQuery, "order", "starts_at", { ascending: true });
  has(rowQuery, "order", "id", { ascending: true });
  expect(html).toContain("Page 2 of 3 · 19 events");
  expect(html).toContain("Event 9");
  expect(html).toContain("Event 16");
  expect(html).not.toContain("Event 8</a>");
  expect(html).not.toContain("Event 17</a>");
  expect(html).toContain('href="/events?page=3"');
  expect(html).toContain('href="/events/9?returnTo=%2Fevents%3Fpage%3D2"');
});

it("counts after Event filters and retains them in the pager", async () => {
  visibleCount = 25;
  filteredCount = 9;
  const html = await render(EventsPage, {
    q: "Workshop",
    type: "2",
    branch: "3",
  });
  const countQuery = forTable("events")[0];
  has(countQuery, "eq", "event_type_id", 2);
  has(countQuery, "eq", "filter_branch.branch_id", 3);
  expect(countQuery.calls.some(([method]) => method === "or")).toBe(true);
  expect(html).toContain("Page 1 of 2 · 9 events");
  expect(html).toContain(
    'href="/events?q=Workshop&amp;type=2&amp;branch=3&amp;page=2"',
  );
});

it("scopes the Lead Archived view to assigned branches before paging", async () => {
  admin = false;
  lead = true;
  actorBranches = [2, 3];
  const html = await render(EventsPage, { status: "archived" });
  for (const query of forTable("events")) {
    has(query, "not", "deleted_at", "is", null);
    has(query, "in", "scope_branch.branch_id", [2, 3]);
    has(query, "not", "scope_branch", "is", null);
  }
  expect(html).toContain('value="archived" selected=""');
  expect(html).toContain('href="/events/new"');
});

it("keeps signup, leave, and waitlist actions on eligible Event rows", async () => {
  visibleCount = 3;
  rows.events = [
    { id: 1, name: "Own", event_officers: [{ officer_id: 1 }] },
    { id: 2, name: "Full", event_officers: [{ officer_id: 2 }] },
    {
      id: 3,
      name: "Waiting",
      event_officers: [{ officer_id: 2 }],
      event_waitlist: [{ officer_id: 1 }],
    },
  ].map((row, index) => ({
    event_date: "2099-10-08",
    starts_at: `2099-10-08T${String(index + 10).padStart(2, "0")}:00:00Z`,
    ends_at: `2099-10-08T${String(index + 11).padStart(2, "0")}:00:00Z`,
    status: "scheduled",
    deleted_at: null,
    max_volunteers: 1,
    participation_points_per_hour_at_end: null,
    event_types: { name: "Workshop" },
    event_branches: [],
    event_waitlist: [],
    ...row,
  }));
  const html = await render(EventsPage);
  expect(html.split("Own</a>")[1].split("</tr>")[0]).toContain("Remove signup");
  expect(html.split("Full</a>")[1].split("</tr>")[0]).toContain(
    "Join waitlist",
  );
  expect(html.split("Waiting</a>")[1].split("</tr>")[0]).toContain(
    "Leave waitlist",
  );
  expect(html).toContain("Your events");
  expect(html).toContain("Other events");
});

it.each(["open", "in_progress", "complete"])(
  "filters Tasks using the %s assignment summary",
  async (status) => {
    rows.tasks = [
      {
        id: 8,
        title: "No assignment",
        description: "Slides: Open task",
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
        description: "Slides: Mixed state",
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
        description: "Slides: Complete",
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
      {
        id: 11,
        title: "Mixed assignments task",
        description: "Slides: one complete and one incomplete",
        task_type: "Post",
        branch_id: 3,
        due_date: "2099-10-11",
        points: 4,
        branches: { name: "intro" },
        task_officer_assignments: [
          { officer_id: 2, completed_at: "2099-10-01" },
          { officer_id: 3, completed_at: null },
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
    if (status === "in_progress")
      expect(html).toContain("Mixed assignments task");
    if (status === "complete") {
      expect(html).toContain("Completed team task");
      expect(html).not.toContain("Mixed assignments task");
      expect(query.calls[0][1]).toContain(
        "any_assignment:task_officer_assignments!inner(task_id)",
      );
      expect(query.calls[0][1]).toContain(
        "incomplete_assignment:task_officer_assignments(completed_at)",
      );
      has(query, "is", "incomplete_assignment.completed_at", null);
      has(query, "is", "incomplete_assignment", null);
    }
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
    expect(html).toContain('aria-label="This week&#x27;s tasks: Your tasks"');
    expect(html).toContain('aria-label="This week&#x27;s tasks: Other tasks"');
    expect(html).not.toContain('aria-label="Upcoming tasks: Your tasks"');
    expect(html).toContain('aria-label="Upcoming tasks: Other tasks"');
    expect(html).toContain(
      'role="region" aria-label="Tasks table: This week&#x27;s tasks: Your tasks" tabindex="0"',
    );
    expect(html).toContain(
      'role="region" aria-label="Tasks table: This week&#x27;s tasks: Other tasks" tabindex="0"',
    );
    expect(html).toContain(
      'role="region" aria-label="Tasks table: Upcoming tasks: Other tasks" tabindex="0"',
    );
    expect(
      html.match(/role="region" aria-label="[^"]+" tabindex="0"/g),
    ).toHaveLength(3);
    expect(html.indexOf("Today&#x27;s work")).toBeLessThan(
      html.indexOf("Sunday deadline"),
    );
    expect(html.indexOf("Sunday deadline")).toBeLessThan(
      html.indexOf("Next Monday task"),
    );
    expect(html).not.toContain("Yesterday task");
    expect(html).not.toContain("Removed future task");
    expect(html).not.toContain('aria-label="Past tasks"');
    expect(html).toContain("Assign to me");
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
    expect(query.calls.find(([method]) => method === "or")?.[1]).toContain(
      "description.imatch",
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

it("paginates eight Tasks across groups with due-date and ID tie ordering", async () => {
  rows.tasks = Array.from({ length: 19 }, (_, index) => ({
    id: index + 1,
    title: `Task ${index + 1}`,
    description: "Pagination fixture",
    task_type: "Post",
    due_date: index < 12 ? "2099-10-08" : "2099-10-09",
    points: 3,
    branch_id: 2,
    branches: { name: "intro" },
    task_officer_assignments:
      index % 2 === 0 ? [{ officer_id: 1, completed_at: null }] : [],
  }));

  const first = await render(TasksPage);
  expect(first).toContain("Page 1 of 3 · 19 tasks");
  expect(first).toContain("page=2");
  const firstIds = [...first.matchAll(/href="\/tasks\/(\d+)\?/g)].map((match) =>
    Number(match[1]),
  );
  expect(firstIds).toHaveLength(8);
  expect(new Set(firstIds)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));

  queries = [];
  const second = await render(TasksPage, { page: "2" });
  expect(second).toContain("Page 2 of 3 · 19 tasks");
  expect(second).toContain('href="/tasks">Previous</a>');
  expect(second).toContain("page=3");
  const secondIds = [...second.matchAll(/href="\/tasks\/(\d+)\?/g)].map(
    (match) => Number(match[1]),
  );
  expect(secondIds).toHaveLength(8);
  expect(new Set(secondIds)).toEqual(new Set([9, 10, 11, 12, 13, 14, 15, 16]));
  has(forTable("tasks")[0], "range", 8, 15);

  queries = [];
  const third = await render(TasksPage, { page: "3" });
  expect(third).toContain("Page 3 of 3 · 19 tasks");
  const thirdIds = [...third.matchAll(/href="\/tasks\/(\d+)\?/g)].map((match) =>
    Number(match[1]),
  );
  expect(thirdIds).toHaveLength(3);
  expect(new Set([...firstIds, ...secondIds, ...thirdIds])).toEqual(
    new Set(Array.from({ length: 19 }, (_, index) => index + 1)),
  );
});

it("filters assignee, status, branch, search and view before the eight-row page", async () => {
  rows.tasks = [
    ...Array.from({ length: 9 }, (_, index) => ({
      id: index + 1,
      title: `Design task ${index + 1}`,
      description: "Design work",
      task_type: "Post",
      due_date: "2099-10-08",
      points: 3,
      branch_id: 2,
      branches: { name: "intro" },
      task_officer_assignments: [
        { officer_id: 2, completed_at: null },
        { officer_id: 3, completed_at: "2099-10-01" },
      ],
    })),
    ...Array.from({ length: 9 }, (_, index) => ({
      id: index + 20,
      title: `Decoy task ${index + 1}`,
      description: "Not matching the query",
      task_type: "Post",
      due_date: "2099-10-08",
      points: 3,
      branch_id: 3,
      branches: { name: "other" },
      task_officer_assignments: [{ officer_id: 2, completed_at: "2099-10-01" }],
    })),
  ];
  const html = await render(TasksPage, {
    q: "design",
    view: "current",
    status: "in_progress",
    branch: "2",
    assignee: "2",
  });
  const query = forTable("tasks")[0];
  expect(query.calls[0][1]).toContain(
    "assignee_filter:task_officer_assignments!inner(officer_id)",
  );
  expect(query.calls[0][1]).toContain(
    "incomplete_assignment:task_officer_assignments!inner(task_id,completed_at)",
  );
  has(query, "eq", "assignee_filter.officer_id", 2);
  has(query, "is", "incomplete_assignment.completed_at", null);
  has(query, "eq", "branch_id", 2);
  has(query, "range", 0, 7);
  expect(html).toContain("Page 1 of 2 · 9 tasks");
  expect(html).toContain("Design task 1");
  expect(html).toContain("Design task 8");
  expect(html).not.toContain("Design task 9");
  expect(html).not.toContain("Decoy task");
  expect(html).toContain(
    "returnTo=%2Ftasks%3Fq%3Ddesign%26status%3Din_progress%26branch%3D2%26assignee%3D2",
  );
  expect(html).toContain("page=2");
});

it("combines Open and Assignee filters on the server with no false matches", async () => {
  rows.tasks = [
    {
      id: 1,
      title: "Assigned task",
      description: "Assigned work",
      task_type: "Post",
      due_date: "2099-10-08",
      points: 3,
      branch_id: 2,
      branches: { name: "intro" },
      task_officer_assignments: [{ officer_id: 2, completed_at: null }],
    },
  ];
  const html = await render(TasksPage, { assignee: "2", status: "open" });
  const query = forTable("tasks")[0];
  has(query, "eq", "assignee_filter.officer_id", 2);
  has(query, "is", "no_assignments", null);
  expect(html).toContain("No tasks match these filters.");
  expect(html).toContain("Page 1 of 1 · 0 tasks");
});

it("restores the stable Assignee ID, inactive label, and empty GET value", async () => {
  rows.officers = [
    { id: 2, name: "Inactive officer", status: "inactive" },
    { id: 3, name: "Active officer", status: "active" },
  ];
  const html = await render(TasksPage, { assignee: "2" });
  expect(html).toContain('name="assignee" value="2"');
  expect(html).toContain("Inactive officer (inactive)");
  expect(html).toContain('name="assignee"');
  expect(html).toContain('value=""');
});

it("keeps the filtered Task page in returnTo and resets it on filter submission", async () => {
  rows.tasks = Array.from({ length: 9 }, (_, index) => ({
    id: index + 7,
    title: `Design task ${index + 1}`,
    description: "Design notes",
    task_type: "Post",
    due_date: "2099-10-08",
    points: 3,
    branches: { name: "intro" },
    branch_id: 2,
    task_officer_assignments: [{ officer_id: 9, completed_at: null }],
  }));
  const html = await render(TasksPage, {
    q: "design",
    branch: "2",
    assignee: "9",
    page: "2",
  });
  expect(html).toContain(
    'href="/tasks/15?returnTo=%2Ftasks%3Fq%3Ddesign%26branch%3D2%26assignee%3D9%26page%3D2"',
  );
  expect(html).not.toContain('name="page"');
  expect(html).toContain('href="/tasks">Clear filters</a>');
});

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

it("filters System Log actor, activity, entity and inclusive Denver calendar dates", async () => {
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
  const activityFilter = query.calls
    .filter(([method]) => method === "or")
    .map(([, filter]) => filter)
    .find((filter) => String(filter).includes("action.in."));
  expect(activityFilter).toContain('action.imatch."update"');
  has(query, "eq", "entity_type", "task");
  has(query, "gte", "created_at", "2026-03-08T07:00:00.000Z");
  has(query, "lt", "created_at", "2026-03-09T06:00:00.000Z");
  expect(html).toContain("No System Log entries match these filters.");
  expect(html).toContain("Activity");
  expect(html).toContain('placeholder="e.g. signed up or cancelled event"');
});

it("matches readable System Log activity wording to audit action codes", async () => {
  await render(SystemLogPage, { action: "cancelled event" });
  const query = forTable("audit_logs")[0];
  const activityFilter = query.calls.find(([method]) => method === "or")?.[1];
  expect(activityFilter).toContain("event.cancelled");
  expect(activityFilter).toContain('action.imatch."cancelled event"');
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
    if (Page === EventsPage) expect(empty).toContain("No current events.");
    else if (Page === TasksPage) expect(empty).toContain("No current tasks.");
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
  expect(html).toMatch(/<th[^>]*scope="col"[^>]*>Name<\/th>/);
  for (const heading of [
    "Contact",
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
  expect(html).toContain(">UTEP</span>");
  expect(html).toContain(">Personal</span>");
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
  for (const heading of ["Due", "Type", "Branch", "Officers", "Status"])
    expect(html).toContain(`>${heading}</th>`);
  expect(html).toContain(">Action</th>");
  expect(html).not.toContain("Due: Oct 8, 2099");
  expect(html).not.toContain("Officers: 0 officers");
  expect(html).toContain(">Open</span>");
  expect(html).toContain(">Intro</span>");
  expect(html).not.toContain(">Points</th>");
  expect(html).not.toContain(">3</td>");
  expect(html).not.toContain(
    "Add the schedule, speaker names, and room details.",
  );
  expect(html).not.toContain("Self-assign");
  expect(html).toContain("Assign to me");
  expect(html).toContain("whitespace-nowrap px-3 py-1.5");
  expect(html).toContain("Oct 8, 2099");
  expect(html).not.toContain("2099-10-08");
  expect(html).not.toContain("Select officer");
  expect(html).toContain('aria-label="Upcoming tasks: Other tasks"');
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
      details: {
        before: {
          name: "Synthetic workshop room",
          location: "Old room",
          description: "A long audit value that stays available in full.",
        },
        after: {
          name: "Synthetic workshop room 2",
          location: "New room",
          description: "A long audit value that stays available in full.",
        },
      },
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
  expect(html).toContain("Synthetic workshop room 2");
  expect(html).toContain("2 changes");
  expect(html).toContain("Old room");
  expect(html).toContain("New room");
  expect(html).toContain("A long audit value that stays available in full.");
  expect(html).toMatch(
    /<summary class="min-h-10 cursor-pointer">2 changes<\/summary>/,
  );
  expect(html).toContain(
    '<summary class="min-h-10 cursor-pointer">Technical details</summary>',
  );
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

it("preserves a selected Officer actor filter when Officer names are unavailable", async () => {
  filteredCount = 125;
  rows.audit_logs = [
    {
      id: 23,
      actor_id: null,
      actor_officer_id: actor.id,
      action: "officer.updated",
      entity_type: "officer",
      entity_id: actor.id,
      details: { name: "Alex" },
      created_at: "2026-10-03T12:00:00.000Z",
    },
  ];
  failingTables.add("officers");

  const html = await render(SystemLogPage, {
    actor: String(actor.id),
    q: "updated",
    page: "2",
  });
  const actorFilter = html
    .split('<select name="actor"')[1]
    .split("</select>")[0];

  expect(actorFilter).toContain(
    '<option value="' +
      actor.id +
      '" selected="">Officer #' +
      actor.id +
      " (name unavailable)</option>",
  );
  expect(html).toContain("Officer names are unavailable");
  expect(html).toContain("officer.updated");
  expect(html).toContain("q=updated");
  expect(html).toContain("actor=1");
  expect(html).toContain("q=updated&amp;actor=1&amp;page=3");
  has(forTable("audit_logs")[0], "eq", "actor_officer_id", actor.id);
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
      title: "Workshop Task",
      description: "Workshop description",
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
