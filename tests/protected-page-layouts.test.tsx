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
  canManageEvent: () => true,
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
import { getAuthorizationContext } from "@/lib/authorization";
import OfficerDetail from "@/app/(protected)/officers/[id]/page";
import OfficerEdit from "@/app/(protected)/officers/[id]/edit/page";
import EventDetail from "@/app/(protected)/events/[id]/page";
import EventEdit from "@/app/(protected)/events/[id]/edit/page";
import OfficersPage from "@/app/(protected)/officers/page";
import TasksPage from "@/app/(protected)/tasks/page";
import TaskDetail from "@/app/(protected)/tasks/[id]/page";
import {
  TaskWorkflow,
  taskStatus,
} from "@/app/(protected)/tasks/task-workflow";
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
  task_assignments: null,
};
beforeEach(() => {
  vi.mocked(useActionState).mockReturnValue([
    { error: "", success: "" },
    vi.fn(),
    false,
  ] as never);
  vi.mocked(getAuthorizationContext).mockResolvedValue({ id: 1 } as never);
  vi.mocked(createClient).mockResolvedValue({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        is: () => query,
        order: () => query,
        limit: () => query,
        single: async () => ({ data: { total_points: 12 }, error: null }),
        maybeSingle: async () => ({
          data:
            table === "officers" ? officer : table === "events" ? event : task,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
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

it("retains Task assignment, completion and separate approver controls", () => {
  const render = (
    assignment: Parameters<typeof TaskWorkflow>[0]["assignment"],
    canManage = false,
    actorId = 1,
  ) =>
    renderToStaticMarkup(
      createElement(TaskWorkflow, {
        task,
        assignment,
        actorId,
        canManage,
        officers: [],
      }),
    );
  expect(render(null)).toContain("Self-assign");
  expect(render(null)).not.toContain("Select officer");
  expect(render(null, true)).toContain("Select officer");
  const assigned = { officer_id: 1, completed_at: null, approved_at: null };
  expect(taskStatus(task, assigned)).toBe("Assigned");
  expect(render(assigned)).toContain("Mark complete");
  expect(render(assigned, true, 2)).not.toContain("Mark complete");
  const completed = { ...assigned, completed_at: "2026-10-08" };
  expect(taskStatus(task, completed)).toBe("Awaiting approval");
  expect(render(completed, true)).not.toContain(">Approve<");
  expect(render(completed, false, 2)).not.toContain(">Approve<");
  expect(render(completed, true, 2)).toContain(">Approve<");
  expect(taskStatus(task, { ...completed, approved_at: "2026-10-09" })).toBe(
    "Complete",
  );
});

it("does not add contextual Back links to Officer or Task main pages", async () => {
  expect(renderToStaticMarkup(await OfficersPage())).not.toContain("Back to");
  expect(renderToStaticMarkup(await TasksPage())).not.toContain("Back to");
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
    "Remove event",
  ])
    expect(details).toContain(text);
  expect(details).toContain('rel="noopener noreferrer"');
  const participation = html.split('aria-label="Participation"')[1];
  expect(participation).toContain("Your participation:");
  expect(participation).toContain("Signed-up officers");
  expect(participation).toContain("Add selected officers");
  expect(html).toContain("Event point history");
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
