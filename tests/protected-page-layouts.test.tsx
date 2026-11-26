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
  canEditEvent: vi.fn(() => true),
  canManageEvent: vi.fn(() => true),
  canManageTask: vi.fn(() => true),
  canChangeOtherTaskCompletion: vi.fn(() => false),
  canSeeAllBranches: () => true,
  isAdmin: vi.fn(() => true),
  isLead: vi.fn(() => false),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/academic-periods", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/academic-periods")>()),
  getAcademicPeriodData: async () => ({
    periods: [],
    currentDate: "2026-11-01",
    currentPeriodId: null,
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("Not found");
  },
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import {
  canChangeOtherTaskCompletion,
  canManageEvent,
  canManageTask,
  getAuthorizationContext,
  isAdmin,
  isLead,
} from "@/lib/authorization";
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
  participation_points_per_hour_at_end: null as number | null,
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
  no_longer_needed_at: null as string | null,
};
let officersForList: Record<string, unknown>[];
let eventRosterRows: Record<string, unknown>[];
let historicalPresentationRows: Record<string, unknown>[];
let eventRosterCount = 0;
let personalRosterCount = 0;
let eventTaskRows: Record<string, unknown>[];
let resourceLinkRows: Record<string, unknown>[];
let eventRosterOrderCalls: string[];
let eventRelatedOrderCalls: [string, string][];
const queryLog: { table: string; method: string; args: unknown[] }[] = [];

beforeEach(() => {
  task.due_date = "2099-10-08";
  task.no_longer_needed_at = null;
  task.task_officer_assignments = [
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
  ];
  task.task_events = [];
  event.starts_at = "2099-10-08T23:00:00Z";
  event.ends_at = "2099-10-09T01:00:00Z";
  event.participation_points_per_hour_at_end = null;
  officersForList = [];
  eventRosterRows = [];
  historicalPresentationRows = [];
  eventRosterCount = 0;
  personalRosterCount = 0;
  eventTaskRows = [];
  resourceLinkRows = [
    {
      id: 1,
      event_id: 7,
      task_id: null,
      kind: "slides",
      label: "Slides",
      url: "https://example.com/slides",
      legacy_key: "slides",
      sort_order: 1,
    },
    {
      id: 2,
      event_id: 7,
      task_id: null,
      kind: "meeting_notes",
      label: "Meeting notes",
      url: "https://example.com/notes",
      legacy_key: "meeting_notes",
      sort_order: 2,
    },
  ];
  eventRosterOrderCalls = [];
  eventRelatedOrderCalls = [];
  queryLog.length = 0;
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    false,
  ] as never);
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 1,
    branchIds: [],
  } as never);
  vi.mocked(canManageEvent).mockReturnValue(true);
  vi.mocked(canManageTask).mockReturnValue(true);
  vi.mocked(canChangeOtherTaskCompletion).mockReturnValue(false);
  vi.mocked(isAdmin).mockReturnValue(true);
  vi.mocked(isLead).mockReturnValue(false);
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
        filter: () => query,
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
                  ? task.task_officer_assignments
                  : table === "presentation_slots"
                    ? historicalPresentationRows
                    : table === "event_officers"
                      ? eventRosterRows
                      : table === "task_events" && filters.has("task_id")
                        ? task.task_events
                        : table === "task_events"
                          ? eventTaskRows
                          : table === "resource_links"
                            ? resourceLinkRows.filter(
                                (row) =>
                                  (filters.has("event_id") &&
                                    row.event_id === filters.get("event_id")) ||
                                  (filters.has("task_id") &&
                                    row.task_id === filters.get("task_id")),
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
                        ? eventTaskRows.length
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
  expect(html).toContain("one_time (Deleted)");
  expect(html).not.toContain("This occurrence");
  expect(html).toContain('name="returnTo" value="/tasks?status=open"');
  Object.assign(task, { recurrence_series_id: 3 });
});

