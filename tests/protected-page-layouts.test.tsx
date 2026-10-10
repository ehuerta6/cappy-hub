import { beforeEach, expect, it, vi } from "vitest";
import { createElement, useActionState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
  event_waitlist: [],
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
  recurrence_series_id: 3,
  due_date: "2099-10-08",
};
let officersForList: Record<string, unknown>[];
beforeEach(() => {
  officersForList = [];
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    false,
  ] as never);
  vi.mocked(getAuthorizationContext).mockResolvedValue({ id: 1 } as never);
  vi.mocked(canManageEvent).mockReturnValue(true);
  vi.mocked(createClient).mockResolvedValue({
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        gt: () => query,
        gte: () => query,
        in: () => query,
        is: () => query,
        lt: () => query,
        lte: () => query,
        order: () => query,
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
            table === "officers" ? officer : table === "events" ? event : task,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: table === "officers" ? officersForList : [],
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
    searchParams: Promise.resolve({}),
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
  expect(assignmentRows?.[1]).toContain("History protected");
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
  expect(officerHtml).toContain("Your assignment: Not completed");
  expect(officerHtml).toContain("Not completed");
  expect(officerHtml).toContain("Completed");
  expect(officerHtml).not.toContain(
    'aria-label="Completed for Synthetic Officer"',
  );
  expect(officerHtml).not.toContain('aria-label="Completed for Other Officer"');
  expect(officerHtml).not.toContain("Remove assignment");
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

it("keeps all Officer directory columns distinct and marks the directory as wide", async () => {
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
    "UTEP email",
    "Personal email",
    "Position",
    "Classification",
    "Branches",
    "Status",
  ])
    expect(html).toContain(`>${heading}</th>`);
  expect(html).toContain("synthetic@utep.edu");
  expect(html).toContain("officer@example.com");
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
  expect(participation).toContain("Signed-up officers");
  expect(participation).toContain("No officers signed up.");
  expect(participation).not.toContain("<table");
  expect(participation).toContain("Add selected officers");
  expect(html).toContain("Event point history");
});

it("renders populated Event participation as a compact semantic table", async () => {
  Object.assign(event, {
    event_officers: [
      { officers: { id: 3, name: "Zulu Officer" } },
      { officers: { id: 2, name: "Alpha Officer" } },
      { officers: { id: 1, name: "Bravo Officer" } },
    ],
  });

  const html = renderToStaticMarkup(
    await EventDetail({ params: Promise.resolve({ id: "7" }) }),
  );
  const participation = html.split('aria-label="Participation"')[1];

  expect(participation).toContain(
    'class="overflow-x-auto rounded-lg border border-border table-frame--compact"',
  );
  expect(participation).toContain('<table class="min-w-full">');
  expect(participation).toContain(">Officer</th>");
  expect(participation).toContain(">Signup</th>");
  const signupRows = participation
    .split('<table class="min-w-full">')[1]
    .split("</table>")[0]
    .match(/<tr>[\s\S]*?<\/tr>/g);
  expect(signupRows).toHaveLength(4);
  expect(signupRows?.[1]).toContain("Alpha Officer");
  expect(signupRows?.[1]).toContain('name="officer_id" value="2"');
  expect(signupRows?.[1]).toContain("Remove signup");
  expect(signupRows?.[2]).toContain("Bravo Officer");
  expect(signupRows?.[2]).toContain('name="officer_id" value="1"');
  expect(signupRows?.[2]).toContain("Remove signup");
  expect(signupRows?.[3]).toContain("Zulu Officer");
  expect(signupRows?.[3]).toContain('name="officer_id" value="3"');
  expect(signupRows?.[3]).toContain("Remove signup");
  expect(participation).toContain("Remove signup");
  expect(participation).not.toContain("No officers signed up.");

  Object.assign(event, { event_officers: [] });
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
