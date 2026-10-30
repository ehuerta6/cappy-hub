import { beforeEach, expect, it, vi } from "vitest";
import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useActionState: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({
  getAuthorizationContext: vi.fn(),
  canManageOfficers: () => true,
  isAdmin: () => true,
  canManageEvent: vi.fn(() => true),
  canSeeAllBranches: () => true,
  isLead: () => false,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("Not found");
  },
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { canManageEvent, getAuthorizationContext } from "@/lib/authorization";
import TaskEdit from "@/app/(protected)/tasks/[id]/edit/page";
import HistoryTable from "@/app/(protected)/points/history-table";
import type { Tables } from "@/lib/database.types";
import { withReturnTo } from "@/lib/return-context";
import OfficerDetail from "@/app/(protected)/officers/[id]/page";
import OfficerEdit from "@/app/(protected)/officers/[id]/edit/page";
import EventDetail from "@/app/(protected)/events/[id]/page";
import EventEdit from "@/app/(protected)/events/[id]/edit/page";
import OfficersPage from "@/app/(protected)/officers/page";
import TasksPage from "@/app/(protected)/tasks/page";
import TaskDetail from "@/app/(protected)/tasks/[id]/page";
import TaskActionForm from "@/app/(protected)/tasks/task-action-form";
import { formatEventSchedule } from "@/lib/presentation";
import { TASK_TYPES } from "@/lib/task-types";
import { redirect } from "next/navigation";

const officer = {
  id: 7,
  name: "Synthetic Officer",
  positions: { name: "Officer" },
  officer_branches: [],
  application_role: "officer",
  status: "active",
};
const event = {
  id: 7,
  name: "Synthetic Event",
  location: "Synthetic Room",
  slides_url: "https://example.com/slides",
  meeting_notes_url: "https://example.com/notes",
  event_types: { name: "Meeting" },
  event_branches: [],
  event_officers: [],
  max_volunteers: null,
  task_events: [],
  event_date: "2099-10-08",
  starts_at: "2099-10-08T23:00:00Z",
  ends_at: "2099-10-09T01:00:00Z",
  participation_points_per_hour_at_end: null,
};
const task = {
  id: 7,
  title: "Synthetic Task",
  task_type: "one_time",
  branches: { name: "Intro" },
  branch_id: 1,
  points: 2,
  approval_required: true,
  task_officer_assignments: [
    {
      officer_id: 2,
      assigned_at: "2026-10-02T12:00:00Z",
      completed_at: "2026-10-03T12:00:00Z",
      officers: { id: 2, name: "Other Officer" },
    },
    {
      officer_id: 1,
      assigned_at: "2026-10-01T12:00:00Z",
      completed_at: null,
      officers: { id: 1, name: "Synthetic Officer" },
    },
  ],
  task_events: [],
  recurrence_series_id: 3,
  due_date: "2099-10-08",
};
let officersForList: Record<string, unknown>[];
let eventRosterRows: Record<string, unknown>[];
let eventRosterCount = 0;
let personalRosterCount = 0;
let eventTaskRows: Record<string, unknown>[];
let eventTaskCount = 0;
let eventPointCount = 0;
let eventPointRanges: [number, number][];
let eventRelatedRanges: [string, number, number][];
let eventRosterOrderCalls: string[];
let eventRelatedOrderCalls: [string, string][];
const queryLog: { table: string; method: string; args: unknown[] }[] = [];
beforeEach(() => {
  officersForList = [];
  eventRosterRows = [];
  eventRosterCount = 0;
  personalRosterCount = 0;
  eventTaskRows = [];
  eventTaskCount = 0;
  eventPointCount = 0;
  eventPointRanges = [];
  eventRelatedRanges = [];
  eventRosterOrderCalls = [];
  eventRelatedOrderCalls = [];
  queryLog.length = 0;
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    false,
  ] as never);
  vi.mocked(getAuthorizationContext).mockResolvedValue({ id: 1 } as never);
  vi.mocked(canManageEvent).mockReturnValue(true);
  vi.mocked(createClient).mockResolvedValue({
    rpc: () => {
      const query = {
        eventId: 0,
        eq: (_column: string, value: number) => {
          query.eventId = value;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: [
              {
                event_id: query.eventId,
                confirmed_count: eventRosterCount,
              },
            ],
            error: null,
          }).then(resolve),
      };
      return query;
    },
    from: (table: string) => {
      const filters = new Map<string, unknown>();
      const query = {
        rangeStart: 0,
        rangeEnd: Number.POSITIVE_INFINITY,
        select: (selection: string, options?: Record<string, unknown>) => {
          queryLog.push({
            table,
            method: "select",
            args: [selection, options],
          });
          return query;
        },
        eq: (column: string, value: unknown) => {
          queryLog.push({ table, method: "eq", args: [column, value] });
          filters.set(column, value);
          return query;
        },
        gt: () => query,
        gte: () => query,
        in: () => query,
        is: () => query,
        neq: () => query,
        not: () => query,
        lt: () => query,
        lte: () => query,
        order: (column: string, options?: { referencedTable?: string }) => {
          queryLog.push({ table, method: "order", args: [column, options] });
          eventRelatedOrderCalls.push([
            table,
            options?.referencedTable
              ? `${column}:${options.referencedTable}`
              : column,
          ]);
          if (table === "event_officers") {
            eventRosterOrderCalls.push(
              options?.referencedTable
                ? `${column}:${options.referencedTable}`
                : column,
            );
          }
          return query;
        },
        range: (from: number, to: number) => {
          queryLog.push({ table, method: "range", args: [from, to] });
          query.rangeStart = from;
          query.rangeEnd = to;
          eventRelatedRanges.push([table, from, to]);
          if (table === "point_transactions") eventPointRanges.push([from, to]);
          return query;
        },
        limit: () => query,
        or: () => query,
        single: async () => ({
          data:
            table === "tasks"
              ? task
              : table.endsWith("_series")
                ? {
                    id: 3,
                    revision: 1,
                    recurrence_rule: "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3",
                    starts_on: "2099-10-08",
                  }
                : { total_points: 12 },
          error: null,
        }),
        maybeSingle: async () => ({
          data:
            table === "officers"
              ? officer
              : table === "events"
                ? event
                : table === "task_officer_assignments"
                  ? (task.task_officer_assignments.find(
                      ({ officer_id }) =>
                        officer_id === filters.get("officer_id"),
                    ) ?? null)
                  : task,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === "officers"
                ? officersForList
                : table === "task_officer_assignments"
                  ? task.task_officer_assignments.slice(
                      query.rangeStart,
                      query.rangeEnd + 1,
                    )
                  : table === "event_officers"
                    ? eventRosterRows.slice(
                        query.rangeStart,
                        query.rangeEnd + 1,
                      )
                    : table === "task_events" && filters.has("task_id")
                      ? task.task_events.slice(
                          query.rangeStart,
                          query.rangeEnd + 1,
                        )
                      : table === "task_events"
                        ? eventTaskRows.slice(
                            query.rangeStart,
                            query.rangeEnd + 1,
                          )
                        : [],
            count:
              table === "officers"
                ? officersForList.length
                : table === "task_officer_assignments"
                  ? task.task_officer_assignments.length
                  : table === "event_officers"
                    ? filters.has("officer_id")
                      ? personalRosterCount
                      : eventRosterCount
                    : table === "task_events" && filters.has("task_id")
                      ? task.task_events.length
                      : table === "task_events"
                        ? eventTaskCount
                        : table === "point_transactions"
                          ? eventPointCount
                          : 0,
            error: null,
          }).then(resolve),
      };
      return query;
    },
  } as never);
});