it("shows the manager's two-state completion control on flattened Task detail while keeping personal completion separate", async () => {
  const props = {
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve({}),
  };
  vi.mocked(canChangeOtherTaskCompletion).mockImplementation(
    (authorization, officerId) => authorization.id !== officerId,
  );
  const managerHtml = renderToStaticMarkup(await TaskDetail(props));
  expect(managerHtml).toContain("Synthetic Officer");
  expect(managerHtml).toContain("Other Officer");
  expect(managerHtml).not.toContain(
    'aria-label="Completed for Synthetic Officer"',
  );
  expect(managerHtml).toContain('aria-label="Completion for Other Officer"');
  expect(managerHtml).toContain('aria-label="Remove Other Officer from task"');

  vi.mocked(canManageTask).mockReturnValue(false);
  vi.mocked(canChangeOtherTaskCompletion).mockReturnValue(false);
  const officerHtml = renderToStaticMarkup(await TaskDetail(props));
  expect(officerHtml).toContain("Mark complete");
  expect(officerHtml).not.toContain(
    'aria-label="Completed for Synthetic Officer"',
  );
  expect(officerHtml).not.toContain(
    'aria-label="Remove Other Officer from task"',
  );
});

it("shows the closed outcome to Officers and lets Leads restore it across Branches", async () => {
  Object.assign(task, { due_date: "2000-01-01", no_longer_needed_at: null });
  vi.mocked(canManageTask).mockReturnValue(false);
  vi.mocked(isAdmin).mockReturnValue(false);
  vi.mocked(isLead).mockReturnValue(true);

  const props = {
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve({}),
  };
  const overdueLeadHtml = renderToStaticMarkup(await TaskDetail(props));
  expect(overdueLeadHtml).toContain("Mark no longer needed");

  Object.assign(task, { due_date: "2099-10-08" });
  const futureLeadHtml = renderToStaticMarkup(await TaskDetail(props));
  expect(futureLeadHtml).not.toContain("Mark no longer needed");

  Object.assign(task, { due_date: "2000-01-01" });
  Object.assign(task, { no_longer_needed_at: "2026-10-10T12:00:00Z" });
  const closedLeadHtml = renderToStaticMarkup(await TaskDetail(props));
  expect(closedLeadHtml).toContain("No Longer Needed");
  expect(closedLeadHtml).toContain("In Progress");
  expect(closedLeadHtml).toContain("Restore to Needed");

  vi.mocked(isLead).mockReturnValue(false);
  const closedOfficerHtml = renderToStaticMarkup(await TaskDetail(props));
  expect(closedOfficerHtml).toContain("No Longer Needed");
  expect(closedOfficerHtml).not.toContain("Restore to Needed");
  expect(closedOfficerHtml).not.toContain("Mark no longer needed");
});