it.each([
  ["Officer detail", OfficerDetail, "/officers", "Back to officers"],
  ["Officer edit", OfficerEdit, "/officers/7", "Back to officer"],
  ["Event detail", EventDetail, "/events", "Back to events"],
  ["Event edit", EventEdit, "/events/7", "Back to event"],
  ["Task detail", TaskDetail, "/tasks", "Back to tasks"],
] as const)(
  "%s links to its deterministic parent",
  async (_name, Page, href, label) => {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "7" }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toMatch(new RegExp(`href="${href}"[^>]*>.*?${label}</a>`));
    expect(html).toContain('aria-hidden="true"');
  },
);

it.each([
  [OfficerDetail, "officer-saved", "Officer saved", "/officers"],
  [EventDetail, "event-saved", "Event saved", "/events"],
  [TaskDetail, "task-updated", "Task updated", "/tasks"],
] as const)(
  "shows an allowlisted post-save notice on %s detail",
  async (Page, feedback, message, route) => {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "7" }),
        searchParams: Promise.resolve({
          returnTo: `${route}?q=workshop&branch=2`,
          feedback,
        }),
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain(message);
    expect(html).toContain(`href="${route}?q=workshop&amp;branch=2"`);
  },
);

it("shows a controlled Task created notice on the filtered Task list", async () => {
  const html = renderToStaticMarkup(
    await TasksPage({
      searchParams: Promise.resolve({
        q: "workshop",
        branch: "2",
        feedback: "task-created",
      }),
    }),
  );
  expect(html).toContain('role="status"');
  expect(html).toContain("Task created");
  expect(html).toContain('name="q" value="workshop"');
});

it("disables self-assignment while its action is running", () => {
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    true,
  ] as never);
  const html = renderToStaticMarkup(
    createElement(TaskActionForm, {
      taskId: 7,
    }),
  );
  expect(html).toContain("disabled");
  expect(html).toContain("Assigning…");
});

it("formats compact schedules in El Paso time including the correct local date", () => {
  expect(
    formatEventSchedule("2026-10-08T23:00:00Z", "2026-10-09T01:00:00Z"),
  ).toBe("Oct 8 · 5:00–7:00 PM");
  expect(
    formatEventSchedule("2026-10-08T16:00:00Z", "2026-10-08T19:00:00Z"),
  ).toBe("Oct 8 · 10:00 AM–1:00 PM");
  expect(
    formatEventSchedule("2026-12-09T01:00:00Z", "2026-12-09T02:00:00Z"),
  ).toBe("Dec 8 · 6:00–7:00 PM");
  expect(
    formatEventSchedule("2026-10-08T12:00:00Z", "2026-10-08T14:00:00Z"),
  ).toBe("Oct 8 · 6:00–8:00 AM");
  expect(
    formatEventSchedule("2026-10-09T05:00:00Z", "2026-10-09T13:00:00Z"),
  ).toBe("Oct 8 · 11:00 PM–Oct 9 · 7:00 AM");
});

it("allows an authorized manager to edit a standalone Task", async () => {
  Object.assign(task, { recurrence_series_id: null });
  const html = renderToStaticMarkup(
    await TaskEdit({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ returnTo: "/tasks?status=open" }),
    }),
  );
  expect(html).toContain("Edit task");
  expect(html).toContain('name="title"');
  for (const taskType of TASK_TYPES) {
    expect(html).toContain(`<option>${taskType}</option>`);
  }
  expect(html).not.toContain("This occurrence");
  expect(html).toContain('name="returnTo" value="/tasks?status=open"');
  Object.assign(task, { recurrence_series_id: 3 });
});

it("shows per-Officer completion controls to managers and read-only state to Officers", async () => {
  const props = {
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve({ section: "assignments" }),
  };
  const managerHtml = renderToStaticMarkup(await TaskDetail(props));
  expect(managerHtml).toContain('aria-label="Officers"');
  expect(managerHtml).toContain("Synthetic Officer");
  expect(managerHtml).toContain("Other Officer");
  expect(managerHtml).toContain('aria-label="Completed for Synthetic Officer"');
  expect(managerHtml).toContain('aria-label="Completed for Other Officer"');
  expect(managerHtml).not.toContain("Mark complete");
  expect(managerHtml).not.toContain("Awaiting approval");
  expect(managerHtml).not.toContain(">Approve<");
  const assignmentRows = managerHtml
    .split("<table>")[1]
    .split("</table>")[0]
    .match(/<tr>[\s\S]*?<\/tr>/g);
  expect(assignmentRows).toHaveLength(3);
  expect(assignmentRows?.[1]).toContain("Other Officer");
  expect(assignmentRows?.[1]).toContain(
    'aria-label="Completed for Other Officer"',
  );
  expect(assignmentRows?.[1]).toContain('name="officer_id" value="2"');
  expect(assignmentRows?.[1]).toContain("Remove assignment");
  expect(assignmentRows?.[2]).toContain("Synthetic Officer");
  expect(assignmentRows?.[2]).toContain(
    'aria-label="Completed for Synthetic Officer"',
  );
  expect(assignmentRows?.[2]).toContain('name="officer_id" value="1"');
  expect(assignmentRows?.[2]).toContain(
    'aria-label="Remove Synthetic Officer from task"',
  );
  expect(assignmentRows?.[2]).toContain("Remove assignment");

  vi.mocked(canManageEvent).mockReturnValue(false);
  const officerHtml = renderToStaticMarkup(await TaskDetail(props));
  expect(officerHtml).toContain("Not completed");
  expect(officerHtml).toContain("Completed");
  expect(officerHtml).not.toContain(
    'aria-label="Completed for Synthetic Officer"',
  );
  expect(officerHtml).not.toContain('aria-label="Completed for Other Officer"');
  expect(officerHtml).not.toContain("Remove assignment");
});