it("lets an unassigned Officer self-assign without exposing completion controls", async () => {
  const previousAssignments = task.task_officer_assignments;
  Object.assign(task, {
    task_officer_assignments: [previousAssignments[0]],
  });
  vi.mocked(canManageTask).mockReturnValue(false);
  const html = renderToStaticMarkup(
    await TaskDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(html).toContain('aria-label="Assign this task to me"');
  expect(html).not.toContain('aria-label="Completed for Other Officer"');
  expect(html).not.toContain("Remove assignment");
  Object.assign(task, { task_officer_assignments: previousAssignments });
});

it("shows the two-state manager control for pending completion reports on flattened Task detail", async () => {
  vi.mocked(canChangeOtherTaskCompletion).mockReturnValue(true);
  const assignment = task.task_officer_assignments[0];
  Object.assign(assignment, { completion_approval_pending: true });
  const html = renderToStaticMarkup(
    await TaskDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(html).toContain('aria-label="Completion for Other Officer"');
  expect(html).toContain('name="completed" value="false"');
  expect(html).toContain('name="completed" value="true"');
  Object.assign(assignment, { completion_approval_pending: false });
});

it("renders all assignments and linked events directly on flattened Task detail", async () => {
  officersForList = [{ id: 3, name: "Available Officer" }];
  task.task_officer_assignments = Array.from({ length: 8 }, (_, index) => ({
    officer_id: 8 - index,
    assigned_at: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z`,
    completed_at: null,
    officers: { id: 8 - index, name: `Officer ${index + 1}` },
  }));
  task.task_events = Array.from({ length: 5 }, (_, index) => ({
    event_id: 7 - index,
    events: {
      id: 8 - index,
      name: `Event ${index + 1}`,
      event_date: `2026-11-${String(index + 1).padStart(2, "0")}`,
      status: "upcoming",
      deleted_at: null,
    },
  })) as never;

  const html = renderToStaticMarkup(
    await TaskDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(html).toContain("Assignments (8)");
  expect(html).toContain("Officer 1");
  expect(html).toContain("Officer 8");
  expect(html).toContain("Event 1");
  expect(html).toContain("Event 5");
  expect(html).not.toContain('aria-label="Task detail sections"');
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

it("renders Officer contacts, position, classification, branches, and status in the cards directory", async () => {
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
  expect(html).toContain("Synthetic Officer");
  expect(html).toContain("President");
  expect(html).toContain("Senior");
  expect(html).toContain("Intro");
  expect(html).toContain("Active");
  expect(html).toContain("synthetic@utep.edu");
  expect(html).toContain("officer@example.com");
  expect(html).toContain(">UTEP</span>");
  expect(html).toContain(">Personal</span>");
});

it("groups Event details, files, and participation on flattened Event detail", async () => {
  const html = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  const details = html
    .split('aria-label="Event details"')[1]
    .split('aria-label="Participation"')[0];
  for (const text of [
    "Synthetic Room",
    "Meeting",
    "Resource links",
    "Slides",
    "Meeting notes",
    "Delete Event",
  ])
    expect(details).toContain(text);
  expect(details).toContain('rel="noopener noreferrer"');
  const participation = html.split('aria-label="Participation"')[1];
  expect(participation).toContain("Your participation:");
  expect(participation).toContain("No officers signed up.");
  expect(participation).toContain("No active officers are available to add.");
  expect(html).not.toContain("Event point history (0)");
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

it("shows historical presentations after an Event type edit without active controls", async () => {
  const meetingHtml = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  expect(meetingHtml).not.toContain('aria-label="Historical presentations"');
  expect(queryLog.some(({ table }) => table === "presentation_slots")).toBe(
    true,
  );

  const originalType = event.event_types;
  event.event_types = { name: "Workshop" };
  historicalPresentationRows = [
    {
      id: 61,
      position: 2,
      officer_id: 8,
      presentation_title: "Historical topic",
      difficulty: "Medium",
      resource_url: "https://example.org/history",
      prep_notes: "Historical preparation notes.",
      officers: { id: 8, name: "Historical Presenter" },
    },
  ];
  try {
    const sessionHtml = renderToStaticMarkup(
      await EventDetail({ params: Promise.resolve({ id: "7" }) }),
    );
    expect(sessionHtml).toContain('aria-label="Historical presentations"');
    expect(sessionHtml).toContain("Historical topic");
    expect(sessionHtml).toContain("Historical Presenter");
    expect(sessionHtml).toContain("Historical preparation notes.");
    for (const activeControl of [
      'aria-label="Time Slots"',
      "Step down",
      "Assign presenter",
      "Move up",
      "Edit details",
      "Add presenter slot",
    ]) {
      expect(sessionHtml).not.toContain(activeControl);
    }
    expect(queryLog).toContainEqual({
      table: "presentation_slots",
      method: "order",
      args: ["position", undefined],
    });
  } finally {
    event.event_types = originalType;
  }
});

it("renders the complete roster in database name order with signup removal available", async () => {
  const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Hotel"];
  eventRosterCount = names.length;
  eventRosterRows = names.map((name, index) => ({
    officer_id: index + 1,
    participation_type: "volunteer",
    officers: { id: index + 1, name, utep_email: null, personal_email: null },
  }));

  const html = renderToStaticMarkup(
    await EventDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ returnTo: "/events?status=past" }),
    }),
  );
  const roster = html.split('aria-label="Confirmed roster"')[1];
  expect(roster).toContain("Confirmed roster (6)");
  expect(roster.indexOf("Alpha")).toBeLessThan(roster.indexOf("Hotel"));
  expect(roster).toContain("Remove signup");
  expect(eventRosterOrderCalls).toEqual(["officers(name)", "officer_id"]);
});

it("keeps historical ordinary roster removal available only to managers", async () => {
  event.ends_at = "2020-10-09T01:00:00Z";
  event.starts_at = "2020-10-08T23:00:00Z";
  event.participation_points_per_hour_at_end = 1;
  eventRosterCount = 1;
  eventRosterRows = [
    { officer_id: 7, officers: { id: 7, name: "Synthetic Officer" } },
  ];
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 1,
    branchIds: [],
  } as never);

  const managerHtml = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  expect(managerHtml.split('aria-label="Confirmed roster"')[1]).toContain(
    "Remove signup",
  );

  vi.mocked(canManageEvent).mockReturnValue(false);
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 7,
    branchIds: [],
  } as never);
  const officerHtml = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  expect(officerHtml.split('aria-label="Confirmed roster"')[1]).toContain(
    "Closed",
  );
  expect(officerHtml.split('aria-label="Confirmed roster"')[1]).not.toContain(
    "Remove signup",
  );
});

it("shows the current Officer's signup removal in Participation", async () => {
  vi.mocked(getAuthorizationContext).mockResolvedValue({
    id: 99,
    branchIds: [],
  } as never);
  eventRosterCount = 3;
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
});

it("does not render the retired waitlist section or query its former table", async () => {
  const html = renderToStaticMarkup(
    await EventDetail({
      params: Promise.resolve({ id: "7" }),
      searchParams: Promise.resolve({ section: "waitlist" }),
    }),
  );

  expect(html).toContain('aria-label="Participation"');
  expect(html).not.toContain("Waitlist");
  expect(queryLog.some(({ table }) => table === "event_waitlist")).toBe(false);
});

it("renders all linked Tasks and keeps deleted linked Tasks non-clickable", async () => {
  eventTaskRows = [
    {
      task_id: 17,
      tasks: { id: 17, title: "Active linked Task", removed_at: null },
    },
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
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );

  expect(html).toContain("Linked Tasks (2)");
  expect(html).toContain("Active linked Task");
  expect(html).toContain('href="/tasks/17');
  expect(html).toContain("Deleted linked Task");
  expect(html).toContain("Deleted</span>");
  expect(html).not.toContain('href="/tasks/19"');
  expect(
    eventRelatedOrderCalls.filter(([table]) => table === "task_events"),
  ).toEqual([
    ["task_events", "tasks(title)"],
    ["task_events", "task_id"],
  ]);
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
    "Access level",
    "Total points",
    "Point history",
  ])
    expect(html).toContain(text);
  expect(html.match(/Application role/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Associated tasks"');
  expect(html).toContain('aria-label="Warnings"');
  expect(html).toContain("Create warning");
  expect(html).toContain('aria-labelledby="create-warning-title"');
  expect(html).toContain("This warning takes effect immediately");
  expect(html).toContain('aria-label="Associated events"');
  expect(html).toContain('href="/points?view=history&amp;officer=7"');
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
  expect(html).toContain("returnTo=%2Fofficers%3Fq%3Dsynthetic");
  expect(html).toContain('aria-label="Warning status"');
});

it("Point History record links carry the same filtered page into Officers, Events and Tasks", () => {
  const returnTo = "/points?q=workshop&type=task";
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