it("lets an unassigned Officer self-assign without exposing completion controls", async () => {
  const previousAssignments = task.task_officer_assignments;
  Object.assign(task, {
    task_officer_assignments: [previousAssignments[0]],
  });
  vi.mocked(canManageEvent).mockReturnValue(false);
  const html = renderToStaticMarkup(
    await TaskDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ section: "assignments" }),
    }),
  );
  expect(html).toContain('aria-label="Assign this task to me"');
  expect(html).not.toContain('aria-label="Completed for Other Officer"');
  expect(html).not.toContain("Remove assignment");
  Object.assign(task, { task_officer_assignments: previousAssignments });
});

it("keeps Task detail previews to four and pages full related sections by six", async () => {
  const assignments = Array.from({ length: 8 }, (_, index) => ({
    officer_id: 8 - index,
    assigned_at: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    completed_at: null,
    officers: { id: 8 - index, name: `Officer ${index + 1}` },
  }));
  const events = Array.from({ length: 7 }, (_, index) => ({
    event_id: 7 - index,
    events: {
      id: 8 - index,
      name: `Event ${index + 1}`,
      event_date: `2026-11-${String(index + 1).padStart(2, "0")}`,
      status: "upcoming",
      deleted_at: null,
    },
  }));
  Object.assign(task, {
    task_officer_assignments: assignments,
    task_events: events,
  });
  const returnTo = "/tasks?status=open&page=2";
  queryLog.length = 0;
  const overview = renderToStaticMarkup(
    await TaskDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ returnTo }),
    }),
  );
  expect(overview).toContain("Officer 4");
  expect(overview).not.toContain("Officer 5");
  expect(overview).toContain("Event 4");
  expect(overview).not.toContain("Event 5");
  expect(overview).toContain("Assignments (8)");
  expect(overview).toContain("Linked Events (7)");
  expect(overview).toContain("returnTo=%2Ftasks%3Fstatus%3Dopen%26page%3D2");
  expect(queryLog).toContainEqual({
    table: "task_officer_assignments",
    method: "range",
    args: [0, 3],
  });
  expect(queryLog).toContainEqual({
    table: "task_events",
    method: "range",
    args: [0, 3],
  });

  queryLog.length = 0;
  const assignmentPage = renderToStaticMarkup(
    await TaskDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({
        section: "assignments",
        assignmentPage: "2",
        returnTo,
      }),
    }),
  );
  const assignmentPageQuery = queryLog.find(
    (call) =>
      call.table === "task_officer_assignments" &&
      call.method === "range" &&
      call.args[0] === 6,
  );
  expect(assignmentPageQuery?.args).toEqual([6, 11]);
  expect(queryLog).toContainEqual({
    table: "task_officer_assignments",
    method: "select",
    args: [
      "officer_id,assigned_at,completed_at,officers!task_officer_assignments_officer_id_fkey(id,name)",
      { count: "exact" },
    ],
  });
  expect(queryLog).toContainEqual({
    table: "task_officer_assignments",
    method: "eq",
    args: ["officer_id", 1],
  });
  expect(queryLog).toContainEqual({
    table: "task_officer_assignments",
    method: "order",
    args: ["officers(name)", { ascending: true }],
  });
  expect(queryLog).toContainEqual({
    table: "task_officer_assignments",
    method: "order",
    args: ["officer_id", { ascending: true }],
  });
  expect(assignmentPage).toContain("Officer 7");
  expect(assignmentPage).toContain("Officer 8");
  expect(assignmentPage).toContain('aria-label="Completed for Officer 7"');
  expect(assignmentPage).toContain("Add officers");
  expect(assignmentPage).toContain("Remove assignment");
  expect(assignmentPage).not.toContain("Officer 6</a>");
  expect(assignmentPage).toContain('aria-label="Select assignment list page"');
  expect(assignmentPage).toContain("of 2");
  expect(assignmentPage).toContain(
    "returnTo=%2Ftasks%3Fstatus%3Dopen%26page%3D2",
  );

  queryLog.length = 0;
  const eventPage = renderToStaticMarkup(
    await TaskDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({
        section: "events",
        eventPage: "2",
        returnTo,
      }),
    }),
  );
  const eventPageQuery = queryLog.find(
    (call) =>
      call.table === "task_events" &&
      call.method === "range" &&
      call.args[0] === 6,
  );
  expect(eventPageQuery?.args).toEqual([6, 11]);
  expect(queryLog).toContainEqual({
    table: "task_events",
    method: "select",
    args: [
      "event_id,events!inner(id,name,event_date,status,deleted_at)",
      { count: "exact" },
    ],
  });
  expect(queryLog).toContainEqual({
    table: "task_events",
    method: "order",
    args: ["events(event_date)", { ascending: true }],
  });
  expect(queryLog).toContainEqual({
    table: "task_events",
    method: "order",
    args: ["events(name)", { ascending: true }],
  });
  expect(queryLog).toContainEqual({
    table: "task_events",
    method: "order",
    args: ["event_id", { ascending: true }],
  });
  const assignmentOrderIndex = queryLog.findIndex(
    (call) =>
      call.table === "task_officer_assignments" && call.method === "order",
  );
  const assignmentRangeIndex = queryLog.findIndex(
    (call) =>
      call.table === "task_officer_assignments" && call.method === "range",
  );
  expect(assignmentOrderIndex).toBeLessThan(assignmentRangeIndex);
  const eventOrderIndex = queryLog.findIndex(
    (call) => call.table === "task_events" && call.method === "order",
  );
  const eventRangeIndex = queryLog.findIndex(
    (call) => call.table === "task_events" && call.method === "range",
  );
  expect(eventOrderIndex).toBeLessThan(eventRangeIndex);
  expect(eventPage).toContain("Event 7");
  expect(eventPage).not.toContain("Event 6</a>");
  expect(eventPage).toContain('aria-label="Select linked event list page"');
  expect(eventPage).toContain("of 2");
  Object.assign(task, {
    task_officer_assignments: [
      {
        officer_id: 1,
        assigned_at: "2026-10-01T12:00:00Z",
        completed_at: null,
        officers: { id: 1, name: "Synthetic Officer" },
      },
      {
        officer_id: 2,
        assigned_at: "2026-10-02T12:00:00Z",
        completed_at: "2026-10-03T12:00:00Z",
        officers: { id: 2, name: "Other Officer" },
      },
    ],
    task_events: [],
  });
});

it("does not add contextual Back links to Officer or Task main pages", async () => {
  expect(
    renderToStaticMarkup(
      await OfficersPage({ searchParams: Promise.resolve({}) }),
    ),
  ).not.toContain("Back to");
  expect(
    renderToStaticMarkup(
      await TasksPage({ searchParams: Promise.resolve({}) }),
    ),
  ).not.toContain("Back to");
});

it("groups both Officer contacts in the wide directory table", async () => {
  officersForList = [
    {
      id: 7,
      name: "Synthetic Officer",
      utep_email: "synthetic@utep.edu",
      personal_email: "officer@example.com",
      classification: "senior",
      positions: { name: "President" },
      officer_branches: [{ branches: { name: "Intro" } }],
      status: "active",
    },
  ];

  const html = renderToStaticMarkup(
    await OfficersPage({ searchParams: Promise.resolve({}) }),
  );

  expect(html).toContain('data-page-width="wide"');
  for (const heading of [
    "Name",
    "Contact",
    "Position",
    "Classification",
    "Branches",
    "Status",
  ])
    expect(html).toContain(`>${heading}</th>`);
  expect(html).toContain("synthetic@utep.edu");
  expect(html).toContain("officer@example.com");
  expect(html).toContain(">UTEP</span>");
  expect(html).toContain(">Personal</span>");
});

it("groups Event details, files and participation while retaining management controls and history", async () => {
  const html = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  const details = html
    .split('aria-label="Event details"')[1]
    .split('aria-label="Participation"')[0];
  for (const text of [
    "Synthetic Room",
    "Meeting",
    "Links and files",
    "Open slides",
    "Open notes",
    "Cancel event",
    "Archive Event",
  ])
    expect(details).toContain(text);
  expect(details).toContain('rel="noopener noreferrer"');
  const participation = html.split('aria-label="Participation"')[1];
  expect(participation).toContain("Your participation:");
  expect(participation).toContain("Participation");
  expect(participation).toContain("No officers signed up.");
  expect(participation).not.toContain("<table");
  expect(participation).toContain("No active officers are available to add.");
  expect(participation).not.toContain("Add officer");
  expect(html).toContain("Event point history");
});

it("keeps manager bulk signup available when eligible Officers exist", async () => {
  officersForList = [{ id: 4, name: "Available Officer", status: "active" }];

  const html = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );

  expect(html).toContain("Add officers (1 available)");
  expect(html).toContain("Select officers to add");
  expect(html).toContain('name="officer_ids" value="4"');
});

it("shows presenter slots only on Session Events", async () => {
  const meetingHtml = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  expect(meetingHtml).not.toContain('aria-label="Presenters"');
  expect(queryLog.some(({ table }) => table === "presentation_slots")).toBe(
    false,
  );

  const originalType = event.event_types;
  event.event_types = { name: "Session" };
  try {
    officersForList = [{ id: 4, name: "Available Officer", status: "active" }];
    const sessionHtml = renderToStaticMarkup(
      await EventDetail({ params: Promise.resolve({ id: "7" }) }),
    );
    expect(sessionHtml).toContain('aria-label="Presenters"');
    expect(sessionHtml).toContain("No presenter slots yet.");
    expect(sessionHtml).toContain("Add presenter slot");
    expect(queryLog).toContainEqual({
      table: "presentation_slots",
      method: "order",
      args: ["position", undefined],
    });
  } finally {
    event.event_types = originalType;
  }
});

it("renders a bounded populated Event roster preview with a full-roster link", async () => {
  eventRosterCount = 7;
  eventRosterRows = ["Alpha Officer", "Bravo Officer", "Charlie Officer"].map(
    (name, index) => ({
      officer_id: index + 1,
      officers: { id: index + 1, name },
    }),
  );

  const html = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  const participation = html.split('aria-label="Participation"')[1];

  expect(participation).toContain("Alpha Officer");
  expect(participation).toContain("Bravo Officer");
  expect(participation).toContain("Charlie Officer");
  expect(participation).not.toContain("Delta Officer");
  expect(participation).toContain("View full roster");
  expect(participation).not.toContain("Remove signup");
  expect(participation).not.toContain("No officers signed up.");
  expect(eventRelatedRanges).toContainEqual(["event_officers", 0, 2]);
});

it("paginates the complete roster in database name order with signup removal available", async () => {
  const names = [
    "Alpha",
    "Alpha",
    "Bravo",
    "Charlie",
    "Delta",
    "Echo",
    "Foxtrot",
    "Hotel",
  ];
  eventRosterCount = names.length;
  const officerIds = [7, 8, 6, 5, 4, 3, 2, 1];
  eventRosterRows = names.map((name, index) => ({
    officer_id: officerIds[index],
    officers: { id: officerIds[index], name },
  }));

  const pageOne = await EventDetail({
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve({
      section: "roster",
      returnTo: "/events?status=past",
    }),
  });
  const htmlOne = renderToStaticMarkup(pageOne);
  const rosterOne = htmlOne.split('aria-label="Confirmed roster"')[1];
  expect(rosterOne).toContain('aria-label="Select roster list page"');
  expect(rosterOne).toContain("of 2");
  expect(rosterOne).toContain(
    'href="/events/7?section=roster&amp;page=2&amp;returnTo=%2Fevents%3Fstatus%3Dpast"',
  );
  expect(rosterOne.indexOf("Alpha")).toBeLessThan(rosterOne.indexOf("Echo"));
  expect(rosterOne).toContain("Remove signup");
  expect(rosterOne).not.toContain("Hotel");

  const pageTwo = await EventDetail({
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve({ section: "roster", page: "2" }),
  });
  const htmlTwo = renderToStaticMarkup(pageTwo);
  const rosterTwo = htmlTwo.split('aria-label="Confirmed roster"')[1];
  expect(rosterTwo).toContain("Hotel");
  expect(rosterTwo).not.toContain("Alpha</a>");
  expect(rosterTwo.match(/<tr>/g)).toHaveLength(3);
  expect(eventRelatedRanges).toContainEqual(["event_officers", 0, 5]);
  expect(eventRelatedRanges).toContainEqual(["event_officers", 6, 11]);
  expect(eventRosterOrderCalls).toEqual([
    "officers(name)",
    "officer_id",
    "officers(name)",
    "officer_id",
  ]);
});

it("shows the current Officer's signup removal in Overview outside the roster preview", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({ id: 99 } as never);
  eventRosterCount = 8;
  personalRosterCount = 1;
  eventRosterRows = Array.from({ length: 3 }, (_, index) => ({
    officer_id: index + 1,
    officers: { id: index + 1, name: `Officer ${index + 1}` },
  }));

  const html = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  const participation = html.split('aria-label="Participation"')[1];
  expect(participation).toContain("Remove signup");
  expect(participation).toContain('name="officer_id" value="99"');
  expect(participation).not.toContain("Officer 99");
});

it("does not render the retired waitlist section or query its former table", async () => {
  const html = renderToStaticMarkup(
    await EventDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ section: "waitlist", page: "2" }),
    }),
  );

  expect(html).toContain('aria-label="Participation"');
  expect(html).not.toContain("Waitlist");
  expect(queryLog.some(({ table }) => table === "event_waitlist")).toBe(false);
});

it("paginates linked Tasks with a bounded database query", async () => {
  eventTaskCount = 7;
  eventTaskRows = Array.from({ length: 7 }, (_, index) => ({
    task_id: 17 - index,
    tasks: {
      id: 17 - index,
      title: `Task ${index + 1}`,
      removed_at: null,
    },
  }));

  const html = renderToStaticMarkup(
    await EventDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ section: "tasks", page: "2" }),
    }),
  );

  expect(html).toContain('aria-label="Select tasks list page"');
  expect(html).toContain("of 2");
  expect(html).toContain("Task 7");
  expect(eventRelatedRanges).toContainEqual(["task_events", 6, 11]);
  expect(
    eventRelatedOrderCalls.filter(([table]) => table === "task_events"),
  ).toEqual([
    ["task_events", "tasks(title)"],
    ["task_events", "task_id"],
  ]);
});

it("keeps deleted linked Tasks visible without linking viewers to inaccessible detail", async () => {
  eventTaskCount = 1;
  eventTaskRows = [
    {
      task_id: 19,
      tasks: {
        id: 19,
        title: "Deleted linked Task",
        removed_at: "2026-10-20T12:00:00Z",
      },
    },
  ];

  const html = renderToStaticMarkup(
    await EventDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ section: "tasks" }),
    }),
  );

  expect(html).toContain("Deleted linked Task");
  expect(html).toContain("Deleted</span>");
  expect(html).not.toContain('href="/tasks/19"');
});

it("loads Event point history by URL page beyond the previous 100-row preview", async () => {
  eventPointCount = 125;
  const html = renderToStaticMarkup(
    await EventDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ section: "points", page: "21" }),
    }),
  );

  expect(html).toContain('aria-label="Select points list page"');
  expect(html).toContain("of 21");
  expect(eventPointRanges).toEqual([[120, 125]]);
  expect(
    eventRelatedOrderCalls.filter(([table]) => table === "point_transactions"),
  ).toEqual([
    ["point_transactions", "created_at"],
    ["point_transactions", "id"],
  ]);
});

it.each(["0", "invalid", "99"])(
  "redirects noncanonical Event page %s to the effective URL",
  async (page) => {
    vi.mocked(redirect).mockClear();
    eventRosterCount = 8;

    await EventDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({
        section: "roster",
        page,
        returnTo: "/events?status=past",
      }),
    });

    expect(redirect).toHaveBeenCalledWith(
      page === "99"
        ? "/events/7?section=roster&page=2&returnTo=%2Fevents%3Fstatus%3Dpast"
        : "/events/7?section=roster&returnTo=%2Fevents%3Fstatus%3Dpast",
    );
  },
);

it("keeps a valid Event page URL canonical", async () => {
  vi.mocked(redirect).mockClear();
  eventRosterCount = 8;

  await EventDetail({
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve({ section: "roster", page: "2" }),
  });

  expect(redirect).not.toHaveBeenCalled();
});

it("retains Officer operational sections and full point history", async () => {
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );
  for (const text of [
    "UTEP email",
    "Application access",
    "Total points:",
    "Approved warnings:",
    "Point history",
  ])
    expect(html).toContain(text);
  expect(html).toContain('aria-label="Warnings"');
  expect(html).toContain("Create warning");
  expect(html).toContain('aria-labelledby="create-warning-title"');
  expect(html).toContain("This warning takes effect immediately");
  expect(html).toContain('aria-label="Associated events"');
  expect(html).toContain('href="/points?officer=7"');
});

it.each([
  [OfficerDetail, OfficerEdit, "/officers", "Back to officers"],
  [EventDetail, EventEdit, "/events", "Back to events"],
  [TaskDetail, TaskEdit, "/tasks", "Back to tasks"],
] as const)(
  "keeps %s list context through detail and edit, including the submitted form",
  async (Detail, Edit, route, label) => {
    const returnTo = `${route}?q=workshop&branch=2&status=active`;
    const props = {
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ returnTo }),
    };
    const detail = renderToStaticMarkup(await Detail(props));
    expect(detail).toContain(`href="${returnTo.replaceAll("&", "&amp;")}"`);
    expect(detail).toContain(label);
    const editHref = withReturnTo(`${route}/7/edit`, returnTo);
    expect(detail).toContain(`href="${editHref}"`);
    const edit = renderToStaticMarkup(await Edit(props));
    expect(edit).toContain(`href="${withReturnTo(`${route}/7`, returnTo)}"`);
    expect(edit).toContain(
      `name="returnTo" value="${returnTo.replaceAll("&", "&amp;")}"`,
    );
  },
);

it.each([OfficerDetail, EventDetail, TaskDetail])(
  "returns to the exact Point History page from linked detail",
  async (Page) => {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "7" }),
        searchParams: Promise.resolve({
          returnTo: "/points?q=workshop&type=task&page=3",
        }),
      }),
    );
    expect(html).toContain(
      'href="/points?q=workshop&amp;type=task&amp;page=3"',
    );
    expect(html).toContain("Back to points</a>");
  },
);

it.each([OfficerEdit, EventEdit, TaskEdit])(
  "drops untrusted return context from edit links and forms",
  async (Page) => {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "7" }),
        searchParams: Promise.resolve({ returnTo: "//evil.example" }),
      }),
    );
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain('name="returnTo"');
  },
);

it("retains list context while changing the Officer warning filter", async () => {
  const html = renderToStaticMarkup(
    await OfficerDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({
        returnTo: "/officers?q=synthetic",
        warningStatus: "pending",
      }),
    }),
  );
  expect(html).toContain(
    'href="/officers/7?warningStatus=approved&amp;returnTo=%2Fofficers%3Fq%3Dsynthetic"',
  );
});

it("Point History record links carry the same filtered page into Officers, Events and Tasks", () => {
  const returnTo = "/points?q=workshop&type=task&page=3";
  const transactions = [
    {
      id: 1,
      officer_id: 7,
      officer_name: "Officer",
      event_id: 8,
      event_name: "Event",
      award_type: "participation",
    },
    { id: 2, task_id: 9, task_title: "Task", award_type: "task" },
  ] as unknown as Tables<"point_history">[];
  const html = renderToStaticMarkup(
    <HistoryTable
      transactions={transactions}
      isAdmin={false}
      emptyMessage="Empty"
      returnTo={returnTo}
    />,
  );
  for (const record of ["/officers/7", "/events/8", "/tasks/9"] as const)
    expect(html).toContain(`href="${withReturnTo(record, returnTo)}"`);
});

it("keeps Point History values, source and admin context in table columns", () => {
  const transactions = [
    {
      id: 33,
      officer_id: 7,
      officer_name: "Emi Huerta",
      event_id: 8,
      event_name: "Workshop",
      task_id: null,
      task_title: null,
      reason: "Workshop correction",
      points: -2.5,
      award_type: "correction",
      activity_date: "2026-10-02",
      created_at: "2026-10-03T12:00:00.000Z",
      created_by: "admin-user",
      created_by_name: "Club Administrator",
      removed_at: null,
      removed_by: null,
      removed_by_name: null,
    },
  ] as unknown as Tables<"point_history">[];
  const html = renderToStaticMarkup(
    <HistoryTable
      transactions={transactions}
      isAdmin={true}
      emptyMessage="Empty"
    />,
  );

  expect(html).toContain("<table");
  for (const heading of [
    "Officer",
    "Event / task",
    "Reason",
    "Points",
    "Type",
    "Activity date",
    "Actor / status",
    "Action",
  ])
    expect(html).toContain(heading);
  for (const value of [
    "Emi Huerta",
    "Workshop",
    "Workshop correction",
    "-2.5",
    "Correction",
    "Oct 2, 2026",
    "Club Administrator",
    "Edit",
    "Remove",
  ])
    expect(html).toContain(value);
});

it("labels mechanically suspended participation as awaiting Event reconciliation", () => {
  const html = renderToStaticMarkup(
    <HistoryTable
      transactions={
        [
          {
            id: 34,
            officer_id: 7,
            officer_name: "Emi Huerta",
            event_id: 8,
            event_name: "Corrected Event",
            task_id: null,
            task_title: null,
            reason: "Event participation",
            points: 2,
            award_type: "participation",
            activity_date: "2026-10-02",
            created_at: "2026-10-03T12:00:00.000Z",
            created_by: null,
            created_by_name: null,
            removed_at: "2026-10-03T12:00:00.000Z",
            removed_by: null,
            removed_by_name: null,
            participation_schedule_suspended: true,
            premature_confirmation_available: false,
          },
        ] as unknown as Tables<"point_history">[]
      }
      isAdmin={true}
      emptyMessage="Empty"
    />,
  );

  expect(html).toContain("Suspended");
  expect(html).toContain(
    "Temporarily excluded from totals; eligible credit is reconciled after the corrected Event ends.",
  );
  expect(html).not.toContain("Removed by Unlinked account");
});
